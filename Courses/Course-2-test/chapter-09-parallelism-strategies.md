# Chapter 9: Parallelism Strategies

---

As translation models grow larger, a single GPU eventually becomes insufficient — either because the model's weights do not fit in one GPU's memory, or because a single GPU cannot deliver the throughput a production system requires. Parallelism strategies distribute the model and its workload across multiple GPUs to overcome these limits.

There are three fundamental parallelism strategies, each solving a different part of the problem. Understanding when to use each — and how they combine — is essential for designing and operating large-scale translation infrastructure.

---

## 9.1 Why Parallelism?

### The Memory Wall

Every model parameter stored in BF16 precision takes 2 bytes of GPU memory. A model with 12 billion parameters therefore requires approximately 24 GB just to store its weights — before accounting for the KV-cache, activations during computation, or optimizer states during training.

| Model Size | Weights (BF16) | Fits on Single H100 (80 GB)? |
|---|---|---|
| 3B parameters | ~6 GB | Yes, with room to spare |
| 12B parameters | ~24 GB | Yes |
| 32B parameters | ~64 GB | Barely (tight with KV-cache) |
| 70B parameters | ~140 GB | No — requires multiple GPUs |
| 180B parameters | ~360 GB | No — requires many GPUs |

For models that exceed a single GPU's memory, parallelism is not optional — it is a requirement.

### The Throughput Ceiling

Even when a model fits on a single GPU, that GPU has a fixed compute capacity. If a translation service needs to process 1,000 requests per second and a single GPU can only handle 200, no amount of optimization will close that gap on one GPU. Distributing requests across multiple GPUs is the only way to scale throughput proportionally with hardware.

These two motivations — memory and throughput — lead to different parallelism strategies. The right strategy depends on which constraint is binding.

---

## 9.2 Data Parallelism (DP)

Data parallelism is the simplest and most intuitive strategy. The core idea: keep a complete copy of the model on every GPU, and split the incoming requests across GPUs so each one handles a different subset.

### How It Works

Imagine serving a batch of 64 translation requests with 4 GPUs. With data parallelism:
- GPU 1 handles requests 1–16
- GPU 2 handles requests 17–32
- GPU 3 handles requests 33–48
- GPU 4 handles requests 49–64

Each GPU runs a full forward pass on its subset independently. There is no communication between GPUs during inference — each GPU produces its outputs and returns them. The results are collected and returned to the callers.

```
Incoming requests: [R1, R2, R3, ... R64]
                         ↓
          ┌──────────┬──────────┬──────────┬──────────┐
          │  GPU 1   │  GPU 2   │  GPU 3   │  GPU 4   │
          │  R1-R16  │  R17-R32 │  R33-R48 │  R49-R64 │
          │ Full model│Full model│Full model│Full model│
          └──────────┴──────────┴──────────┴──────────┘
                         ↓
                  Collect all outputs
```

### When to Use Data Parallelism

Data parallelism works well when the model fits comfortably on a single GPU and the goal is to increase throughput. Adding more GPUs with data parallelism scales throughput nearly linearly — 4 GPUs deliver roughly 4× the request throughput of 1 GPU.

It does not help when the model is too large to fit on a single GPU. If a 70B parameter model cannot be loaded onto one GPU, replicating it four times does not solve that problem.

**Best for:** throughput scaling when the model fits on a single GPU.

---

## 9.3 Tensor Parallelism (TP)

Tensor parallelism takes a different approach: instead of replicating the full model on each GPU, it splits the model's weight matrices across GPUs so each GPU holds only a portion of each layer.

### The Core Idea

Think of a weight matrix as a large table. Tensor parallelism slices that table — either by columns or by rows — and gives each GPU one slice. Each GPU computes its part of the result, then the partial results are combined across GPUs to produce the full output.

Visualized simply:

```
Full weight matrix W (too large or too slow for one GPU):

  [ W_col1 | W_col2 | W_col3 | W_col4 ]
       ↓         ↓         ↓         ↓
    GPU 1      GPU 2      GPU 3      GPU 4
  (holds       (holds     (holds     (holds
  col slice 1) col slice 2) col slice 3) col slice 4)
```

Each GPU multiplies the input by its slice of the weight matrix, producing a partial output. The partial outputs from all GPUs are then summed together (an **all-reduce** operation) to produce the complete result.

### Attention and FFN Splits

For transformer models, tensor parallelism is applied to both the attention layers and the feed-forward layers:

**Attention layers:**
- The Query, Key, and Value projection matrices are split column-wise — each GPU computes attention for a subset of the attention heads
- The output projection matrix is split row-wise — each GPU holds the rows corresponding to its attention head subset
- After the output projection, an all-reduce combines the partial outputs across GPUs

**Feed-forward layers:**
- The first (up) projection is split column-wise — each GPU computes a subset of the hidden activations
- The second (down) projection is split row-wise — each GPU reduces back to the model dimension
- An all-reduce after the down projection combines the results

The result is that every layer is split across GPUs, reducing the per-GPU memory requirement by the number of GPUs (the **tensor parallel degree**). A model that requires 80 GB on one GPU would require only 20 GB per GPU with a tensor parallel degree of 4.

### The All-Reduce Communication Cost

The all-reduce operation — synchronizing partial results across GPUs at each layer — requires communication between GPUs. This communication has a cost: GPUs must wait for each other before proceeding to the next layer.

The communication overhead is significant enough that tensor parallelism is most effective when GPUs are connected by high-bandwidth interconnects such as **NVLink** (NVIDIA's GPU-to-GPU interconnect), which provides much higher bandwidth than standard PCIe connections. Over PCIe, the communication overhead can negate the compute gains from splitting the model.

**Best for:** models too large to fit on a single GPU, or reducing per-GPU memory pressure when using high-bandwidth GPU interconnects.

---

## 9.4 Pipeline Parallelism (PP)

Pipeline parallelism takes yet another approach: instead of splitting individual layers across GPUs, it assigns entire groups of layers to different GPUs. Each GPU is responsible for a contiguous slice of the model's depth.

### How It Works

Imagine a 48-layer model distributed across 4 GPUs:

```
GPU 1: Layers  1 – 12   (first quarter of the model)
GPU 2: Layers 13 – 24   (second quarter)
GPU 3: Layers 25 – 36   (third quarter)
GPU 4: Layers 37 – 48   (final quarter)
```

A request enters GPU 1, passes through layers 1–12, and the output is sent to GPU 2. GPU 2 processes layers 13–24 and passes to GPU 3, and so on until GPU 4 produces the final output.

Each GPU only needs to store the weights for its assigned layers — 12 layers instead of 48 — reducing per-GPU memory to one quarter of the full model.

### The Pipeline Bubble Problem

The naive pipeline has an efficiency problem: while GPU 2 is processing the first request, GPU 1 is idle, waiting for GPU 2 to finish so it can send the next request through. Similarly, GPU 3 waits for GPU 2, and so on. This idle time is called a **pipeline bubble**.

```
Naive pipeline (with bubbles):

GPU 1: [Process R1]  [idle]     [idle]     [idle]     [Process R2] ...
GPU 2:    [wait]  [Process R1]  [idle]     [idle]        [wait]     ...
GPU 3:    [wait]     [wait]  [Process R1]  [idle]        [wait]     ...
GPU 4:    [wait]     [wait]     [wait]  [Process R1]     [wait]     ...
```

### Micro-batching to Fill the Pipeline

The solution is **micro-batching**: split each batch into smaller micro-batches and feed them into the pipeline in rapid succession, so multiple micro-batches are in-flight simultaneously at different stages.

```
Pipeline with micro-batching (M1, M2, M3, M4 = micro-batches):

GPU 1: [M1] [M2] [M3] [M4] [idle]
GPU 2:      [M1] [M2] [M3] [M4]
GPU 3:           [M1] [M2] [M3] [M4]
GPU 4:                [M1] [M2] [M3] [M4]
```

With enough micro-batches, all GPUs stay busy most of the time — the pipeline bubble shrinks to a small fraction of total compute time. The pipeline is never perfectly full (there is always a small bubble at the start and end of each batch), but micro-batching reduces the efficiency loss to acceptable levels.

**Best for:** very deep models where tensor parallelism alone does not solve the memory problem, or where communication bandwidth between GPUs is limited and layer-level splits are preferable to tensor-level splits.

---

## 9.5 Combining Strategies — 3D Parallelism

In large-scale deployments — models with tens or hundreds of billions of parameters running on clusters of hundreds of GPUs — no single parallelism strategy is sufficient on its own. Real systems combine all three strategies simultaneously, which is known as **3D parallelism**.

### How the Three Dimensions Work Together

Each dimension addresses a different axis of the scaling problem:

| Parallelism | What It Splits | Primary Benefit |
|---|---|---|
| Data Parallelism (DP) | Requests / batch | Scales throughput |
| Tensor Parallelism (TP) | Weight matrices within layers | Reduces per-GPU memory for wide models |
| Pipeline Parallelism (PP) | Layer groups across depth | Reduces per-GPU memory for deep models |

In a 3D parallel configuration, GPUs are organized into a three-dimensional grid:
- The TP dimension groups GPUs that share a slice of each layer
- The PP dimension chains TP groups into pipeline stages
- The DP dimension replicates the full pipeline for throughput scaling

A simple example — 16 GPUs with TP=2, PP=4, DP=2:

```
Pipeline stage 1       Pipeline stage 2       Pipeline stage 3       Pipeline stage 4
(Layers 1–12)          (Layers 13–24)         (Layers 25–36)         (Layers 37–48)

[GPU 1 | GPU 2]   →   [GPU 3 | GPU 4]   →   [GPU 5 | GPU 6]   →   [GPU 7 | GPU 8]
 TP pair (replica 1)   TP pair (replica 1)   TP pair (replica 1)   TP pair (replica 1)

[GPU 9 | GPU 10]  →   [GPU 11| GPU 12]  →   [GPU 13| GPU 14]  →   [GPU 15| GPU 16]
 TP pair (replica 2)   TP pair (replica 2)   TP pair (replica 2)   TP pair (replica 2)
```

- Within each TP pair, the layer weights are split across 2 GPUs (tensor parallelism)
- Across the 4 pipeline stages, different layer groups reside on different GPU pairs (pipeline parallelism)
- The two complete replicas handle different requests simultaneously (data parallelism)

### GPU Topology Matters

3D parallelism requires careful attention to how GPUs are physically connected:
- **NVLink** — high-bandwidth, low-latency GPU-to-GPU interconnect within a node. Ideal for tensor parallelism, which requires frequent all-reduce communication
- **InfiniBand / NVLink Switch** — high-speed network between nodes. Used for pipeline and data parallelism, which have lower communication frequency
- **PCIe** — the fallback when NVLink is not available. Adequate for data parallelism but a bottleneck for tensor parallelism

The general principle: place GPUs that share tensor parallelism on the same node (NVLink bandwidth), and use inter-node links for pipeline and data parallelism (less frequent communication).

### Practical Takeaway

For most translation deployments:
- A model that fits on one GPU: use data parallelism to scale throughput
- A model that fits on one node (2–8 GPUs): use tensor parallelism within the node
- A model that spans multiple nodes: add pipeline parallelism across nodes, data parallelism for throughput

3D parallelism at full scale is the domain of the largest models (70B+) running on dedicated GPU clusters. Understanding the principles — even without operating at that scale — helps in interpreting infrastructure documentation, selecting hardware configurations, and reasoning about the capacity limits of a given deployment.
