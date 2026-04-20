# Chapter 11: Inference Engines — vLLM & TensorRT-LLM

---

Chapter 10 covered how to compress a model through quantization. Once the model is ready — at the right precision and size — it needs to be served. Loading model weights and calling them directly from a Python script works for experimentation, but it is not production. An inference engine is the software layer that makes a translation model into a reliable, efficient, scalable service.

---

## 11.1 What an Inference Engine Does

A raw model loaded in a research environment has no concept of multiple simultaneous users, memory limits, request queues, or latency targets. Running it naively means:

- One request processed at a time — GPU sits mostly idle between requests
- KV-cache memory allocated and freed inefficiently — fragmentation wastes GPU memory
- No batching — throughput is a fraction of what the hardware can deliver
- No serving API — the model cannot be called over a network

An inference engine solves all of these problems. It is the production wrapper around the model that handles everything between receiving a request and returning the translation.

### Key Responsibilities

**KV-Cache Management**
As covered in Chapter 5, the KV-cache grows with each generated token and must be maintained in GPU memory for the duration of each request. Naively allocating a fixed memory block per request wastes memory — most translations are shorter than the maximum allocation. An inference engine manages KV-cache memory dynamically, allocating only what is needed and reclaiming it immediately when a request completes.

**Continuous Batching**
Rather than waiting for a fixed batch to fill before processing any requests, an inference engine inserts new requests into the active batch at the token level — as soon as any existing request finishes a generation step and frees capacity. This keeps GPU utilization high without holding requests in a queue waiting for a batch to fill.

**Kernel Fusion**
A transformer forward pass involves many sequential operations — matrix multiplications, layer normalizations, activation functions, residual additions. Each operation normally requires a separate GPU kernel launch, with memory reads and writes between each one. Kernel fusion combines multiple operations into a single kernel, eliminating intermediate memory traffic and reducing kernel launch overhead. This is one of the primary sources of speed improvement in optimized inference engines.

**Tensor Operation Optimization**
Beyond fusion, inference engines apply hardware-specific optimizations to individual operations — selecting the most efficient matrix multiplication algorithm for the current batch size and sequence length, using specialized attention kernels (such as FlashAttention) that compute attention in a memory-efficient way without materializing the full attention matrix, and optimizing memory layout for the target GPU architecture.

**Serving API**
Inference engines expose the model as a network service — typically an HTTP or gRPC API — that accepts translation requests, manages the queue, and returns results. This includes request validation, timeout handling, health checks, and metrics endpoints for monitoring.

---

## 11.2 vLLM

vLLM is the most widely adopted open-source inference engine for large language models. Its core contribution — PagedAttention — fundamentally changed how KV-cache memory is managed in LLM serving and made high-concurrency inference practical on standard GPU hardware.

### PagedAttention — The Core Innovation

Before PagedAttention, KV-cache memory was allocated per request in contiguous blocks. A system serving 100 concurrent requests with a maximum sequence length of 2,048 tokens would pre-allocate 100 × 2,048 token-slots of KV-cache memory — regardless of how long each translation actually was. Most of this allocation was wasted: a 50-token translation would occupy the same memory slot as a 2,000-token one.

Worse, contiguous allocation leads to fragmentation. As requests of different lengths complete and free their memory blocks, the available memory becomes fragmented into gaps that are too small to fit new requests — even when total free memory is sufficient.

PagedAttention solves this by managing KV-cache memory the way an operating system manages virtual memory with paging. Instead of one contiguous block per request, KV-cache memory is divided into fixed-size **pages** — small blocks that can be allocated individually. Each request is assigned a sequence of pages as it grows, and pages are returned to a free pool when the request completes.

```
Without PagedAttention:
  Request A: [████████████████████░░░░░░░░░░]  ← 20 tokens used, 10 wasted
  Request B: [██████░░░░░░░░░░░░░░░░░░░░░░░░]  ← 6 tokens used, 24 wasted
  Request C: [████████████████████████████░░]  ← 28 tokens used, 2 wasted
  Fragmented gaps cannot be reused

With PagedAttention (page size = 4 tokens):
  Free pages: [p1][p2][p3][p4][p5][p6][p7][p8][p9][p10]...
  Request A uses: [p1][p2][p3][p4][p5]  → allocates exactly 5 pages as needed
  Request B uses: [p6][p7]              → allocates exactly 2 pages
  Completed requests return pages to pool immediately
```

The result is dramatically reduced memory waste, elimination of fragmentation, and the ability to serve significantly more concurrent requests on the same GPU hardware.

### Continuous Batching Architecture

vLLM implements continuous batching at the iteration level — new requests are inserted into the active batch after every single generation step, not after an entire request completes. This means:

- A newly arrived short translation request does not wait for a long document translation to finish
- GPU slots freed by completed requests are immediately filled with waiting requests
- The batch composition changes dynamically at every step, keeping GPU utilization consistently high

### Strengths

- **Simple setup** — pip-installable, well-documented, active open-source community
- **Hardware-agnostic within CUDA** — runs on any CUDA-capable NVIDIA GPU without hardware-specific compilation
- **Flexible** — easy to update, iterate, and integrate with HuggingFace model formats
- **OpenAI-compatible API** — exposes a serving interface compatible with OpenAI's API format, simplifying integration with existing tooling

### Limitations

- **CUDA-only** — does not support AMD GPUs, Google TPUs, or other accelerators without third-party forks
- **Less hardware-specific optimization** — does not exploit the deepest NVIDIA hardware features the way TensorRT-LLM does, leaving some performance on the table for latency-critical workloads
- **Memory overhead** — the paging system has its own metadata overhead, which is minor but present

---

## 11.3 TensorRT-LLM

TensorRT-LLM is NVIDIA's inference engine, built for maximum performance on NVIDIA hardware. Where vLLM is a general-purpose serving framework, TensorRT-LLM is a compilation toolchain — it transforms model weights into a hardware-optimized binary that extracts maximum performance from NVIDIA Tensor Cores.

### Model Compilation at Build Time

The defining characteristic of TensorRT-LLM is that the model is compiled before serving. Rather than loading PyTorch weights and running them through generic CUDA kernels at inference time, TensorRT-LLM analyzes the model architecture and generates specialized CUDA kernels tuned for:

- The specific model architecture (number of layers, heads, hidden dimension)
- The target GPU (A100, H100, L40S — each has different Tensor Core configurations)
- The target precision (FP16, BF16, INT8, FP8)
- The expected batch sizes and sequence lengths

This compilation step can take minutes to hours, but it produces an engine that runs faster than any generic inference approach on the target hardware. The compiled engine has fused kernels, optimized memory layouts, and precision-matched operations that are impossible to achieve with runtime flexibility.

### Quantization Built Into the Pipeline

TensorRT-LLM integrates quantization directly into the compilation pipeline. INT8 and FP8 quantization are not post-hoc wrappers — they are natively supported formats that the compiler uses when generating kernels. On H100 GPUs, FP8 Tensor Cores can deliver up to 2× the throughput of BF16, and TensorRT-LLM is currently the primary way to access this capability in production.

### Strengths

- **Maximum Tensor Core utilization** — compiled kernels are specifically optimized for the target GPU's hardware capabilities
- **Lowest latency on NVIDIA hardware** — for latency-critical, single-request scenarios, TensorRT-LLM consistently outperforms vLLM
- **Native FP8 support** — takes full advantage of H100 FP8 Tensor Cores
- **NVIDIA support** — maintained by NVIDIA with guaranteed compatibility with new GPU architectures

### Limitations

- **Complex build pipeline** — compilation requires NVIDIA tooling, specific driver versions, and significant setup effort; updating to a new model version requires recompilation
- **NVIDIA-only** — strictly tied to NVIDIA GPU hardware
- **Less flexible for iteration** — the compile-then-serve workflow is slower to iterate on than vLLM's load-and-serve approach
- **Longer time-to-first-serve** — the compilation step adds significant lead time before the engine is ready to handle requests

---

## 11.4 Engine Comparison Table

| Dimension | vLLM | TensorRT-LLM |
|---|---|---|
| **Latency (single request)** | Good | Best |
| **Throughput (high concurrency)** | Excellent | Excellent |
| **Ease of setup** | Simple | Complex |
| **Time to first serve** | Minutes | Hours (compilation) |
| **Quantization support** | INT8, INT4, FP8 (via plugins) | INT8, INT4, FP8 (native) |
| **Multi-GPU support** | Yes (TP, PP) | Yes (TP, PP) |
| **Hardware** | NVIDIA (CUDA) | NVIDIA only |
| **Model format** | HuggingFace native | Requires conversion |
| **Update / iteration speed** | Fast | Slow (recompile) |
| **Open source** | Yes (Apache 2.0) | Yes (Apache 2.0) |
| **Best for** | General serving, prototyping, multi-model deployments | Maximum performance, latency-critical production |

---

## 11.5 Choosing the Right Engine

The decision between vLLM and TensorRT-LLM comes down to three dimensions: stage of development, latency requirements, and operational constraints.

### Prototyping and Development

vLLM is the clear choice during development and experimentation. It loads HuggingFace model weights directly, requires no compilation, and can be running in minutes. Swapping models, testing quantization levels, and iterating on serving configurations are all fast operations. The performance is good enough to validate that the translation system works correctly before investing in production optimization.

### Latency-Critical Production

When the system must meet strict latency SLAs — real-time translation for interactive applications, voice pipelines, or any scenario where milliseconds matter — TensorRT-LLM's compiled kernels deliver measurably lower latency than vLLM on the same hardware. The compilation overhead is a one-time cost paid at deployment, not at inference time.

### Throughput-Oriented Batch Workloads

For large-scale document translation, overnight batch processing, or any workload where total throughput matters more than individual request latency, both engines perform similarly at high concurrency. vLLM's PagedAttention and continuous batching are highly effective for these workloads, and the simpler operational model often tips the balance toward vLLM.

### Hardware Constraints

If the deployment environment includes non-NVIDIA hardware — AMD GPUs, Google TPUs, or future accelerators — vLLM is the only option of the two. TensorRT-LLM is exclusively NVIDIA. For mixed or multi-cloud environments where hardware flexibility is a requirement, vLLM's hardware-agnostic design (within CUDA) is an important advantage.

### Practical Recommendation

A common pattern in production translation systems is to develop and validate with vLLM, then migrate to TensorRT-LLM for the latency-critical serving path once the model and configuration are finalized. This captures the iteration speed benefits of vLLM during development and the performance benefits of TensorRT-LLM in production — at the cost of maintaining two serving configurations.

For teams without dedicated ML infrastructure engineers, the operational complexity of TensorRT-LLM may outweigh its performance benefits. vLLM at scale with appropriate hardware sizing delivers production-grade performance for the majority of translation workloads.
