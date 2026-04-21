# Chapter 8: Memory Optimization — Fitting More Model Into Less VRAM

## Learning Objectives

- Explain gradient checkpointing and activation checkpointing, and describe the exact compute-for-memory trade-off each makes
- Describe how gradient accumulation simulates large batch training on a GPU with limited VRAM
- Understand how CPU and NVMe offloading move data off the GPU and when that data returns
- Explain how FlashAttention avoids storing the full attention matrix using tiling and on-the-fly recomputation
- Describe how PagedAttention manages the KV cache during inference using operating system memory concepts

---

## Key Concepts

### 8.1 Recap

In Module 7, we learned how to spread training across many GPUs using data, tensor, pipeline, and 3D parallelism. Those techniques solve the problem of models that are *too large for any single GPU* by dividing work across many machines.

But not everyone has 512 H100s. Most practitioners work with one to eight GPUs and need to train models that are uncomfortably close to — or slightly over — their available VRAM. For this situation, **memory optimization** is the answer.

Memory optimization techniques don't add more hardware. Instead, they make smarter use of the hardware you already have — by recomputing things instead of storing them, by temporarily moving data off the GPU, and by redesigning algorithms to avoid creating large intermediate results in the first place.

This chapter covers seven techniques that every serious ML practitioner uses regularly. They can be combined — and often are.

---

### 8.2 What Eats GPU Memory During Training?

Before optimizing, we need to know what we're optimizing. During training, VRAM holds four main categories of data:

```
┌───────────────────────────────────────────────────────────────────┐
│                    VRAM DURING TRAINING                           │
│                                                                   │
│  ① MODEL PARAMETERS                                               │
│     The learned weights. 7B params in BF16 = ~14 GB.             │
│     Fixed size — you can't shrink this without changing the model.│
│                                                                   │
│  ② OPTIMIZER STATES                                               │
│     Adam stores 2 extra values per parameter (in FP32).          │
│     7B params → ~56 GB of optimizer states alone.                │
│     Largest single memory consumer in most training runs.        │
│                                                                   │
│  ③ GRADIENTS                                                      │
│     One gradient per parameter, computed in backward pass.       │
│     7B params in BF16 = ~14 GB. Needed until optimizer step.     │
│                                                                   │
│  ④ ACTIVATIONS                                                    │
│     Intermediate outputs of each layer, stored during forward    │
│     pass so backward pass can use them to compute gradients.     │
│     Size scales with batch size AND sequence length AND depth.   │
│     For large models with long sequences: can be 30–100+ GB.     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

Items ①②③ are relatively fixed given your model and optimizer. Item ④ — activations — is where most memory optimization techniques focus, because it's the most controllable and often the largest variable cost.

---

### 8.3 Gradient Checkpointing: Trading Compute for Memory

#### The Problem: Activations Stack Up

Imagine baking a layered cake. After you mix each layer of batter, you set it aside on the counter — you'll need it later to stack the cake. A 10-layer cake means 10 bowls sitting on your counter simultaneously.

Neural network training has exactly this problem. During the **forward pass**, each layer produces an **activation** — the output it computed from its input. These activations must be kept in VRAM during the entire forward pass, because the **backward pass** (computing gradients) needs them to figure out "how much did this layer contribute to the final error?"

For a deep model with large batch sizes and long sequences, this pile of stored activations can be enormous:

```
FORWARD PASS — activations accumulate:

Input → [Layer 1] → act₁ → [Layer 2] → act₂ → [Layer 3] → act₃ → Loss
                      ↓                   ↓                   ↓
                   stored              stored              stored
                   in VRAM            in VRAM             in VRAM

All activations held simultaneously while backward pass runs ↑
```

#### How Gradient Checkpointing Recomputes Activations: Step by Step

**Gradient checkpointing** (sometimes called **activation recomputation**) solves this by saving only a few strategically chosen activations — called **checkpoints** — and recomputing everything else on demand during the backward pass.

Think of it like a long road trip. Instead of memorizing every turn along the entire route (storing all activations), you write down just a handful of major landmarks (checkpoints). When you need to retrace a section, you drive from the nearest landmark and re-navigate that segment fresh.

Here's the exact step-by-step mechanics:

```
STANDARD TRAINING:

Forward:  In → L1 → [save act₁] → L2 → [save act₂] → L3 → [save act₃] → Loss
                       ↓                    ↓                    ↓
                    kept in VRAM         kept in VRAM         kept in VRAM

Backward: Loss → compute grad L3 (needs act₂) → compute grad L2 (needs act₁) → done

Memory: All 3 activations in VRAM simultaneously

────────────────────────────────────────────────────────────────────────

GRADIENT CHECKPOINTING (checkpoint every 2 layers):

Forward:  In → L1 → [checkpoint act₁] → L2 → [discard act₂] → L3 → Loss
                          ↓                        ↓
                       SAVE this              THROW AWAY
                       (kept in VRAM)         (not kept)

Backward, when gradient for L3 is needed:
  → Need act₂ (it was discarded!)
  → Re-run forward pass from checkpoint act₁ through L2 → recompute act₂
  → Now compute gradient for L3 using fresh act₂
  → Continue backward pass normally
```

The trade-off in numbers:

| Approach              | Memory for activations | Extra compute cost     |
|-----------------------|------------------------|------------------------|
| Standard (no checkpointing) | O(layers)         | 0% extra              |
| Checkpoint every layer | O(1) — near minimal   | ~33% extra compute    |
| Checkpoint every √N layers | O(√layers)      | ~33% extra compute    |
| Full recomputation     | O(1) — minimal         | ~100% extra compute   |

The most common setting — checkpoint every layer — reduces activation memory from proportional to model depth down to a near-constant small amount, at the cost of roughly **33% more forward pass computation** (each layer is run forward approximately 1.33 times on average). For memory-constrained training, this is almost always worth it.

**In PyTorch**, enabling gradient checkpointing for a model is often one line:

```python
model.gradient_checkpointing_enable()
```

Or for individual modules:

```python
from torch.utils.checkpoint import checkpoint
output = checkpoint(my_layer, input)  # this layer won't store activations
```

---

### 8.4 Activation Checkpointing: Which Layers to Checkpoint, and Why

The terms "gradient checkpointing" and "activation checkpointing" are often used interchangeably, but there's a useful distinction: **gradient checkpointing** refers to the general strategy; **activation checkpointing** refers to the specific choice of *which* layers to checkpoint.

Not all layers are equally expensive to store or equally cheap to recompute. A good checkpointing strategy is selective.

**Layers that are expensive to store (high activation memory):**

```
TRANSFORMER LAYER MEMORY BREAKDOWN (one layer, batch=32, seq_len=2048):

  Self-attention:
    Q, K, V matrices:    ~768 MB   ← very large, sequence × sequence
    Attention scores:   ~2048 MB   ← the full seq_len × seq_len matrix!
    After softmax:       ~512 MB

  Feedforward (FFN):
    First projection:    ~256 MB
    After activation:    ~256 MB
    Second projection:   ~128 MB

  LayerNorm outputs:      ~64 MB

  Total per layer:       ~4 GB (with sequence length 2048, batch 32)
  × 32 layers = ~128 GB activations alone for a 32-layer model!
```

The attention score matrix — the one that stores "how much should each token attend to every other token?" — is particularly expensive. It scales as **sequence length squared**, meaning doubling your sequence length quadruples the attention activation memory.

**Layers that are cheap to recompute:**

- **Layer normalization** — simple math, very fast
- **Activation functions** (ReLU, GELU, SiLU) — one operation per element, trivial
- **Dropout** — random zeroing, fast (just need to re-use the same random seed)

**Layers that are expensive to recompute:**

- **Attention** — the quadratic sequence × sequence computation is slow
- **Large matrix multiplications** — the core of feedforward layers

A smart activation checkpointing strategy checkpoints *after* the expensive-to-store, fast-to-recompute layers, and *before* the expensive-to-recompute layers. In practice, for transformers, checkpointing at each transformer block boundary is the standard approach — you store one activation tensor per block, and recompute the internals of each block during backward.

```
PRACTICAL TRANSFORMER CHECKPOINTING:

Block 0: [Attn → FFN] → ✓ CHECKPOINT (store output of block 0)
Block 1: [Attn → FFN] → ✓ CHECKPOINT (store output of block 1)
Block 2: [Attn → FFN] → ✓ CHECKPOINT
...

During backward for Block 2:
  → Recompute Block 2 forward from checkpoint of Block 1
  → All internal activations (attention scores etc.) temporarily exist
  → Use them to compute gradients
  → Free them immediately
  → Only checkpoint of Block 1 needed to recompute Block 2
```

Memory goes from storing *everything inside every block* to storing just *one tensor per block boundary* — a reduction of roughly 10–20× for typical transformer configurations.

---

### 8.5 Gradient Accumulation: Faking Big Batches on Small GPUs

#### The Problem: Batch Size vs. VRAM

Larger batch sizes generally help training stability (smoother gradient estimates, better use of parallelism). But larger batches require more activation memory — storing all those intermediate computations for a bigger chunk of data.

On a GPU with 24 GB VRAM, you might only be able to fit a batch of 8 samples. On a cluster of A100s, teams routinely train with effective batch sizes of 1,024, 4,096, or larger.

**Gradient accumulation** bridges this gap: it lets you *simulate* a large batch size by running multiple small batches and adding up their gradients before doing a single weight update.

#### How Gradient Accumulation Works

Normally, training looks like:

```
STANDARD TRAINING (batch size 32):
  ① Load 32 samples
  ② Forward pass → compute loss
  ③ Backward pass → compute gradients
  ④ Optimizer step → update weights
  ⑤ Clear gradients
  [Repeat]
```

With gradient accumulation over 4 steps (effective batch size = 4 × 8 = 32):

```
GRADIENT ACCUMULATION (micro-batch 8, accumulate 4 steps):
  ① Load 8 samples
  ② Forward pass → compute loss (÷ 4 to normalize)
  ③ Backward pass → compute gradients, ADD to gradient buffer (don't clear!)
  [Repeat steps ①–③ three more times with next 8 samples]
  ④ After 4 microbatches: optimizer step → update weights
  ⑤ NOW clear gradients
  [Repeat entire cycle]
```

The weight update in step ④ uses accumulated gradients that represent all 32 samples — identical (mathematically) to having processed all 32 at once.

```
MEMORY COMPARISON:

Batch 32 (no accumulation):
  Activations: 32 samples × activation_per_sample = large
  Peak VRAM: HIGH

Batch 8 × accumulate 4 (same effective batch):
  Activations: only 8 samples at a time = small
  Gradients: accumulate in buffer (same size as parameters, doesn't grow)
  Peak VRAM: 4× LOWER than batch 32
```

**The trade-off:** 4 accumulation steps takes roughly 4× as long as one step with the same batch size, because you do 4 forward-backward passes. The weight update only happens once, but the computation isn't free. You're not gaining speed — you're trading time to reduce peak memory.

**Where gradient accumulation shines:**

- Training on a single consumer GPU (RTX 4090, 24 GB) where batch size is tightly limited
- Matching a training recipe developed on a large cluster (same effective batch = similar dynamics)
- Combined with gradient checkpointing to squeeze maximum effective batch size from minimum VRAM

One subtle detail: when accumulating gradients, you must **divide the loss by the number of accumulation steps** before each backward pass. Otherwise the accumulated gradient is N times too large, leading to instability.

---

### 8.6 CPU Offloading: Moving Optimizer States to RAM

#### The Opportunity: RAM Is Cheap and Plentiful

A typical training workstation might have 24 GB of GPU VRAM — but 128 GB or even 256 GB of regular CPU RAM. CPU RAM is slower than VRAM, but for data that isn't needed every millisecond, that's fine.

**CPU offloading** exploits this by keeping the largest training components — most commonly **optimizer states** — in CPU RAM, and only bringing them to the GPU when needed.

Recall from section 8.2: for a 7B model, Adam's optimizer states require ~56 GB in FP32. That alone exceeds most single-GPU VRAM. But if you have 128 GB of RAM, you can keep optimizer states there, and the GPU only needs to hold the model weights (14 GB) and current-step gradients (14 GB).

#### CPU Offloading Mechanics: When Data Moves, When It Returns

Here's the exact data movement timeline during one training step with CPU offloading:

```
TRAINING STEP WITH CPU OFFLOADING:

        CPU RAM                              GPU VRAM
        ───────                              ────────
  [Optimizer states]                    [Model weights]
  [Entire step]                         [Activations]
  [Sitting in RAM]                      [Gradients]
        │                                     │
        │                                     │
  FORWARD PASS:                         ─────────────
  (CPU does nothing)                    Forward pass runs
  (optimizer states                     Activations stored
   stay in RAM)                         Loss computed
        │                                     │
        │                                     │
  BACKWARD PASS:                        ─────────────
  (CPU does nothing)                    Backward pass runs
  (optimizer states                     Gradients computed
   still in RAM)                        ↓
        │                               Gradients COPIED
        │ ◄─────────────────────────── to CPU RAM
        │                                     │
  OPTIMIZER STEP:                       ─────────────
  Adam update runs HERE                 GPU waits
  (on CPU, using CPU                    (doing nothing
  optimizer states +                     during this)
  gradients just received)
        │                                     │
        │ Updated weights ──────────────────► │
        │ COPIED to GPU VRAM                  │
        │                               Updated weights
  DONE: optimizer states                 now in GPU VRAM
  remain in CPU RAM                     ─────────────
  for next step
```

The key insight: the optimizer step — the most memory-intensive operation — runs entirely on CPU. The GPU is free during this time (or can start the data loading for the next batch). Updated weights travel back to GPU VRAM via the PCIe bus before the next forward pass.

**The trade-off:**

| Aspect                | Without Offloading     | With CPU Offloading              |
|-----------------------|------------------------|----------------------------------|
| GPU VRAM needed       | Params + Grads + Opt   | Params + Grads only              |
| Optimizer step speed  | Fast (GPU)             | Slower (CPU, ~5–20× slower)     |
| PCIe transfers        | None for optimizer     | Gradients → CPU, Weights → GPU  |
| Good when             | VRAM is plentiful      | VRAM is the bottleneck           |

For very large models where VRAM is the hard constraint, CPU offloading is worth the slower optimizer step. For smaller models where VRAM is comfortable, it's unnecessary overhead.

DeepSpeed's ZeRO-Offload (an extension to ZeRO Stage 2) automates CPU offloading, including asynchronous data transfers that overlap the PCIe communication with GPU computation.

---

### 8.7 NVMe Offloading: Using Your SSD as Overflow Memory

When even CPU RAM isn't enough, there's one more tier of storage available: **NVMe SSDs** (the fast solid-state drives in modern computers and servers).

NVMe SSDs are slower than RAM — reads take microseconds instead of nanoseconds — but they're *much* larger. A server might have 256 GB RAM but 8 TB of NVMe SSD. For parameters that are rarely accessed (like frozen layers or very deep model shards), this can unlock training runs that would otherwise be completely impossible.

```
MEMORY HIERARCHY (speed vs. capacity):

Speed:  ←────────────────────────────────────────────────────────────────
        GPU VRAM    CPU RAM    NVMe SSD    SATA SSD    Hard Drive
        ~2 TB/s    ~100 GB/s   ~7 GB/s     ~600 MB/s   ~150 MB/s

Capacity: ────────────────────────────────────────────────────────────────→
        24–80 GB    64–512 GB   1–8 TB      256 GB–4 TB  1–20 TB
```

DeepSpeed's **ZeRO-Infinity** extends offloading all the way to NVMe, using a custom I/O engine that reads and writes model data asynchronously (while the GPU is computing) to hide the latency as much as possible.

**When NVMe offloading makes sense:**

- Training a model that literally cannot fit anywhere else (e.g., a trillion-parameter experiment on limited hardware)
- Fine-tuning frozen layers of a very large model where the frozen parameters can be paged in from SSD only when needed

**The realistic limits:** NVMe offloading is slow enough that training throughput (steps per second) drops significantly. It's a last resort for exploratory experiments or fine-tuning, not for production training runs where time is money.

---

### 8.8 FlashAttention: The Memory-Efficient Attention Breakthrough

#### The Standard Attention Memory Problem

The attention mechanism — the core innovation of transformer models — has a serious memory problem. Let's see exactly why.

Standard attention computes a matrix where every token looks at every other token. For a sequence of length N, this produces an N × N matrix called the **attention score matrix**:

```
ATTENTION SCORE MATRIX (sequence length = 4096 tokens):

        Token 1  Token 2  Token 3  ...  Token 4096
Token 1  [0.2]   [0.5]   [0.1]   ...   [0.0]
Token 2  [0.1]   [0.3]   [0.4]   ...   [0.2]
Token 3  [0.0]   [0.1]   [0.6]   ...   [0.3]
...
Token 4096 [0.3]  [0.0]  [0.2]   ...   [0.5]

Size: 4096 × 4096 = 16,777,216 values
In FP16: 16M × 2 bytes = 32 MB per attention head
With 32 attention heads: 32 × 32 MB = 1 GB per layer per forward pass
With 32 layers: 32 GB — just for attention matrices!
```

And this scales with the **square** of sequence length. Going from 4K to 32K tokens? That's 64× more attention memory. Going to 128K tokens (common in modern long-context models)? 1,024× more.

This is why standard attention couldn't practically handle long sequences — the attention matrix alone would exhaust VRAM before any other computation.

#### How FlashAttention Avoids Materializing the Attention Matrix: Tiling and Recomputation

**FlashAttention**, introduced by Tri Dao and colleagues in 2022, solves this with two ideas working together: **tiling** and **on-the-fly recomputation**.

The key insight is: *you don't actually need the full attention matrix all at once*. You only need it to compute the weighted average of values. If you could compute small pieces of the output at a time, you'd never need the full matrix in VRAM.

**The tiling idea:**

Imagine computing the sum of 1,000 numbers, but you can only see 10 at a time. You can still get the right answer — you compute partial sums, keep track of them, and combine at the end. FlashAttention does this for attention scores:

```
STANDARD ATTENTION:
  Step 1: Compute FULL Q×K matrix (size N×N)    ← stored in VRAM
  Step 2: Apply softmax to full matrix            ← stored in VRAM
  Step 3: Multiply by V to get output             ← final result

  Memory: O(N²) — grows with sequence length squared

FLASHATTENTION (tiled):
  Split Q, K, V into small blocks (tiles) that fit in GPU's fast cache

  For each tile of Q:
    For each tile of K and V:
      ① Load small Q block and K block into fast cache (SRAM)
      ② Compute attention scores for just this tile (small matrix)
      ③ Update running softmax statistics (just a few numbers)
      ④ Accumulate partial output — then discard the tile scores
  
  Final result assembled from partial accumulations

  Memory: O(N) — grows linearly, not quadratically!
```

The critical detail: FlashAttention keeps intermediate attention tiles in the GPU's **SRAM** (the very fast on-chip cache, not the off-chip VRAM), computes with them, and discards them — never writing the full N×N matrix to VRAM at all.

**The recomputation trick:**

But gradient checkpointing showed us that if you discard intermediates, you have to recompute them during the backward pass. Doesn't that make FlashAttention slow?

Here's the elegant part: FlashAttention stores just a tiny amount of information during the forward pass — specifically, the **softmax normalization constants** (a vector of N numbers, one per token). During the backward pass, these constants are used to recompute the attention tiles exactly as needed, without storing the full attention matrix.

```
FLASHATTENTION BACKWARD PASS:

What was saved during forward:
  - Output O (the final attention result) — needed anyway
  - Softmax statistics L (one number per token, size N) — tiny!

What gets recomputed tile-by-tile:
  - Attention scores for each tile (computed on-the-fly, immediately used)
  - Softmax weights for each tile (recomputed using saved statistics)

Memory during backward: O(N) — same as forward
```

The result:

| Method           | Memory       | Speed vs. standard | Max sequence (80 GB VRAM) |
|------------------|-------------|-------------------|---------------------------|
| Standard Attention | O(N²)     | 1×                | ~8K tokens                |
| FlashAttention 1 | O(N)        | 2–4× faster       | ~128K tokens              |
| FlashAttention 2 | O(N)        | 5–9× faster       | ~128K+ tokens             |
| FlashAttention 3 | O(N)        | Up to 16× faster  | Same (optimized for H100) |

FlashAttention is faster *and* uses less memory — because SRAM access is much faster than VRAM access, doing computation in tiles actually improves GPU hardware utilization. This is rare in computing: a technique that wins on both dimensions simultaneously.

FlashAttention is now essentially universal in transformer training — it's the default in HuggingFace, PyTorch's `scaled_dot_product_attention`, and most modern training frameworks.

---

### 8.9 xFormers and Memory-Efficient Attention Variants

**xFormers** is Meta's open-source library of modular, optimized transformer building blocks, with a focus on memory and compute efficiency. It's less a single technique and more a toolkit of alternatives.

The most-used component is xFormers' own memory-efficient attention implementation, which achieves similar goals to FlashAttention (avoiding the full N×N matrix) through a different implementation strategy — it was the dominant approach before FlashAttention's tiling insight and is still used in some contexts.

Other xFormers components:

| Component                  | What It Does                                               |
|----------------------------|-----------------------------------------------------------|
| Memory-efficient attention | Avoids materializing full attention matrix (pre-FA)        |
| Sparse attention patterns  | Only attend to nearby tokens or fixed subsets (local attn) |
| Block-sparse attention     | Structured sparsity for long sequences                    |
| Fused ops                  | Custom CUDA kernels that combine multiple ops into one     |

In practice, since FlashAttention became the standard, xFormers is primarily used for its sparse attention variants (useful when you want to restrict which tokens can attend to which other tokens for efficiency or architectural reasons) and as a source of fused operations.

---

### 8.10 PagedAttention: Managing KV Cache Like an OS Manages Memory

FlashAttention solves the *training* attention memory problem. **PagedAttention** solves a different but related problem that appears during *inference* (running a deployed model to generate responses).

#### The KV Cache Problem in Inference

When a language model generates text, it doesn't start from scratch for each new token. It caches the computed **keys** and **values** (the K and V in attention) from all previous tokens — this is the **KV cache**. Without caching, generating a 1,000-token response would require re-computing attention over all previous tokens for every single new token, making inference impossibly slow.

But the KV cache creates a memory problem:

- Each token in the conversation requires KV cache storage
- Different conversations (different users) have different lengths
- You don't know in advance how long a response will be

Standard inference systems reserved a fixed block of VRAM for each conversation's KV cache — sized for the *maximum possible* response length. This meant:

```
NAIVE KV CACHE ALLOCATION:

Conversation A (will actually be 100 tokens): Reserve 2048 tokens of KV cache
Conversation B (will actually be 50 tokens):  Reserve 2048 tokens of KV cache
Conversation C (will actually be 1500 tokens): Reserve 2048 tokens of KV cache

VRAM wasted (pre-allocated but unused):
  A: 1948/2048 = 95% wasted
  B: 1998/2048 = 98% wasted
  C:  548/2048 = 27% wasted

Average waste: ~73% of KV cache VRAM unused at any time!
```

This drastically limited how many conversations a server could handle simultaneously.

#### How PagedAttention Manages KV Cache Like an OS Manages Memory

**PagedAttention**, the core innovation in the **vLLM** inference engine (introduced by Kwon et al. at UC Berkeley in 2023), borrows an idea from operating systems: **virtual memory with paging**.

When your computer's RAM fills up, the OS doesn't crash — it uses a system where RAM is divided into fixed-size pages (typically 4 KB), and pages belonging to different programs are interleaved. A program doesn't get one contiguous chunk of RAM — it gets a collection of pages scattered wherever there's space, tracked by a page table.

PagedAttention applies this exact idea to the KV cache:

```
PAGED ATTENTION CONCEPT:

KV cache blocks (like OS memory pages):
  Block 1: [Token 1–16 KV data]   ← belongs to Conversation A
  Block 2: [Token 1–16 KV data]   ← belongs to Conversation B
  Block 3: [Token 17–32 KV data]  ← belongs to Conversation A
  Block 4: [Token 1–16 KV data]   ← belongs to Conversation C
  Block 5: [Token 17–32 KV data]  ← belongs to Conversation B
  Block 6: [FREE]
  Block 7: [Token 33–48 KV data]  ← belongs to Conversation A
  Block 8: [FREE]
  ...

Each conversation gets pages allocated dynamically as it grows.
Page table maps conversation → list of block IDs.
No pre-allocation needed.
```

The key properties this enables:

**1. No waste from pre-allocation.** Pages are allocated one by one as tokens are generated. A 50-token conversation uses exactly 50 tokens worth of KV cache, not 2048.

**2. No fragmentation waste.** Because blocks are fixed size and interleaved, even small gaps between conversations don't waste space.

**3. Sharing across requests (prefix caching).** If two conversations start with the same system prompt (very common in production), their KV cache for those shared tokens can literally be the *same pages in memory* — one copy shared between multiple conversations. This is called **prefix caching** and can reduce KV cache usage dramatically in production.

```
WITHOUT PAGEDATTENTION:
  100 concurrent users, max 2048 tokens each
  VRAM needed: 100 × 2048 = 204,800 token KV slots
  Actual usage: ~15,000 tokens (most conversations short)
  Waste: ~93%

WITH PAGEDATTENTION:
  100 concurrent users, actual usage: ~15,000 tokens
  VRAM needed: ~15,000 token KV slots + small overhead
  Throughput improvement: ~5–10× more concurrent users
```

This is why vLLM (which uses PagedAttention) became the dominant inference engine for serving large language models — it multiplied serving throughput dramatically without changing the model at all.

---

### 8.11 How the Techniques Combine

These memory optimization techniques aren't mutually exclusive. Real training runs typically use several simultaneously:

```
TYPICAL MEMORY-OPTIMIZED TRAINING STACK:

  Gradient checkpointing     ← cuts activation memory 10–20×
  + Gradient accumulation    ← allows larger effective batch size
  + Mixed precision (BF16)   ← cuts parameter/gradient memory 2×
  + ZeRO Stage 2             ← shards gradients + optimizer states
  + CPU offloading           ← moves optimizer states to RAM
  + FlashAttention           ← eliminates quadratic attention memory
  ─────────────────────────────────────────────────────
  Combined effect: can train a 7B model on a single 24 GB consumer GPU
  (vs. ~84 GB required with no optimization at all)
```

The order to apply them (roughly by impact-to-complexity ratio):

1. **Mixed precision (BF16/FP16)** — almost free, always do this
2. **FlashAttention** — also nearly free, essential for long sequences
3. **Gradient checkpointing** — easy to enable, big memory savings
4. **Gradient accumulation** — adjust batch size strategy
5. **ZeRO stages** — requires DeepSpeed or FSDP setup
6. **CPU offloading** — adds complexity, slower but enables larger models
7. **NVMe offloading** — last resort for extreme cases

---

## Assessment

### Q1: During a standard forward pass, why does PyTorch store activations from every layer?

- [ ] To display them in the training dashboard for debugging
- [ ] Because activations are the final output and need to be returned to the user
- [x] The backward pass needs activations to compute gradients — each layer's gradient calculation requires knowing what that layer's input was during the forward pass
- [ ] Activations are stored as a safety backup in case the forward pass needs to be repeated

### Q2: Gradient checkpointing reduces activation memory at what cost?

- [ ] It reduces model accuracy because some gradients are approximated
- [x] It increases total computation by approximately 33% — discarded activations must be recomputed during the backward pass, meaning each layer runs forward roughly 1.33 times on average
- [ ] It requires more GPU VRAM for gradient storage to compensate
- [ ] It slows down the optimizer step because gradients are less accurate

### Q3: A team uses gradient accumulation with micro-batch size 4 and accumulates over 8 steps. What is their effective batch size, and what must they do to each microbatch loss before calling backward?

- [ ] Effective batch size 4; divide loss by 4
- [ ] Effective batch size 32; no adjustment needed
- [x] Effective batch size 32 (4 × 8); divide each microbatch loss by 8 (the number of accumulation steps) to ensure the accumulated gradient matches what a true batch of 32 would produce
- [ ] Effective batch size 8; multiply loss by 4

### Q4: In CPU offloading, during which phase of the training step is the GPU completely idle?

- [ ] During the forward pass, while activations are being computed
- [ ] During the data loading phase, while the DataLoader fetches batches
- [x] During the optimizer step — because the optimizer runs on CPU using the gradients that were transferred there, the GPU has no computation to do until updated weights are sent back
- [ ] During the backward pass, because gradients are computed on CPU

### Q5: FlashAttention achieves O(N) memory instead of O(N²). What is the key reason the full N×N attention matrix never needs to be stored in VRAM?

- [ ] FlashAttention uses sparse attention and skips most token pairs
- [ ] FlashAttention compresses the attention matrix using quantization before storing it
- [x] FlashAttention processes attention in small tiles that fit in the GPU's on-chip SRAM cache, computes partial outputs from each tile, and discards the tile's scores before moving to the next — accumulating the final output without ever materializing the full matrix
- [ ] FlashAttention approximates the attention operation using a smaller matrix

### Q6: A language model serving system handles 200 simultaneous conversations. Without PagedAttention, each conversation reserves a KV cache for 4,096 tokens. Average actual usage is 300 tokens. What percentage of KV cache VRAM is wasted?

- [ ] 7.3% wasted (300/4096)
- [ ] 50% wasted (typical fragmentation)
- [x] ~92.7% wasted — (4096 − 300) / 4096 ≈ 0.927 or 92.7% of each reservation is unused
- [ ] 0% — inference systems always pack KV cache efficiently

### Q7: You are training a 13B parameter model on two RTX 4090 GPUs (24 GB each = 48 GB total). In BF16, parameters alone are 26 GB. Adam optimizer states add ~52 GB in FP32. Which combination of techniques would most plausibly make this fit?

- [ ] Gradient accumulation + FlashAttention — these reduce parameter and optimizer memory
- [x] ZeRO Stage 2 or 3 (shards gradients and optimizer states across GPUs) + gradient checkpointing (cuts activation memory) + FlashAttention (cuts attention memory) — together these can bring 48 GB within reach
- [ ] Gradient checkpointing alone — this eliminates optimizer state memory
- [ ] CPU offloading alone — this eliminates all VRAM requirements except activations

### Q8: Why is FlashAttention often *faster* than standard attention, not just more memory-efficient?

- [ ] FlashAttention uses lower precision (INT8) for attention scores, which is faster to compute
- [ ] FlashAttention skips unnecessary attention computations for padding tokens
- [x] By keeping tiles in on-chip SRAM (which is much faster than VRAM), FlashAttention dramatically reduces slow memory reads and writes — the GPU's compute units spend more time computing and less time waiting for memory
- [ ] FlashAttention parallelizes across both the sequence and batch dimensions simultaneously

---

## Exercise

### Exercise 1: Calculate Your Activation Memory

A transformer model has the following properties:
- 24 layers
- Sequence length: 4,096 tokens
- Batch size: 16
- Hidden dimension: 4,096
- 32 attention heads
- Stored in BF16 (2 bytes per value)

**Part A:** Estimate the activation memory for the attention score matrices alone (the N×N matrix per head per layer). Use: attention matrix size = sequence_length × sequence_length × bytes × num_heads × num_layers.

**Part B:** With gradient checkpointing at every layer boundary, the activations stored between layers are roughly: batch × sequence_length × hidden_dim × bytes. Calculate this per-checkpoint tensor size and total storage for all 24 checkpoints.

**Part C:** Compare Part A and Part B. By how many times does gradient checkpointing reduce the attention-related activation memory?

Write your calculations step by step, and write 2–3 sentences explaining what the model is "giving up" and "getting back" when checkpointing is enabled.

**Submission Type:** text

---

### Exercise 2: Design a Memory Strategy

You have a single NVIDIA RTX 3090 GPU with 24 GB VRAM. You want to fine-tune a 7B parameter model (LLaMA-3 7B) using BF16.

Baseline memory requirements (no optimization):
- Parameters: 14 GB (7B × 2 bytes)
- Gradients: 14 GB
- Adam optimizer states: 56 GB (in FP32)
- Activations (batch 8, seq 2048): ~18 GB
- **Total: ~102 GB** — far exceeds 24 GB

Apply memory optimizations in order. For each one, estimate the new total and note any trade-off:

1. Enable mixed precision training (already in BF16 for params — but optimizer can stay FP32 with master weights)
2. Enable gradient checkpointing (reduces activations to ~2 GB)
3. Use LoRA fine-tuning (only 0.1% of parameters have full gradients — ~0.014 GB gradients, ~0.056 GB optimizer states)
4. Enable CPU offloading for optimizer states

At each step, recalculate approximate VRAM usage and state whether it fits in 24 GB yet. Write 3–5 sentences explaining which single optimization had the largest impact and why.

**Submission Type:** text

---

### Exercise 3: The Sequence Length Challenge

A research team is experimenting with long-context models. They have 80 GB of VRAM (one H100) and want to understand the limits of different attention implementations.

The attention score matrix for one layer (one forward pass) uses:
```
memory = seq_len × seq_len × num_heads × bytes_per_value
```

For their model: 32 heads, BF16 (2 bytes), 32 layers total.

1. Calculate the attention matrix memory at sequence lengths: 4K, 16K, 32K, 64K, 128K tokens.
2. At which sequence length does standard attention's matrix storage alone exceed 80 GB?
3. With FlashAttention (O(N) memory, approximated as seq_len × num_heads × 128 bytes per layer for tiling buffers), recalculate the attention memory at each sequence length.
4. Write 3–5 sentences explaining why long-context models (128K+ tokens) essentially require FlashAttention — not just for efficiency, but for basic feasibility.

**Submission Type:** text

---

### Exercise 4: PagedAttention in the Wild

You are running a customer service chatbot using a deployed language model. Your system has 80 GB of VRAM. Each KV cache token slot costs 512 bytes. 

**Without PagedAttention:**
The system pre-allocates KV cache for 8,192 tokens per conversation (the maximum allowed response). You want to serve 100 concurrent users.

1. How much VRAM do you need for KV cache alone?
2. Does it fit in 80 GB alongside the model weights (~14 GB for a 7B model)?

**With PagedAttention:**
Average actual conversation length is 600 tokens. Prefix caching saves 30% of that (shared system prompt).

3. What is the effective average KV cache per user after prefix caching?
4. How much VRAM does 100 users actually need now?
5. Roughly how many concurrent users could you serve in 80 GB − 14 GB (model weights) of KV cache?

Write 3–5 sentences reflecting on what PagedAttention changed for the business — not just technically, but in terms of server costs and number of users served per dollar.

**Submission Type:** text