# Chapter 7: Distributed Training — Running AI Across Many Machines

## Learning Objectives

- Describe the difference between single-node multi-GPU and multi-node multi-GPU training, and why the distinction matters
- Explain what process groups, ranks, and world size mean using real-world analogies
- Understand how PyTorch's torch.distributed, DeepSpeed, and FSDP each approach the memory and communication problem differently
- Explain how DeepSpeed ZeRO partitions optimizer states, gradients, and parameters across GPUs
- Describe what a pipeline "bubble" is and why it exists in pipeline parallelism
- Identify how 3D parallelism combines data, model, and pipeline parallelism in practice

---

## Key Concepts

### 7.1 Recap

In Module 6, we learned about parallelism strategies for training models that are too large or too slow for a single GPU:

- **Data parallelism** (Chapter 28) — copy the model to many GPUs, split the data
- **Model parallelism** (Chapter 29) — split the model across GPUs
- **Pipeline parallelism** (Chapter 30) — split the model by layers, pass activations forward
- **Tensor parallelism** (Chapter 31) — split individual layers across GPUs
- **ZeRO** (Chapters 32–33) — shard optimizer states, gradients, and weights to save memory

Now we zoom out to the full picture: how do you coordinate *hundreds or thousands* of GPUs across *multiple physical machines*? That's distributed training — and it's what makes today's frontier models possible.

---

### 7.2 Single-Node vs. Multi-Node: Why the Gap Matters

A **node** is one physical computer — one server with its GPUs, its CPU, its RAM, and its storage. You might have 8 GPUs inside that one server.

**Single-node multi-GPU** means all your GPUs live inside the same box. They're connected by fast internal links (NVLink or PCIe). Communication between them is measured in microseconds. You can fit up to 8 GPUs in most server configurations, or up to 16 in very large systems.

**Multi-node multi-GPU** means your GPUs are spread across multiple separate computers, connected by a network cable. Even the fastest networking (InfiniBand, which we'll cover in Chapter 36) is slower than the internal GPU connections inside a single server.

```
SINGLE-NODE (one server):
┌──────────────────────────────────────────────────────────┐
│                       SERVER                             │
│  GPU0 ──NVLink── GPU1 ──NVLink── GPU2 ──NVLink── GPU3   │
│  GPU4 ──NVLink── GPU5 ──NVLink── GPU6 ──NVLink── GPU7   │
│                                                          │
│  Bandwidth: ~900 GB/s (NVLink 4.0)                       │
│  Latency: ~1 microsecond                                 │
└──────────────────────────────────────────────────────────┘

MULTI-NODE (two servers, networked):
┌─────────────────────┐       Network Cable      ┌─────────────────────┐
│      SERVER A       │ ◄──── InfiniBand ──────► │      SERVER B       │
│  GPU0 GPU1 GPU2 GPU3│       ~200 GB/s           │  GPU4 GPU5 GPU6 GPU7│
│                     │       ~5 microseconds     │                     │
└─────────────────────┘                           └─────────────────────┘
```

The network between nodes is the bottleneck. Every gradient or activation that has to cross that wire takes longer than one that stays within a node. This means the *way* you split your model across machines matters enormously — ideally, you keep the most communication-heavy operations within a single node, and only cross the network for lower-frequency operations.

**The scale difference is dramatic:**

| Setup             | Max GPUs   | Typical Use Case                          |
|-------------------|------------|-------------------------------------------|
| Single node       | 8–16 GPUs  | 7B–13B models, research experiments       |
| 2–8 nodes         | 16–64 GPUs | 30B–70B models, serious training runs     |
| 8–64 nodes        | 64–512 GPUs| 100B+ models, frontier research           |
| 100s of nodes     | 1000–10000+| GPT-4 scale, industrial training          |

Training GPT-4 reportedly used around 25,000 A100 GPUs running for months. Coordinating that many machines reliably — with any one of them potentially failing at any time — is itself a major engineering challenge.

---

### 7.3 Process Groups, Ranks, and World Size

Before any distributed training can happen, all the participating GPUs need to know *who they are* and *who they're talking to*. The system for organizing this uses three concepts: **process groups**, **ranks**, and **world size**.

Think of it like organizing a very large theater production:

- **World size** = the total number of actors in the production (total number of GPU processes)
- **Rank** = each actor's unique ID number (0, 1, 2, ... up to world_size − 1)
- **Process group** = a specific cast of actors who need to rehearse together (a subset of GPUs that communicate with each other)

```
WORLD SIZE = 8 GPUs

Rank 0   Rank 1   Rank 2   Rank 3   Rank 4   Rank 5   Rank 6   Rank 7
 GPU0     GPU1     GPU2     GPU3     GPU4     GPU5     GPU6     GPU7

Example process groups:
  Data parallel group A: {Rank 0, Rank 4}  ← same model layer, different data
  Data parallel group B: {Rank 1, Rank 5}
  Tensor parallel group: {Rank 0, Rank 1, Rank 2, Rank 3}  ← same data, split layer
```

Every GPU knows its own rank and the world size. When it needs to communicate with other GPUs — to average gradients, to send activations — it sends to specific ranks within a specific process group.

**Rank 0** is special: it's conventionally the "leader." It typically handles logging, saving checkpoints, and printing progress to the screen. The other ranks do their work silently.

When you run distributed training, you launch one Python process per GPU. Each process starts, figures out its rank, and joins the coordination system (called the **process group initialization**). After that, every PyTorch operation that involves communication automatically knows which other processes to talk to.

---

### 7.4 torch.distributed: PyTorch's Multi-GPU Toolkit

**torch.distributed** is PyTorch's built-in library for multi-GPU and multi-node communication. It's the foundation that everything else — DDP, FSDP, and third-party tools — is built on top of.

Think of torch.distributed as the **postal service** for GPU training. It doesn't decide *what* gets sent or *why* — it just provides reliable ways to send data between processes. The higher-level frameworks use it like a building block.

The core operations torch.distributed provides:

```
BROADCAST: One GPU sends the same data to all others
  Rank 0 has [1, 2, 3] → All ranks receive [1, 2, 3]
  Used for: sharing initial model weights at startup

ALL-REDUCE: Every GPU contributes data, all receive the combined result
  Rank 0: [2, 4]               All ranks receive:
  Rank 1: [6, 2]  → average →  [4, 3]
  Rank 2: [4, 3]
  Used for: averaging gradients in data parallelism

ALL-GATHER: Each GPU contributes a piece, all receive the full collection
  Rank 0: [A]                  All ranks receive:
  Rank 1: [B]    → collect →   [A, B, C, D]
  Rank 2: [C]
  Rank 3: [D]
  Used for: FSDP collecting sharded weights

REDUCE-SCATTER: Opposite of all-gather — reduce first, then distribute pieces
  All contribute full data → each gets one reduced shard
  Used for: ZeRO gradient sharding
```

**DDP (Distributed Data Parallel)** is the standard wrapper that uses torch.distributed under the hood. You wrap your model in DDP, and it automatically handles gradient synchronization after every backward pass — the all-reduce happens without you thinking about it.

#### Gradient Bucketing in DDP

Here's a detail that makes DDP significantly faster in practice: **gradient bucketing**.

Imagine you need to mail 10,000 small packages from New York to Los Angeles. You could send them one by one — but each package has its own pickup fee, handling time, and truck trip overhead. Or you could group them into large boxes, and send 50 big shipments instead.

DDP does exactly this. Instead of launching one all-reduce per gradient (which would mean thousands of tiny network messages per training step), it groups gradients into **buckets** — typically around 25 MB each — and launches one all-reduce per bucket.

```
WITHOUT BUCKETING (slow):
  Gradient 1 → all-reduce (network trip 1)
  Gradient 2 → all-reduce (network trip 2)
  Gradient 3 → all-reduce (network trip 3)
  ... (thousands of small trips)

WITH BUCKETING (fast):
  Gradients 1–500  → pack into bucket → all-reduce (network trip 1)
  Gradients 501–1000 → pack into bucket → all-reduce (network trip 2)
  ... (tens of large trips instead of thousands of small ones)
```

There's a clever trick: DDP starts all-reducing the *earlier* buckets while the backward pass is still computing gradients for *later* layers. By the time the backward pass finishes, most of the gradient communication has already happened in parallel. This **communication-computation overlap** is one of the reasons DDP is efficient.

The bucket size (default 25 MB) is tunable. Larger buckets mean fewer network trips but more waiting before each trip can start. Smaller buckets overlap more with compute but have more overhead. The default works well in most cases.

---

### 7.5 DeepSpeed: Microsoft's Optimization Library

**DeepSpeed** is an open-source library released by Microsoft in 2020 that dramatically reduces the memory required to train large models. It's built on top of torch.distributed and is best known for its **ZeRO** (Zero Redundancy Optimizer) system, which we introduced in Chapter 32.

Let's now go deeper into *exactly* what ZeRO does — specifically, how it decides who holds what, and when.

#### How DeepSpeed ZeRO Partitions: Who Holds What, When

During training, a model's memory usage breaks into four categories:

```
┌────────────────────────────────────────────────────────────────┐
│                    TRAINING MEMORY BREAKDOWN                   │
│                                                                │
│  ① Model Parameters (weights)    — the model itself           │
│  ② Gradients                     — computed during backward   │
│  ③ Optimizer States              — e.g., Adam's momentum vars  │
│  ④ Activations                   — intermediate layer outputs  │
│                                                                │
│  For a 7B param model in mixed precision:                      │
│  ① Params:    14 GB  (7B × 2 bytes in BF16)                   │
│  ② Gradients: 14 GB  (same count, same size)                  │
│  ③ Optimizer: 56 GB  (Adam needs 4× the params in FP32!)      │
│  ④ Activations: varies (depends on batch size and architecture)│
│                                                                │
│  Total: ~84 GB just for items ①②③ — more than one H100!      │
└────────────────────────────────────────────────────────────────┘
```

ZeRO eliminates this redundancy by partitioning these components across GPUs, in three stages:

**ZeRO Stage 1 — Partition Optimizer States**

In standard training, every GPU holds a complete copy of the optimizer states (e.g., Adam's two momentum variables per parameter). This is pure redundancy — all GPUs will compute the *same* optimizer update to the *same* weights.

Stage 1 says: *let's split the optimizer states*. GPU 0 is responsible for updating parameters 0–N/4, GPU 1 for N/4–N/2, and so on. Each GPU only stores optimizer states for its assigned slice.

```
BEFORE STAGE 1 (4 GPUs, all redundant):
  GPU0: [Optimizer states for ALL params] 56 GB
  GPU1: [Optimizer states for ALL params] 56 GB
  GPU2: [Optimizer states for ALL params] 56 GB
  GPU3: [Optimizer states for ALL params] 56 GB

AFTER STAGE 1 (partitioned):
  GPU0: [Optimizer states for params 0–25%] 14 GB ← 4× less!
  GPU1: [Optimizer states for params 25–50%] 14 GB
  GPU2: [Optimizer states for params 50–75%] 14 GB
  GPU3: [Optimizer states for params 75–100%] 14 GB
```

After the backward pass, a reduce-scatter operation sends each GPU the gradients it needs for its slice. Each GPU runs the optimizer update for its slice, then a broadcast shares the updated weights with everyone.

**ZeRO Stage 2 — Also Partition Gradients**

Stage 2 adds gradient partitioning. After computing gradients during the backward pass, instead of every GPU holding all gradients, each GPU only keeps the gradients it will actually use (the ones for its optimizer slice).

```
STAGE 2 removes:
  Gradients: 14 GB per GPU → 14 GB / N GPUs per GPU
```

Combined savings with 8 GPUs: optimizer (7×) + gradients (8×) reduction.

**ZeRO Stage 3 — Also Partition Parameters**

Stage 3 goes all the way: even the model weights themselves are split. Each GPU holds only its assigned shard of parameters.

```
STAGE 3: Each GPU holds only 1/N of the model
  GPU0: [Params 0–25%, their gradients, their optimizer states]
  GPU1: [Params 25–50%, their gradients, their optimizer states]
  GPU2: [Params 50–75%, their gradients, their optimizer states]
  GPU3: [Params 75–100%, their gradients, their optimizer states]
```

This creates a problem: during the forward pass, each layer needs *all* the parameters for that layer — not just its shard. So during the forward pass, whenever a layer's parameters are needed, ZeRO Stage 3 performs an **all-gather** to temporarily reconstruct the full parameters on all GPUs, uses them, then immediately frees them.

```
STAGE 3 FORWARD PASS (one layer at a time):
  ① All-gather: GPU0 broadcasts its param shard → all GPUs have full layer
  ② All GPUs compute forward pass through this layer
  ③ Free the gathered params (don't keep them — saves memory)
  ④ Move to next layer, repeat
```

This means Stage 3 has more communication (all-gathers during forward AND backward) but dramatically less memory per GPU. For models that don't fit at all otherwise, Stage 3 is what makes them trainable.

**ZeRO Stage summary:**

| Stage | Partitions             | Memory per GPU (7B model, 8 GPUs) | Communication cost |
|-------|------------------------|-----------------------------------|--------------------|
| 0     | Nothing (standard DDP) | ~84 GB                            | Low                |
| 1     | Optimizer states       | ~30 GB                            | Low                |
| 2     | + Gradients            | ~16 GB                            | Moderate           |
| 3     | + Parameters           | ~2–4 GB                           | High               |

DeepSpeed also includes other optimizations beyond ZeRO: CPU offloading (moving optimizer states to CPU RAM when GPU VRAM is full), NVMe offloading (moving to fast SSDs), and mixed-precision training management.

---

### 7.6 FSDP: PyTorch's Answer to ZeRO

**FSDP** (Fully Sharded Data Parallel) is PyTorch's native implementation of the ZeRO Stage 3 idea, introduced in PyTorch 1.12. It achieves the same parameter sharding as ZeRO Stage 3 but is built directly into PyTorch rather than requiring a separate library.

#### How FSDP Shards Parameters: Forward, Backward, and the Lifecycle

FSDP wraps individual layers (or groups of layers) rather than the whole model at once. Each wrapped unit is called an **FSDP unit**, and each unit manages its own parameter lifecycle independently.

Here's the full lifecycle of one FSDP unit during a training step:

```
FSDP UNIT LIFECYCLE:

┌──────────── FORWARD PASS ────────────┐
│                                      │
│  Unit is "inactive" — only holds     │
│  its own 1/N parameter shard         │
│         ↓                            │
│  ALLGATHER: Collect all shards       │
│  → Full parameters temporarily exist │
│         ↓                            │
│  Compute forward (use full params)   │
│         ↓                            │
│  FREE gathered params (save memory)  │
│  → Back to holding only 1/N shard    │
│                                      │
└──────────── BACKWARD PASS ───────────┘
│                                      │
│  ALLGATHER again (need full params   │
│  to compute gradients correctly)     │
│         ↓                            │
│  Compute backward (get gradients)    │
│         ↓                            │
│  REDUCE-SCATTER: Average gradients   │
│  → Each GPU keeps only its shard     │
│  FREE gathered params again          │
│                                      │
└──────────── OPTIMIZER STEP ──────────┘
│                                      │
│  Each GPU updates only its own       │
│  parameter shard using local grads   │
│  (no communication needed here!)     │
│                                      │
└──────────────────────────────────────┘
```

The key insight: FSDP *never* keeps the full model in memory at once. Parameters are gathered just-in-time for computation, then immediately freed. The GPU only holds its shard plus one layer's worth of full parameters at any moment — and only during that layer's computation window.

**FSDP vs. ZeRO Stage 3 — practical differences:**

| Aspect                  | DeepSpeed ZeRO Stage 3          | PyTorch FSDP                        |
|-------------------------|----------------------------------|--------------------------------------|
| Integration             | Separate library, config files   | Native PyTorch, Pythonic API         |
| Granularity             | Whole model or per-layer         | Per-layer (FSDP units)               |
| Mixed precision         | Manual config                    | Integrated with autocast             |
| Community               | Large, especially for LLM work   | Growing, well-supported in PyTorch   |
| Best for                | Maximum flexibility              | Clean PyTorch-native workflows       |

Both achieve similar memory savings. The choice often comes down to team preference and existing infrastructure.

---

### 7.7 Megatron-LM: NVIDIA's Large Model Training Framework

**Megatron-LM** is NVIDIA's research framework for training very large language models, first released in 2019 and continuously updated. It was used to train models like BLOOM (176B parameters) and various internal NVIDIA research models.

Where DeepSpeed focuses on *memory efficiency* (fitting large models by sharding), Megatron-LM focuses on *computational efficiency* — getting the highest possible throughput from a cluster of GPUs using a carefully engineered combination of all three parallelism types.

Megatron-LM's main contributions:

**1. Efficient Tensor Parallelism for Transformers**

Megatron-LM identified that the two most expensive operations in a transformer — the large matrix multiplies in the attention mechanism and the feedforward layers — can be split across GPUs in a way that requires only *two* communication operations per layer (one before and one after), regardless of how many GPUs are used.

This is much more efficient than naive tensor parallelism, which might require many more communication steps.

**2. Sequence Parallelism**

Parts of a transformer that *can't* be tensor-parallelized (like layer normalization and dropout) are instead parallelized across the *sequence length* — each GPU handles a different chunk of the input sequence. This keeps all GPUs busy even during the non-parallelizable parts.

**3. Structured 3D Parallelism**

Megatron-LM pioneered the specific way of combining all three parallelism types that is now standard across the industry, which we cover in the next section.

---

### 7.8 Pipeline Parallelism: The Fill-Drain-Steady Cycle and the Bubble Problem

Before explaining 3D parallelism, we need to understand a fundamental inefficiency in pipeline parallelism: **the pipeline bubble**.

Recall from Chapter 30: pipeline parallelism splits the model's layers across GPUs. GPU 0 handles layers 1–10, GPU 1 handles layers 11–20, and so on. Activations flow forward through the pipeline, and gradients flow backward.

The problem: **GPUs can only work when they have data to process**. In a naive pipeline:

```
NAIVE PIPELINE (4 GPUs, 1 microbatch):

Time →  T1      T2      T3      T4      T5      T6      T7      T8
GPU0: [FWD]  [idle] [idle] [idle] [BWD]  [idle] [idle] [idle]
GPU1: [idle] [FWD]  [idle] [idle] [idle] [BWD]  [idle] [idle]
GPU2: [idle] [idle] [FWD]  [idle] [idle] [idle] [BWD]  [idle]
GPU3: [idle] [idle] [idle] [FWD]  [idle] [idle] [idle] [BWD]

█ = working   (space) = idle (the "bubble")

Efficiency: 4 GPUs × 8 time slots = 32 GPU-time units available
            Only 8 units used = 25% efficiency!
```

Each GPU sits idle while it waits for the previous GPU to finish the forward pass, then again while it waits for the next GPU to finish before starting the backward pass. These idle periods are called the **pipeline bubble**.

**The fix: microbatching**

Instead of sending one large batch through, you split it into **microbatches** — smaller chunks that fill the pipeline like cars on a highway.

```
PIPELINE WITH 4 MICROBATCHES (m1, m2, m3, m4):

           Fill phase    Steady state         Drain phase
           ──────────    ────────────         ───────────
T:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
G0: m1  m2  m3  m4  B4  B3  B2  B1
G1:     m1  m2  m3  m4  B4  B3  B2  B1
G2:         m1  m2  m3  m4  B4  B3  B2  B1
G3:             m1  m2  m3  m4  B4  B3  B2  B1

FWD=microbatch forward, B=backward, gaps=bubble
```

The three phases:

- **Fill phase:** The pipeline is filling up. Early GPUs start work but later GPUs are still idle.
- **Steady state:** All GPUs are busy simultaneously — this is the efficient part.
- **Drain phase:** The pipeline empties. Early GPUs finish but later ones are still working.

The bubble never disappears entirely — it always exists at the fill and drain phases. The key insight is: **with more microbatches, the steady state is longer and the bubbles are a smaller fraction of total time**.

```
BUBBLE FRACTION ≈ (number of pipeline stages - 1) / (number of microbatches)

4 pipeline stages, 4 microbatches:  bubble = 3/4 = 75% wasted  (bad!)
4 pipeline stages, 16 microbatches: bubble = 3/16 = 19% wasted (better)
4 pipeline stages, 64 microbatches: bubble = 3/64 = 5% wasted  (good)
```

This is why pipeline parallelism works best with large batch sizes (which can be split into many microbatches). It also shows why the number of pipeline stages (the depth of the pipeline) should be kept as small as possible relative to the microbatch count.

---

### 7.9 3D Parallelism: Combining All Three Types

**3D parallelism** is the combination of data parallelism, tensor parallelism, and pipeline parallelism into one coordinated system. The name "3D" refers to the three dimensions along which the work is split simultaneously.

This is what Megatron-LM pioneered, and it's now the standard approach for training models with hundreds of billions of parameters.

#### How Megatron-LM Combines All Three: The Practical Layout

Imagine you have 64 GPUs organized in a specific hierarchy:

```
64 GPUs — 3D Parallelism Layout

DATA PARALLEL dimension (outermost):
  4 identical model replicas, each processing different data

PIPELINE PARALLEL dimension (middle):
  Each replica split across 4 GPU groups (layers 1-N/4, N/4-N/2, etc.)

TENSOR PARALLEL dimension (innermost):
  Each pipeline stage split across 4 GPUs (within one server node)

4 × 4 × 4 = 64 GPUs total
```

Visualized:

```
┌─────────────────────────────────────────────────────────────────┐
│                    64 GPU CLUSTER                               │
│                                                                 │
│  DATA REPLICA 0              DATA REPLICA 1                     │
│  ┌───────────────────┐       ┌───────────────────┐              │
│  │ Pipeline Stage 0  │       │ Pipeline Stage 0  │              │
│  │ [TP:G0 G1 G2 G3]  │       │ [TP:G16 G17 G18 G19]│           │
│  ├───────────────────┤       ├───────────────────┤              │
│  │ Pipeline Stage 1  │       │ Pipeline Stage 1  │              │
│  │ [TP:G4 G5 G6 G7]  │       │ [TP:G20 G21 G22 G23]│           │
│  ├───────────────────┤       ├───────────────────┤              │
│  │ Pipeline Stage 2  │       │ Pipeline Stage 2  │              │
│  │ [TP:G8 G9 G10 G11]│       │ [TP:G24 G25 G26 G27]│           │
│  ├───────────────────┤       ├───────────────────┤              │
│  │ Pipeline Stage 3  │       │ Pipeline Stage 3  │              │
│  │ [TP:G12 G13 G14 G15]│     │ [TP:G28 G29 G30 G31]│           │
│  └───────────────────┘       └───────────────────┘              │
│                                                                 │
│  DATA REPLICA 2              DATA REPLICA 3  (same structure)   │
│  [GPUs 32–47]                [GPUs 48–63]                       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this specific layout matters:**

Each parallelism type has a different communication pattern and bandwidth requirement:

| Parallelism Type | Communication Pattern     | Bandwidth Needed | Where it runs        |
|------------------|--------------------------|------------------|----------------------|
| Tensor parallel  | All-reduce every layer   | Very high        | Within one node (NVLink) |
| Pipeline parallel| Send activations forward | Moderate         | Across nodes (IB OK) |
| Data parallel    | All-reduce once per step | Lower frequency  | Across nodes (IB OK) |

The crucial rule: **tensor parallelism must stay within one node**. Because it communicates every single layer (potentially hundreds of times per training step), it needs NVLink's high bandwidth. Putting tensor parallelism across nodes over InfiniBand would create a catastrophic bottleneck.

Pipeline and data parallelism communicate less frequently and can tolerate the lower bandwidth of inter-node networking.

So the standard layout is:
- **Tensor parallel** = within one server (NVLink bandwidth)
- **Pipeline parallel** = across servers in the same rack (InfiniBand)
- **Data parallel** = across racks or even data centers (InfiniBand or Ethernet)

This isn't arbitrary — it's precisely engineered to match the communication requirements of each parallelism type to the available bandwidth at each level of the hardware hierarchy.

---

### 7.10 Putting It Together: A Real Training Configuration

Let's make this concrete with a realistic example: training a 175B parameter model (GPT-3 scale) on 512 A100 GPUs.

**Hardware:** 64 nodes × 8 GPUs per node = 512 total GPUs

**Model:** 175B parameters, 96 transformer layers

**Parallelism layout:**

```
Tensor Parallel degree:   8   (each node's 8 GPUs hold one layer together)
Pipeline Parallel degree: 8   (96 layers ÷ 8 = 12 layers per pipeline stage)
Data Parallel degree:     8   (512 ÷ (8 × 8) = 8 data replicas)

8 × 8 × 8 = 512 ✓
```

**Memory per GPU:**

| Component              | Size       | Notes                              |
|------------------------|------------|------------------------------------|
| Model params (12 layers)| ~22 GB    | 1/8 of model, BF16                 |
| Gradients              | ~22 GB     | Same as params                     |
| Optimizer states       | ~44 GB     | 2× params (Adam, FP32)             |
| Activations            | ~8 GB      | Varies with batch/sequence size    |
| **Total**              | **~96 GB** | Fits in A100 SXM (80 GB) with activation checkpointing |

Activation checkpointing (re-computing instead of storing certain activations) brings this within the 80 GB limit. This is the kind of calculation real ML engineers do when planning a training run.

**What each communication channel carries:**

```
NVLink (within node, 900 GB/s):
  → Tensor parallel all-reduces (happen hundreds of times per step)

InfiniBand between nodes (200 GB/s):
  → Pipeline activations between stages (one tensor per microbatch per layer boundary)
  → Data parallel gradient all-reduce (once per step)
```

---

## Assessment

### Q1: You have 32 GPUs on 4 servers (8 GPUs each). Servers are connected by InfiniBand. Which parallelism type should DEFINITELY stay within one server, and why?

- [ ] Data parallelism, because it requires the most total memory
- [ ] Pipeline parallelism, because activations are large
- [x] Tensor parallelism, because it communicates every layer and requires the high bandwidth of NVLink — putting it across servers over InfiniBand would cause severe bottlenecks
- [ ] None — all three parallelism types have similar bandwidth needs

### Q2: In a distributed training job, GPU rank 3 has a world size of 8. What does this tell you?

- [ ] GPU 3 is the third-fastest GPU in the cluster
- [ ] GPU 3 has 8 GB of VRAM
- [x] There are 8 total GPU processes (world size = 8), and this GPU's unique ID is 3 (zero-indexed)
- [ ] This GPU will handle 3/8 of the total parameters

### Q3: Why does DDP group gradients into "buckets" before launching all-reduce operations?

- [ ] To compress gradients and reduce their total size
- [ ] Because torch.distributed can only handle one all-reduce per training step
- [x] To reduce the number of separate network messages — many small messages have high overhead, while fewer large messages are more efficient
- [ ] To ensure gradients are averaged in the correct order

### Q4: ZeRO Stage 3 performs an all-gather at the beginning of every layer's forward pass. Why?

- [ ] To verify that all GPUs have the same random seed
- [ ] To synchronize the loss value across GPUs before computing gradients
- [x] Because parameters are sharded — each GPU only holds 1/N of each layer's parameters. The all-gather temporarily reconstructs the full layer so computation can proceed, then the gathered params are freed immediately after
- [ ] To broadcast the optimizer learning rate from rank 0 to all other GPUs

### Q5: A pipeline parallel setup has 8 stages and processes 8 microbatches. What is the approximate bubble fraction (wasted GPU time)?

- [ ] 1/8 = 12.5%
- [x] 7/8 = 87.5% — the bubble formula is (stages − 1) / microbatches = 7/8
- [ ] 1/64 = 1.6%
- [ ] 8/8 = 100%

### Q6: What is the key advantage of FSDP's per-layer (FSDP unit) design compared to sharding the entire model at once?

- [ ] It uses less total memory than whole-model sharding
- [ ] It eliminates the need for all-gather operations during the forward pass
- [x] Each layer independently manages its own gather-compute-free lifecycle, so only one layer's full parameters exist at a time — minimizing peak memory usage
- [ ] It allows different layers to use different precision formats automatically

### Q7: A team trains a 70B model on 64 H100s using: tensor parallelism degree 8, pipeline parallelism degree 4, data parallelism degree 2. They find training is slower than expected and profiling shows the tensor-parallel all-reduces are consuming 60% of step time. What is the most likely cause?

- [ ] The pipeline microbatch count is too low, creating large bubbles
- [ ] The data parallel gradient all-reduce is too infrequent
- [x] The tensor parallel GPUs are likely connected over PCIe or a slow inter-node link instead of NVLink — tensor parallel all-reduces need NVLink bandwidth to run efficiently
- [ ] ZeRO Stage 3 is conflicting with tensor parallelism on the same parameters

### Q8: In the 3D parallelism layout, why is data parallelism the "outermost" dimension — the one that spans the most physical distance across the cluster?

- [ ] Because data parallelism has the highest memory requirement
- [ ] Because data parallel gradients are the largest tensors in training
- [x] Because data parallelism communicates the least frequently (once per step) and can tolerate higher-latency, lower-bandwidth inter-rack or inter-datacenter networking
- [ ] Because data parallel processes must run on separate physical servers for correctness

---

## Exercise

### Exercise 1: Plan a 3D Parallelism Layout

You have access to the following hardware: **128 GPUs** arranged as **16 servers × 8 GPUs per server**. You want to train a model with **192 transformer layers**.

Design a 3D parallelism layout:
- Choose a tensor parallel degree (must divide evenly into 8 — the GPUs per server)
- Choose a pipeline parallel degree (must allow 192 layers to divide evenly across stages)
- Data parallel degree = 128 ÷ (TP × PP)

Write up your layout with:
1. The specific TP, PP, and DP degrees you chose and why
2. How many layers each pipeline stage holds
3. Which communication happens within a node vs. across nodes
4. One trade-off your layout makes (e.g., more pipeline stages = more bubble, fewer = less TP redundancy)

**Submission Type:** text

---

### Exercise 2: ZeRO Stage Selector

For each scenario below, recommend a ZeRO Stage (0, 1, 2, or 3) and explain your reasoning in 3–4 sentences. Use the memory savings table from section 7.5 to guide your thinking.

**Scenario A:** Training a 1.3B parameter model on 8 A100s (80 GB each). The model fits easily — VRAM usage is around 12 GB per GPU with standard DDP.

**Scenario B:** Training a 65B parameter model on 8 A100s. In BF16, the model weights alone require 130 GB — more than any single GPU. Gradient and optimizer states would add another 200+ GB.

**Scenario C:** Training a 7B model on 4 A100s. The model fits with standard DDP but VRAM is tight — 70 GB out of 80 GB used, with occasional out-of-memory crashes during backward pass on large batches.

**Submission Type:** text

---

### Exercise 3: Diagnose the Pipeline Bubble

A team has the following setup:
- Pipeline parallel degree: 16 stages
- Microbatches per step: 4
- Observed GPU utilization: ~22% on average

Using the bubble fraction formula from section 7.8:

1. Calculate the theoretical bubble fraction for this setup.
2. Is the observed 22% utilization consistent with this bubble fraction? (Hint: 100% − bubble fraction = maximum possible utilization)
3. What change would most improve efficiency — doubling the number of pipeline stages, or quadrupling the number of microbatches? Show the new bubble fraction for each option.
4. Write 2–3 sentences explaining why the team might have chosen 16 pipeline stages despite the large bubble, and what constraint they might be working around.

**Submission Type:** text

---

### Exercise 4: The Communication Hierarchy Map

Draw (in text/ASCII or describe in words) the communication that flows between GPUs during one training step for a 3D parallel job with:
- 2 nodes, 4 GPUs per node (8 GPUs total)
- Tensor parallel degree: 4 (within each node)
- Pipeline parallel degree: 2 (between nodes)
- Data parallel degree: 1 (no data parallelism — just one replica)

For each type of communication, specify:
- Which GPUs are involved
- What data is being sent (activations? gradients? parameters?)
- Which physical link carries it (NVLink within node, or InfiniBand between nodes)
- Approximately when in the training step it occurs (forward pass? backward pass? optimizer step?)

**Submission Type:** text