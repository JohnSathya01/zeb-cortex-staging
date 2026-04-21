# Chapter 12: Profiling & Debugging — When Your GPU Isn't Doing What You Think

## Learning Objectives

- Read and correctly interpret nvidia-smi output, including memory usage, GPU utilization, temperature, and power draw
- Understand what the PyTorch profiler timeline reveals about where time is actually being spent during training
- Identify common memory problems — leaks, fragmentation, and unexpected growth — using memory profiling tools
- Recognize the symptoms of multi-GPU communication bottlenecks and understand how to diagnose them
- Diagnose and resolve the six most common GPU errors that interrupt training runs

---

## Key Concepts

### 12.1 Recap: What We Know So Far

In Modules 9, 10, and 11, we learned how to make models more memory-efficient (LoRA, quantization), how to serve them efficiently (KV cache, continuous batching), and how to choose and pay for the right hardware (GPU generations, spot instances, MIG).

But even with the right hardware and the right techniques, things go wrong. Training runs crash. The GPU is "busy" but nothing is happening. Memory fills up for no obvious reason. A multi-GPU job runs slower than single GPU.

This chapter is about **diagnosis** — how you figure out what's actually happening inside your GPU when the behavior doesn't match your expectations. We'll work from the outermost layer (the basic `nvidia-smi` readout) inward to kernel-level profiling and communication analysis.

---

### 12.2 nvidia-smi — The Dashboard on the Wall

`nvidia-smi` stands for "NVIDIA System Management Interface." It's a command-line tool that ships with every NVIDIA GPU driver. Running it gives you a dashboard of what your GPU is currently doing.

Think of it like the instrument cluster on a car dashboard. The speedometer, fuel gauge, engine temperature — you don't need to open the hood to know the engine is overheating. `nvidia-smi` is your GPU's dashboard.

#### Running nvidia-smi

```bash
# One-time snapshot
nvidia-smi

# Refreshing every 1 second (like a live dashboard)
nvidia-smi dmon -s u -d 1

# Continuous monitoring with all stats
watch -n 1 nvidia-smi
```

#### Reading the Output

Here's a typical `nvidia-smi` output, annotated:

```
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 535.86.10    Driver Version: 535.86.10    CUDA Version: 12.2    |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC|
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M.|
|===============================+======================+======================|
|   0  A100-SXM4-80GB      On  | 00000000:00:04.0 Off |                    0|
| N/A   52C    P0   287W / 400W |  43521MiB / 81920MiB |     94%      Default|
+-------------------------------+----------------------+----------------------+
|   1  A100-SXM4-80GB      On  | 00000000:00:05.0 Off |                    0|
| N/A   48C    P0    41W / 400W |    410MiB / 81920MiB |      3%      Default|
+-------------------------------+----------------------+----------------------+
```

Let's decode every field:

**GPU 0 (the busy one):**

```
52C          → Temperature: 52 degrees Celsius
               ✓ Normal range: 30–80°C under load
               ⚠ Warning zone: 80–85°C
               ✗ Danger zone: 85°C+ (throttling begins)

P0           → Performance state: P0 = maximum power mode
               P0 = full speed, P8 = idle/low power
               Always want P0 during training

287W / 400W  → Power: using 287W of 400W maximum
               71% of power budget being used
               If consistently at 400W/400W, you're power-limited

43521MiB /   → Memory: 43,521 MB used of 81,920 MB total
81920MiB       = ~53% VRAM utilized
               The most commonly watched metric

94%          → GPU Utilization: the GPU's compute cores are
               active 94% of the time
               ✓ 80–100%: excellent, GPU is being used well
               ⚠ 40–80%: moderate — possible bottleneck
               ✗ 0–40%: GPU is starving — likely CPU/data bottleneck

ECC: 0       → 0 uncorrected ECC errors
               Any non-zero value here is serious —
               hardware may be failing
```

**GPU 1 (suspicious — barely doing anything):**

```
48C    → Cool temperature — barely working
41W    → Using only 41W of 400W budget — nearly idle
3%     → Only 3% GPU utilization — almost completely idle
410MiB → Only 410 MB of memory used — empty
```

This is a red flag. If you intended to run multi-GPU training, GPU 1 should look like GPU 0. A 3% utilization on GPU 1 while GPU 0 is at 94% means something is wrong — either the job isn't actually using both GPUs, or GPU 1 is waiting for data from GPU 0.

#### The Five Readings and What They Tell You

| Reading | Healthy Range | What's Wrong If Outside Range |
|---|---|---|
| Temperature | 30–80°C | Above 85°C: throttling — check cooling |
| Power (W/cap) | 70–100% of cap | Far below cap: compute or data bottleneck |
| VRAM used | Depends on job | Unexpectedly full: memory leak; too low: underutilizing GPU |
| GPU Utilization % | 80–100% for training | Below 50%: CPU feeding data too slowly |
| ECC Errors | 0 | Any non-zero: hardware issue, escalate immediately |

#### The Utilization Trap — What "GPU Utilization" Actually Means

Here's a critical subtlety: **GPU utilization measures whether the GPU is doing *anything* — not whether it's doing the *right thing* efficiently.**

A GPU running a slow, poorly written kernel shows 100% utilization. A GPU waiting for data shows 0% utilization. High utilization is necessary but not sufficient for good performance. You need profiling tools (next section) to know if that utilization is productive.

---

### 12.3 PyTorch Profiler — Finding Bottlenecks

`nvidia-smi` tells you the GPU is busy. The **PyTorch profiler** tells you *what* it's busy doing, and whether that work is efficient.

Think of it like the difference between a security camera that shows "the factory floor is active" versus a time-and-motion study that shows "workers spend 40% of their time walking between workstations and only 60% actually assembling things."

#### How the PyTorch Profiler Works

When you wrap your training loop with the profiler, it traces every operation — every matrix multiplication, every memory allocation, every data transfer — and records exactly how long each one took and what hardware it ran on.

```python
# What the profiler looks like in code
# (You don't need to understand all the details —
# just know what each part does)

import torch
from torch.profiler import profile, record_function, ProfilerActivity

with profile(
    activities=[
        ProfilerActivity.CPU,   # Track CPU operations
        ProfilerActivity.CUDA,  # Track GPU operations
    ],
    record_shapes=True,         # Record tensor sizes
    profile_memory=True,        # Track memory allocations
    with_stack=True,            # Record where in your code each op came from
) as prof:
    for step in range(10):      # Profile 10 training steps
        train_one_step()        # Your normal training code

# Export to Chrome trace viewer (opens in browser)
prof.export_chrome_trace("trace.json")

# Or print a summary table
print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=15))
```

#### Reading the Summary Table

The profiler prints a table like this:

```
-------------------------------------------------------  ---------------
Name                                          CUDA time %    CUDA time
-------------------------------------------------------  ---------------
aten::mm                                           41.2%     4.120 ms
aten::_scaled_dot_product_flash_attention          23.8%     2.380 ms
aten::linear                                       15.1%     1.510 ms
Memcpy DtoH                                         8.4%       840 μs  ← ⚠
cudaLaunchKernel                                    4.2%       420 μs
aten::copy_                                         3.1%       310 μs
[other operations]                                  4.2%       420 μs
-------------------------------------------------------  ---------------
```

What this table tells you:

- **aten::mm** (matrix multiplication) — 41% of GPU time. This is expected and healthy for a transformer model. This is the "real work."
- **flash_attention** — 24% of time. Also expected. This is the attention mechanism.
- **Memcpy DtoH** — "Memory copy from Device (GPU) to Host (CPU)" — 8.4%. This is a warning sign. Moving data from GPU to CPU mid-training is usually a mistake. Common cause: someone accidentally put `tensor.item()` inside the training loop (which forces a GPU→CPU sync every step).
- **cudaLaunchKernel** — overhead from launching GPU operations. Small and normal.

#### The Timeline View — Seeing Operations Over Time

The Chrome trace (opened in `chrome://tracing` in your browser) shows a swimlane diagram of all operations over time:

```
TIME ──────────────────────────────────────────────────────────▶

CPU  │████ data load ████│   │████ optimizer step ███│   │████ data load...
     │                   │   │                       │   │
CUDA │                   │███████ forward pass ████│██backward█│

     ↑                               ↑
  IDLE GAP here                 GPU and CPU overlap here (good!)
  CPU loading data,              CPU running optimizer while
  GPU waiting                    GPU processes next batch
```

**What you want to see:** GPU operations filling most of the timeline with minimal gaps. CPU and GPU operations overlapping (while the GPU runs the current batch, the CPU prepares the next one).

**What you don't want to see:**

```
PROBLEM: GPU starving — waiting for data

CPU  │████████████████████ data load (slow) ████████████████████│
CUDA │                                                           │██ forward │

     ↑ GPU idle the entire time the CPU loads data
     Fix: Use DataLoader with num_workers > 0, prefetch data to GPU
```

```
PROBLEM: Synchronization bubbles

CPU  │██ work │sync│██ work │sync│██ work │sync│
CUDA │        │████│        │████│        │████│
                ↑ tiny GPU bursts separated by sync waits
     Fix: Batch your GPU operations, avoid .item() in loops
```

#### Common Profiler Findings and Fixes

| What You See | What It Means | Fix |
|---|---|---|
| Large `Memcpy DtoH` | Moving tensors CPU→GPU unnecessarily | Find `.item()`, `.cpu()`, or `.numpy()` calls inside training loop |
| GPU idle gaps between ops | Synchronization overhead | Batch small operations; use `torch.no_grad()` during inference |
| `data_load` dominates timeline | DataLoader is too slow | Increase `num_workers`, use prefetching, move data to SSD |
| One op takes 10× longer than similar ops | Wrong tensor shape or un-fused kernel | Check tensor shapes; consider `torch.compile()` |
| `cudaMemcpyAsync` is huge | Large activations moved between GPUs | Check model parallelism settings; reduce batch size |

---

### 12.4 Memory Profiling — Tracking Every Megabyte

Your training crashes with "CUDA out of memory." Or VRAM usage keeps growing every step until it explodes. Or you're confused why a supposedly 14 GB model needs 60 GB of VRAM. Memory profiling answers these questions.

Think of VRAM like a hotel. You need to know which rooms are occupied, who reserved them, and whether any guests refuse to check out.

#### The Memory Snapshot Tool

PyTorch has a built-in memory snapshot tool that records every allocation and deallocation with a full trace of *where in your code* it came from:

```python
# Start recording memory history
torch.cuda.memory._record_memory_history()

# Run your training loop
for step in range(100):
    loss = model(batch)
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()

# Save the snapshot
torch.cuda.memory._dump_snapshot("memory_snapshot.pkl")
torch.cuda.memory._record_memory_history(enabled=None)  # stop recording
```

Upload the `.pkl` file to `https://pytorch.org/memory_viz` (a free tool) and you get a visual breakdown of every MB in VRAM at every moment in time.

#### Reading the Memory Timeline

```
VRAM Usage Over Training Steps:
▲
│                                     ← OOM crash here
│                              ●●●●●●●
│                        ●●●●●
│                  ●●●●●
│            ●●●●●                    ← gradual leak!
│      ●●●●●
│ ●●●●●
└──────────────────────────────────────────▶ Training Steps

This shape = memory leak. VRAM should be flat after step 1.

HEALTHY memory pattern:
│ ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●     ← stable after warmup
│●
└──────────────────────────────────────────▶ Training Steps
```

#### The Four Memory Problems and How to Find Them

**Problem 1: The Memory Leak — Something That Should Be Freed Isn't**

Symptom: VRAM grows step by step. Usually happens when tensors that should be temporary get accidentally stored somewhere permanent.

```
Common cause:
losses = []                    # ← storing full computation graph!
for batch in dataloader:
    loss = model(batch)
    losses.append(loss)        # ← this keeps the gradient graph alive
                               # memory grows every step

Fix:
losses.append(loss.item())     # .item() extracts just the number,
                               # releasing the computation graph
```

**Problem 2: Fragmentation — Memory Available But Unusable**

Symptom: `nvidia-smi` shows 60 GB used, but your allocation of 20 GB fails with "out of memory." This sounds impossible — there should be 20 GB free.

Fragmentation happens when the free memory is scattered in small chunks rather than one contiguous block. It's like trying to park a bus in a parking lot where all the empty spots are single-car sized and spread between occupied cars.

```
FRAGMENTED VRAM (simplified):
[10MB free][25MB used][8MB free][31MB used][6MB free][used]...

You request: 20 MB contiguous allocation
Result: FAIL — no single gap is 20 MB or larger

HEALTHY VRAM:
[24MB free contiguous block][25MB used][31MB used][used]...

You request: 20 MB → succeeds easily
```

Fix: `torch.cuda.empty_cache()` returns freed memory to CUDA's allocator pool. This doesn't reduce what your model uses, but clears the fragmentation between allocations. Also, using PyTorch 2.0+'s memory-efficient allocator helps.

**Problem 3: Activation Explosion — The Forward Pass Stores Too Much**

Symptom: Memory spikes during the forward pass far above what the model weights alone should require.

During the forward pass, intermediate activations are stored for use in the backward pass. For large models and large batch sizes, this can vastly exceed the model weight memory.

```
MEMORY DURING ONE FORWARD PASS:
Model weights:        14 GB  (constant, always there)
Optimizer states:     28 GB  (constant during training step)
Activations stored:   ??     (scales with batch × sequence length)

For batch=16, seq=2048 on a 7B model:
Activations:         ~30 GB!   ← often the surprise number

Fix options:
1. Reduce batch size (halving batch halves activation memory)
2. Gradient checkpointing — recompute activations during backward
   instead of storing them (trades speed for memory)
3. Reduce sequence length
```

**Problem 4: The Hidden Copy — Same Tensor Twice**

Symptom: Memory usage is double what you expected for no obvious reason.

```
Common hidden copies:

# Moving to CPU "just to log" — creates a CPU copy
log_tensor = my_tensor.cpu().numpy()   # both GPU and CPU copy exist!

# Detaching incorrectly
stored = output                        # stores reference to full graph
stored = output.detach()              # ✓ breaks graph, saves memory
stored = output.detach().clone()      # ✓ independent copy (use when needed)
```

#### Key Memory Profiling Commands

```bash
# Quick current memory status
python -c "import torch; print(torch.cuda.memory_summary())"

# Inside your training script — print at each step to find the leak
print(f"Step {step}: {torch.cuda.memory_allocated() / 1e9:.2f} GB allocated")
print(f"Step {step}: {torch.cuda.memory_reserved() / 1e9:.2f} GB reserved")
```

The difference between "allocated" (memory actively holding tensors) and "reserved" (memory held by PyTorch's allocator but not currently in use) tells you how much fragmentation or pre-allocation overhead exists.

---

### 12.5 Kernel Profiling — Which Operations Are Slow

We've seen how to find *where* time is going (profiler timeline). Kernel profiling goes one level deeper: it examines the specific GPU micro-programs (called **kernels**) that implement each operation, measuring whether they're running at peak efficiency.

Think of this like the difference between knowing "the engine takes 5 minutes to warm up" (operation-level profiling) vs. "the fuel injectors in cylinders 3 and 4 are misfiring" (kernel-level profiling). You only go this deep when operation-level profiling isn't enough.

#### What Is a GPU Kernel?

Every GPU operation — a matrix multiplication, a ReLU activation, a softmax — is implemented as a **kernel**: a small program that runs in parallel across thousands of GPU cores. When PyTorch calls `torch.matmul()`, it selects a kernel from a library (cuBLAS or CUTLASS) and launches it on the GPU.

Kernels can run at vastly different efficiencies depending on:
- The **shape** of the tensors (some shapes are much more GPU-friendly than others)
- Whether the kernel is **fused** (combines multiple operations) or not
- Whether the data fits in the GPU's fast on-chip cache (SRAM) or must repeatedly fetch from VRAM

#### NVIDIA Nsight Systems — The Kernel-Level Microscope

**Nsight Systems** is NVIDIA's free profiling tool that records every kernel launch, its duration, memory bandwidth used, and occupancy (how many GPU cores were actually active during the kernel).

```bash
# Profile your script with Nsight Systems
nsys profile --trace=cuda,nvtx python train.py

# Opens a GUI showing full kernel-level timeline
nsys-ui report.nsys-rep
```

What to look for in Nsight:

```
HEALTHY KERNEL PATTERN:
│█████████████████████│  matmul kernel (long, using full GPU)
│███████████████████│     attention kernel (long, efficient)
│████████████████│        another matmul

BAD KERNEL PATTERN:
│█│█│█│█│█│█│█│█│█│█│█│  many tiny kernels with gaps between
  ↑ ↑ ↑ ↑ ↑
  These gaps = CUDA launch overhead between un-fused ops
  Each tiny kernel = one small operation that should be combined

Fix: torch.compile() fuses many small kernels into one large one
```

#### The Three Common Kernel Problems

**Problem 1: Un-fused Element-Wise Operations**

You wrote your activation function manually:

```python
# Un-fused (3 separate kernel launches):
x = x * 0.5
x = torch.tanh(x)
x = x * (1 + x)

# Fused with torch.compile() or built-in:
x = torch.nn.functional.gelu(x)   # one kernel launch
```

Three launches with gaps between them vs. one launch that keeps data in fast cache throughout.

**Problem 2: Wrong Tensor Shapes for Tensor Cores**

NVIDIA's Tensor Cores (the specialized AI accelerator hardware inside modern GPUs) have a specific requirement: matrix dimensions must be multiples of 8 (for fp16) or multiples of 16 (for bf16/fp8) to use Tensor Cores efficiently.

```
Matrix multiply: [1024 × 768] × [768 × 1024]
768 is divisible by 8? Yes (768 / 8 = 96) ✓ Tensor Cores used

Matrix multiply: [1000 × 769] × [769 × 1000]
769 is divisible by 8? No ✗ Falls back to regular CUDA cores
Result: ~4–8× slower than necessary

Fix: Pad dimensions to nearest multiple of 8 or 16
     768 → 768 ✓  (already good)
     769 → 776 ✓  (pad by 7)
     1000 → 1024 ✓ (pad by 24)
```

This is why many model architectures use dimensions like 512, 768, 1024, 2048, 4096 — they're all multiples of 8, specifically to enable Tensor Core usage.

**Problem 3: Memory Bandwidth Bound vs. Compute Bound**

Every GPU operation is either:
- **Compute-bound**: The bottleneck is raw arithmetic speed (matrix multiplications usually are)
- **Memory-bandwidth-bound**: The bottleneck is how fast data moves between VRAM and compute units (element-wise ops usually are)

```
COMPUTE BOUND (matmul):
VRAM ──────────────────────────── Compute
      Load A, Load B (once)         ↓
                              Multiply 1M times
                                     ↓
                               Write result (once)

Data movement: small. Math: enormous. → maximize arithmetic intensity

MEMORY BANDWIDTH BOUND (element-wise add):
VRAM ──────────────────────────── Compute
      Load element (many times)      ↓
                                Add two numbers
                                     ↓
                               Write result (many times)

Data movement: huge relative to math. → kernel fusion is critical
```

Nsight shows you the **arithmetic intensity** of each kernel. Very low arithmetic intensity = memory-bandwidth bound = fusion and caching will help a lot.

---

### 12.6 Communication Profiling — Finding Multi-GPU Bottlenecks

When training across multiple GPUs, the GPUs must constantly share information — gradients after each backward pass, activations in tensor parallelism, parameters in pipeline parallelism. This communication happens over NVLink (within a server) or InfiniBand/Ethernet (between servers).

When multi-GPU training is slower than expected — or worse, slower than single-GPU — communication is usually the culprit.

#### What Communication Happens During Training?

```
DISTRIBUTED TRAINING COMMUNICATION PATTERN (Data Parallelism):

Each GPU independently:
├── Forward pass (no communication needed)
├── Backward pass — compute gradients (no communication)
└── AllReduce — MUST COMMUNICATE
     ↓
     GPU 0: gradient for layer 1 = [0.23, 0.11, ...]
     GPU 1: gradient for layer 1 = [0.19, 0.14, ...]
     GPU 2: gradient for layer 1 = [0.21, 0.12, ...]
     GPU 3: gradient for layer 1 = [0.22, 0.10, ...]

     AllReduce: average all four gradients across all GPUs
     Result: [0.2125, 0.1175, ...] sent back to all GPUs

     This happens for EVERY parameter in the model.
     For a 7B model: 7 billion parameters × 2 bytes = 14 GB of data
     transmitted every single step.
```

Clearly, how fast this communication happens determines how much of your GPU time is wasted waiting for synchronization.

#### The Scaling Efficiency Metric

The key measurement in multi-GPU training is **scaling efficiency**: how much faster does N GPUs run compared to 1 GPU?

```
PERFECT SCALING (theoretical):
1 GPU → 1 step/second
2 GPU → 2 steps/second  (2× faster)
4 GPU → 4 steps/second  (4× faster)
8 GPU → 8 steps/second  (8× faster)

REAL-WORLD SCALING (typical):
1 GPU → 1 step/second
2 GPU → 1.85 steps/second  (92.5% efficiency — good)
4 GPU → 3.40 steps/second  (85.0% efficiency — acceptable)
8 GPU → 6.00 steps/second  (75.0% efficiency — look for problems)
16 GPU → 10.0 steps/second  (62.5% efficiency — investigate)

Scaling efficiency = (N-GPU throughput) / (N × 1-GPU throughput) × 100%
```

If scaling efficiency drops sharply at some GPU count, you've found where communication becomes the bottleneck.

#### Diagnosing Multi-GPU Bottlenecks

**Step 1: Check NVLink bandwidth with nvidia-smi**

```bash
nvidia-smi nvlink --status -i 0    # check NVLink status on GPU 0
nvidia-smi nvlink --capabilities -i 0   # check NVLink bandwidth
```

If NVLink shows errors or is not detected, GPUs may be communicating via PCIe (much slower). An AllReduce that takes 100ms over NVLink might take 2 seconds over PCIe.

**Step 2: Profile with PyTorch's distributed profiling**

```python
# Add NCCL (the multi-GPU communication library) to profiler activities
with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    record_shapes=True,
) as prof:
    train_step()

# Look for these operations in the timeline:
# nccl:all_reduce   → data parallel gradient sync
# nccl:all_gather   → tensor parallel activation sync
# nccl:reduce_scatter → combined with all_gather in FSDP
```

**Step 3: Find the AllReduce time**

In the profiler timeline, look for `nccl:all_reduce` blocks. These are the synchronization points where all GPUs wait for each other.

```
HEALTHY OVERLAP (communication hidden behind compute):

GPU 0: │█████ backward (layers 8-12) █████│█████ backward (layers 1-7) ████│
       │                                   │
NVLink:│                              │████ all_reduce layers 8-12 █████│
       │                                   ↑
       │            AllReduce happens here while GPU still does backward
       │            on earlier layers — OVERLAP is good!
```

```
COMMUNICATION BOTTLENECK (no overlap):

GPU 0: │█ backward █│  WAITING  │█ backward █│  WAITING  │update│
       │            │███ allreduce ███│       │███ allreduce ███│
                     ↑
       GPU sits completely idle waiting for AllReduce
       This is the bottleneck — 50% of time is synchronization wait
```

#### The Four Multi-GPU Bottleneck Patterns

| Symptom | Diagnosis | Fix |
|---|---|---|
| Scaling efficiency drops below 70% at 4+ GPUs | AllReduce latency dominates | Enable gradient compression or bucketing |
| GPU utilization plummets during AllReduce | No overlap between compute and communication | Use Distributed Data Parallel (DDP) with `find_unused_parameters=False` |
| Multi-GPU is literally slower than single GPU | Likely using PCIe instead of NVLink | Verify NVLink topology; check server configuration |
| One GPU always finishes early, waits for others | Load imbalance — some GPUs got harder batches | Use dynamic batch sizing or better data shuffling |

#### Checking Your NVLink Topology

NVLink connections between GPUs follow a physical topology that varies by server design. Some GPUs are directly connected; others communicate via a CPU bridge. You want to verify your GPUs are properly connected:

```bash
# Show the full NVLink topology (P = PCIe, NV1/NV2/NV4 = NVLink lanes)
nvidia-smi topo -m

# Healthy output for 8-GPU server (all NVLink):
        GPU0   GPU1   GPU2   GPU3   GPU4   GPU5   GPU6   GPU7
GPU0     X     NV4    NV4    NV4    NV4    NV4    NV4    NV4
GPU1    NV4     X     NV4    NV4    NV4    NV4    NV4    NV4
...

# Unhealthy (PCIe between GPU0 and GPU4):
        GPU0   GPU1   GPU2   GPU3   GPU4   GPU5   GPU6   GPU7
GPU0     X     NV4    NV4    NV4     PIX    PIX    PIX    PIX
                                      ↑
                           GPU0 communicates with GPU4 via PCIe (slow!)
                           This causes asymmetric communication latency
```

---

### 12.7 Common GPU Errors and How to Fix Them

Training crashes are inevitable. Here are the six errors you'll encounter most often, what they actually mean, and how to fix them.

#### Error 1: CUDA Out of Memory

```
RuntimeError: CUDA out of memory. Tried to allocate 2.34 GiB
(GPU 0; 79.20 GiB total capacity; 71.84 GiB already allocated;
1.17 GiB free; 74.10 GiB reserved in total by PyTorch)
```

This is the most common GPU error. The GPU ran out of VRAM.

**Diagnosis checklist (in order):**
```
1. Is the allocation reasonable for my batch size?
   → If yes, reduce batch size or use gradient accumulation

2. Is VRAM growing step-over-step?
   → Memory leak: find tensors stored across steps (see section 12.4)

3. Is "reserved" much larger than "allocated"?
   → Fragmentation: call torch.cuda.empty_cache()
   → Allocated: 30 GB, Reserved: 70 GB → 40 GB fragmented

4. Did the OOM happen on step 1 or much later?
   → Step 1: your setup is too large for this GPU
   → Later step: memory leak

5. Are gradients accumulating correctly?
   → optimizer.zero_grad() missing? Gradients pile up across steps
```

**Quick fixes:**
- Halve batch size (halves activation memory)
- Add `torch.cuda.empty_cache()` between steps
- Use `torch.no_grad()` during validation
- Enable gradient checkpointing (`model.gradient_checkpointing_enable()`)
- Switch from fp32 to fp16/bf16

#### Error 2: CUDA Device-Side Assert Triggered

```
RuntimeError: CUDA error: device-side assert triggered
CUDA kernel errors might be asynchronously reported at other API
calls, so the stacktrace below might be incorrect.
```

This is deceptively unhelpful — it tells you something went wrong on the GPU but not what. The "asynchronous" note is key: the actual error happened earlier than where the traceback points.

**How to get the real error:**

```bash
# Run with synchronous error reporting (much slower, but shows real error)
CUDA_LAUNCH_BLOCKING=1 python train.py
```

**Most common causes:**

| Real Error | How It Appears | Fix |
|---|---|---|
| Index out of bounds | Accessing tensor position that doesn't exist | Check vocabulary size vs. embedding size |
| NaN in loss | Trying to compute log(0) or 0/0 | Add gradient clipping; check learning rate |
| Wrong class index | Label 5 in a 5-class problem (0–4 are valid) | Labels must be 0-indexed |
| Negative index | Unexpected -1 in target tensor | Check your data preprocessing |

#### Error 3: NCCL Error / Communication Timeout

```
RuntimeError: NCCL error in: /pytorch/torch/lib/c10d/ProcessGroupNCCL.cpp
unhandled system error (run with NCCL_DEBUG=INFO for details)
ncclSystemError: System call (e.g. socket, malloc) failed.
```

NCCL is the multi-GPU communication library. This error means GPUs couldn't talk to each other.

**Diagnosis:**

```bash
# Enable verbose NCCL debugging
NCCL_DEBUG=INFO python train.py 2>&1 | grep NCCL

# Common outputs and their meanings:
# "Timeout" → one GPU is much slower than others (load imbalance)
# "Connection refused" → firewall blocking GPU communication ports
# "Out of memory" → NCCL needs buffer space, VRAM too full
```

**Common fixes:**
- Increase NCCL timeout: `export NCCL_TIMEOUT=3600`
- Check firewall rules between machines
- Free VRAM before initializing distributed training
- Verify all GPUs have the same CUDA and NCCL versions

#### Error 4: CUDA Illegal Memory Access

```
RuntimeError: CUDA error: an illegal memory access was encountered
```

The GPU tried to read or write a memory address that doesn't exist or isn't allocated. The computing equivalent of following directions to an address that isn't on the map.

**Most common causes:**
- A tensor was moved to CPU (`.cpu()`) but operations still try to run on GPU
- Using a tensor after it's been freed (rare but possible in complex code)
- Hardware issue — if this appears randomly without code changes, run CUDA's memory checker

```bash
# CUDA's built-in memory error detector
compute-sanitizer --tool memcheck python train.py
# Significantly slower, but pinpoints the exact bad access
```

#### Error 5: Expected All Tensors to Be on the Same Device

```
RuntimeError: Expected all tensors to be on the same device, but found
at least two devices, cuda:0 and cpu!
```

One tensor is on the GPU, another is on the CPU, and you tried to do math with both.

**Finding the culprit:**

```python
# Add this temporary debug code before the error line:
for name, param in model.named_parameters():
    print(f"{name}: {param.device}")

# Check your inputs:
print(f"Input batch device: {batch.device}")
print(f"Labels device: {labels.device}")
```

**Fix pattern:**

```python
# Move everything to the same device explicitly
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)
batch = batch.to(device)
labels = labels.to(device)
```

#### Error 6: Loss is NaN (Not a Number)

This isn't a crash — your training continues, but NaN loss means the model has learned nothing. Every gradient is undefined, every weight update is garbage.

```
Step   1: loss = 2.3451
Step   2: loss = 2.1823
Step   3: loss = nan     ← all subsequent steps are also nan
Step   4: loss = nan
```

**Diagnosis flowchart:**

```
Loss becomes NaN?
      │
      ├─ Check: Did loss explode first (very large numbers before NaN)?
      │    └─ Yes → Learning rate too high → reduce by 10×
      │
      ├─ Check: Does NaN appear at step 1 immediately?
      │    └─ Yes → Bad data (NaN in input) → check dataset
      │                                         torch.isnan(batch).any()
      │
      ├─ Check: Are you using fp16 (not bf16)?
      │    └─ Yes → Gradient underflow → add loss scaling
      │             scaler = torch.cuda.amp.GradScaler()
      │
      └─ Check: Does it happen only on specific batches?
           └─ Yes → Problematic examples → log and skip NaN-loss batches
                    if torch.isnan(loss): continue
```

**Prevention checklist:**

```python
# 1. Gradient clipping — prevents explosions that lead to NaN
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# 2. Check for NaN before optimizer step
if torch.isnan(loss):
    print(f"NaN loss at step {step}!")
    continue

# 3. Use bf16 instead of fp16 when possible
# bf16 has a wider range — doesn't underflow as easily
```

---

### 12.8 A Debugging Workflow — Putting It All Together

When something goes wrong, work through these layers in order. Don't jump straight to kernel profiling when `nvidia-smi` would tell you in 10 seconds that the GPU is barely being used.

```
DEBUGGING LAYER CAKE — Start at the top, go deeper only if needed:

┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: nvidia-smi                                        │
│  Time: 30 seconds                                           │
│  Answers: Is the GPU being used? Out of memory? Overheating?│
│  If GPU util < 50% → data pipeline problem                  │
│  If VRAM full → OOM debugging (Layer 3)                     │
│  If temps > 85°C → cooling problem                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ (GPU looks fine but still slow?)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: PyTorch Profiler (summary table)                  │
│  Time: 5–15 minutes                                         │
│  Answers: Which operations take the most time?              │
│  If DtoH memcpy is high → remove .item()/.cpu() from loop   │
│  If data_load dominates → fix DataLoader                    │
│  If one op is 10× slower than similar → shape problem       │
└─────────────────────┬───────────────────────────────────────┘
                      │ (bottleneck identified, need more detail?)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Memory Profiler / Chrome Trace                    │
│  Time: 30–60 minutes                                        │
│  Answers: Is memory leaking? Where? Fragmentation?          │
│  If OOM: check allocated vs. reserved, find growing tensors │
│  If slow: look for sync bubbles in timeline                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ (still can't find it?)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: Nsight Systems (kernel profiling)                 │
│  Time: Hours (expert tool)                                  │
│  Answers: Are specific kernels inefficient?                 │
│  If many tiny kernels → use torch.compile()                 │
│  If low occupancy → tensor shape issue (not mult of 8)      │
└─────────────────────┬───────────────────────────────────────┘
                      │ (multi-GPU job specifically?)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5: Communication Profiling                           │
│  Time: Hours                                                │
│  Answers: Is AllReduce the bottleneck?                      │
│  Check NVLink topology, NCCL debug output, scaling efficiency│
└─────────────────────────────────────────────────────────────┘
```

---

## Assessment

### Q1: You run nvidia-smi and see GPU utilization at 12% with power usage at 45W out of a 400W maximum. Your training script is running. What is the most likely cause?

- [ ] The model is too large for the GPU and is being throttled
- [x] The GPU is starving — it's waiting for the CPU to load and prepare data before it can do any computation
- [ ] The GPU temperature is too high and it has reduced performance to cool down
- [ ] The training script has finished and the GPU is now idle

### Q2: The PyTorch profiler summary table shows `Memcpy DtoH` (Device to Host memory copy) consuming 22% of total GPU time during training. What is the most likely cause and fix?

- [ ] The model is too large to fit in VRAM, so PyTorch is spilling to CPU memory automatically
- [x] A `.item()`, `.cpu()`, or `.numpy()` call exists inside the training loop, forcing a GPU-to-CPU synchronization every step — remove it or move it outside the loop
- [ ] The DataLoader is loading data from disk directly to CPU, which is normal behavior
- [ ] Mixed precision training is causing gradient overflow and copying to CPU for correction

### Q3: Your training uses 43 GB of VRAM according to nvidia-smi. You try to allocate a new 10 GB tensor and get an out-of-memory error, even though 80 GB - 43 GB = 37 GB should be free. What is the most likely explanation?

- [ ] nvidia-smi is showing incorrect information — the GPU actually has less VRAM than advertised
- [ ] The 10 GB tensor exceeds a per-allocation size limit imposed by CUDA
- [x] VRAM fragmentation — the 37 GB of free memory is scattered in many small chunks, and no single contiguous 10 GB block is available
- [ ] The GPU's memory bandwidth is saturated, preventing new allocations

### Q4: You scale your training from 1 GPU to 8 GPUs and measure the following throughput: 1 GPU = 100 samples/sec, 8 GPUs = 320 samples/sec. What is the scaling efficiency, and what does it suggest?

- [ ] 40% efficiency — the GPUs are fundamentally incompatible and should not be used together
- [ ] 100% efficiency — 320 samples/sec is exactly 8× the single-GPU throughput of 40 samples/sec
- [x] 40% efficiency — significant communication overhead or load imbalance is likely consuming more than half of potential throughput
- [ ] 80% efficiency — this is the expected result for any 8-GPU configuration

### Q5: Your training loss is 2.3 at step 1, then immediately becomes NaN at step 2 and stays NaN forever. Which is the most likely cause?

- [ ] The learning rate is too low, causing gradients to underflow to zero
- [x] The input data contains NaN values, or a logarithm of zero is being computed somewhere — the NaN appeared at step 1 and propagated immediately
- [ ] The batch size is too small, causing unstable gradient estimates
- [ ] The GPU has run out of memory, causing undefined values to be written as NaN

### Q6: A colleague claims their 4-GPU training run is slower than their single-GPU run. Without looking at any code, what is the single most important thing to check first?

- [ ] Whether all four GPUs are the same model
- [ ] Whether the batch size was divided correctly across 4 GPUs
- [x] Whether all GPUs are connected via NVLink or whether some communicate via PCIe — PCIe AllReduce can be so slow it makes multi-GPU worse than single-GPU
- [ ] Whether gradient checkpointing is enabled on all GPUs

---

## Exercise

### Exercise 1: nvidia-smi Diagnosis

Below is the nvidia-smi output from a 4-GPU training server. Read it carefully and answer the questions.

```
+---GPU---+--Temp--+--Pwr--+------Memory------+--Util--+--ECC--+
|    0    |  83°C  | 398W  | 79,800/81,920 MiB|   97%  |   0   |
|    1    |  84°C  | 395W  | 79,750/81,920 MiB|   96%  |   0   |
|    2    |  47°C  |  38W  |    512/81,920 MiB|    4%  |   0   |
|    3    |  48°C  |  41W  |    490/81,920 MiB|    3%  |   0   |
```

Answer these questions:

1. Which GPUs appear to be actively training, and which appear idle?
2. GPUs 0 and 1 are running at 83–84°C. Is this a problem? At what temperature should you take action?
3. GPU 0 has 0 ECC errors. Why is this measurement important for a long training run?
4. GPUs 2 and 3 are at 4% and 3% utilization. You expected all 4 GPUs to be used. Name two possible explanations for why they're essentially idle.
5. GPU 0 is using 398W out of 400W. What does it mean to be "power-limited" and is this a problem?

**Submission Type:** text

---

### Exercise 2: Memory Leak Hunt

The following training loop has a memory leak that causes VRAM to grow every step until the job crashes. Study the code carefully and identify:

```python
training_history = []
running_outputs = []

for step, batch in enumerate(dataloader):
    inputs, labels = batch
    inputs = inputs.to("cuda")
    labels = labels.to("cuda")

    outputs = model(inputs)
    loss = criterion(outputs, labels)

    loss.backward()
    optimizer.step()
    optimizer.zero_grad()

    # Logging
    training_history.append({
        "step": step,
        "loss": loss,
        "outputs": outputs
    })

    running_outputs.append(outputs)

    if step % 100 == 0:
        avg_loss = sum(h["loss"] for h in training_history) / len(training_history)
        print(f"Step {step}, avg loss: {avg_loss:.4f}")
```

1. Identify every line that contributes to memory growing every step (there are at least three separate issues).
2. For each issue, explain *why* that line causes memory to grow.
3. Rewrite the logging section (the block after `optimizer.zero_grad()`) to fix all the memory issues while preserving the same information being logged.

**Submission Type:** text

---

### Exercise 3: Multi-GPU Scaling Investigation

Your team ran scaling experiments on a cluster of A100 80GB GPUs connected via NVLink. Here are the throughput results:

| GPUs | Throughput (samples/sec) | Scaling Efficiency |
|---|---|---|
| 1 | 120 | 100% |
| 2 | 228 | ?% |
| 4 | 408 | ?% |
| 8 | 576 | ?% |
| 16 | 672 | ?% |

1. Calculate the scaling efficiency for 2, 4, 8, and 16 GPUs. (Formula: efficiency = actual throughput / (N × single-GPU throughput) × 100%)
2. At what GPU count does efficiency drop most dramatically?
3. Based on the pattern, is the bottleneck likely to be communication latency (which scales gradually) or a load imbalance on one specific GPU (which would cause a sudden drop)? Explain your reasoning.
4. The 16-GPU run uses two separate 8-GPU servers connected by InfiniBand rather than NVLink. How does this explain the sharp efficiency drop, and what is the key difference between InfiniBand and NVLink that causes this?
5. If your budget allows renting either 16 GPUs for 1 hour or 8 GPUs for 2 hours (same total cost), which is more efficient for this workload and why?

**Submission Type:** text