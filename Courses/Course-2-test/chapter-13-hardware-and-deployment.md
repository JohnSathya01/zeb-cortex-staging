# Chapter 13: Hardware & Deployment Considerations

---

The performance of a translation system is not determined by the model alone. The hardware it runs on — the GPU's memory capacity, memory bandwidth, interconnect speed, and compute architecture — determines what is achievable in practice. Understanding the hardware landscape is essential for capacity planning, instance selection, cost optimization, and diagnosing performance bottlenecks.

---

## 13.1 GPU Hardware Landscape

Modern LLM inference runs almost exclusively on NVIDIA data center GPUs. The three GPU families most relevant to translation model deployment are the A100, H100, and L40S. Each has distinct characteristics that make it more or less suitable for different workloads.

### NVIDIA A100

The A100 was the dominant GPU for LLM training and inference through 2022–2023. It comes in two memory configurations:

| Specification | A100 40GB | A100 80GB |
|---|---|---|
| VRAM | 40 GB HBM2e | 80 GB HBM2e |
| Memory Bandwidth | 1,555 GB/s | 2,039 GB/s |
| BF16 Tensor Core TFLOPS | 312 | 312 |
| NVLink Bandwidth | 600 GB/s | 600 GB/s |
| PCIe Generation | PCIe 4.0 | PCIe 4.0 |
| Typical Cloud Instance | p4d (AWS), A100 VMs (GCP/Azure) | p4de (AWS), A100 80GB VMs |

The 80 GB variant is significantly more useful for large model inference — the additional VRAM accommodates larger KV-caches and enables running 30B+ models on a single GPU. The 80 GB version also has higher memory bandwidth, which directly translates to faster token generation.

The A100 supports NVLink 3.0 (600 GB/s bidirectional) for high-speed multi-GPU communication, making it well suited for tensor parallelism across up to 8 GPUs in an NVLink domain.

### NVIDIA H100

The H100 is NVIDIA's current flagship data center GPU, succeeding the A100. It represents a significant generational leap:

| Specification | H100 SXM5 | H100 PCIe |
|---|---|---|
| VRAM | 80 GB HBM3 | 80 GB HBM2e |
| Memory Bandwidth | 3,350 GB/s | 2,000 GB/s |
| BF16 Tensor Core TFLOPS | 989 | 756 |
| FP8 Tensor Core TFLOPS | 1,979 | 1,513 |
| NVLink Bandwidth | 900 GB/s (SXM) | 400 GB/s (PCIe) |
| Typical Cloud Instance | p5 (AWS), H100 VMs (GCP/Azure) | Various |

The H100 SXM5 variant (the high-performance server form factor) delivers roughly 1.6–2× the memory bandwidth of the A100 80GB. For LLM inference — which is almost always memory-bandwidth bound during the decode phase — this translates directly into faster token generation.

**FP8 support** is the other major H100 advantage. The H100 has dedicated FP8 Tensor Cores that deliver up to 2× the throughput of BF16 operations. Combined with TensorRT-LLM's native FP8 compilation support, H100 deployments can achieve latency and throughput numbers that are simply not possible on A100 hardware.

The H100 PCIe variant has the same VRAM but lower memory bandwidth and interconnect speed than the SXM5 — important to distinguish when comparing cloud offerings.

### NVIDIA L40S

The L40S is positioned between the A100 and H100 in capability and cost. It is designed for inference workloads and uses GDDR6 memory rather than HBM, which changes its performance profile:

| Specification | L40S |
|---|---|
| VRAM | 48 GB GDDR6 |
| Memory Bandwidth | 864 GB/s |
| BF16 Tensor Core TFLOPS | 362 |
| FP8 Tensor Core TFLOPS | 733 |
| NVLink Support | No (PCIe only) |
| Typical Cloud Instance | g6e (AWS), L40S VMs |

The L40S has lower memory bandwidth than the A100 80GB despite newer architecture — GDDR6 does not match HBM in bandwidth. However, it supports FP8 inference (like the H100), costs less per GPU than A100/H100, and its 48 GB VRAM is sufficient for most translation models up to ~30B parameters in INT8.

The lack of NVLink is the key limitation for multi-GPU deployments — tensor parallelism over PCIe is bandwidth-constrained and noticeably less efficient than NVLink-based setups.

### GPU Comparison Summary

| GPU | VRAM | Mem Bandwidth | FP8 Support | NVLink | Best For |
|---|---|---|---|---|---|
| A100 40GB | 40 GB | 1,555 GB/s | No | Yes | Models up to 12B, cost-efficient |
| A100 80GB | 80 GB | 2,039 GB/s | No | Yes | Models up to 32B, TP workloads |
| H100 SXM5 | 80 GB | 3,350 GB/s | Yes | Yes (900 GB/s) | Maximum performance, large models |
| H100 PCIe | 80 GB | 2,000 GB/s | Yes | No (PCIe) | FP8 inference, single-node |
| L40S | 48 GB | 864 GB/s | Yes | No | Cost-efficient FP8, models up to 20B |

---

## 13.2 VRAM Planning

Before deploying a translation model, it is essential to calculate whether the model fits within the available VRAM — and how much headroom remains for the KV-cache and activations. Running out of VRAM at inference time causes out-of-memory crashes and request failures.

### VRAM Breakdown

VRAM during inference is consumed by four components:

```
Total VRAM = Model Weights + KV-Cache + Activations + Framework Overhead
```

**1. Model Weights**

The largest fixed cost. Calculated directly from parameter count and precision:

| Model Size | BF16 | INT8 | INT4 |
|---|---|---|---|
| 3B | 6 GB | 3 GB | 1.5 GB |
| 7B | 14 GB | 7 GB | 3.5 GB |
| 12B | 24 GB | 12 GB | 6 GB |
| 32B | 64 GB | 32 GB | 16 GB |
| 70B | 140 GB | 70 GB | 35 GB |

**2. KV-Cache**

The KV-cache grows with every token generated and with the number of concurrent requests. The formula:

```
KV-Cache (bytes) = 2 × num_layers × num_kv_heads × head_dim × max_seq_len × batch_size × bytes_per_element
```

Breaking this down for a 12B model (32 layers, 8 KV heads with GQA, 128 head dim) at BF16 (2 bytes), serving a batch of 32 requests at 1,024 max tokens:

```
= 2 × 32 × 8 × 128 × 1,024 × 32 × 2
= 2 × 32 × 8 × 128 × 65,536
≈ 4.3 GB
```

Serving 128 concurrent requests at 2,048 max tokens would require:

```
= 2 × 32 × 8 × 128 × 2,048 × 128 × 2
≈ 68 GB
```

This demonstrates why KV-cache is often the binding constraint on concurrency — not the model weights themselves.

**3. Activations**

Intermediate activation tensors during computation. Typically 1–2 GB for batch sizes up to 32 on models up to 12B. Gradient checkpointing is not used at inference, so activations are smaller than during training.

**4. Framework Overhead**

PyTorch, CUDA context, inference engine buffers. Typically 1–3 GB regardless of model size.

### Practical VRAM Budgeting

A safe approach for estimating VRAM requirements:

```
Available VRAM for KV-cache = Total GPU VRAM
                             − Model Weights
                             − Activations (~2 GB)
                             − Framework Overhead (~2 GB)
                             − Safety Buffer (~5%)
```

For a 12B model in BF16 on an A100 80GB:

```
Available for KV-cache = 80 − 24 − 2 − 2 − 4 = 48 GB
```

With 48 GB for KV-cache, at 128 KB per token per request (as calculated above), the system can sustain approximately:

```
Max concurrent tokens in cache = 48 GB / 128 KB ≈ 375,000 tokens
At 1,024 tokens per request: ~366 concurrent requests
```

Quantizing to INT8 cuts model weights from 24 GB to 12 GB, freeing an additional 12 GB for KV-cache — directly increasing maximum concurrency.

---

## 13.3 Throughput and Efficiency

### Why LLM Inference is Memory-Bandwidth Bound

Intuition might suggest that LLM inference is limited by compute — after all, a transformer forward pass involves billions of floating-point operations. In practice, the decode phase of LLM inference is almost always **memory-bandwidth bound**, not compute bound.

Here is why: during the decode phase, the model generates one token at a time. For each token, the model loads all of its weight parameters from GPU memory into the compute units, performs the attention and FFN operations, and produces a single output token. The ratio of computation to memory access — called **arithmetic intensity** — is very low when the batch size is small.

```
Arithmetic Intensity = FLOPs per forward pass / Bytes transferred from memory

For a 12B model, single token decode:
  FLOPs ≈ 2 × 12 × 10⁹ = 24 GFLOPs
  Bytes moved ≈ 24 GB (all model weights must be read)
  Arithmetic Intensity ≈ 1 FLOP/byte
```

Modern GPUs can perform hundreds of FLOPs per byte of memory bandwidth. At 1 FLOP/byte, the GPU's compute units are mostly idle — they are waiting for data to arrive from memory, not running out of compute capacity.

This has a critical implication: **memory bandwidth, not TFLOPS, is the primary determinant of decode speed.**

### Memory Bandwidth and Token Generation Speed

Tokens per second during the decode phase scales directly with memory bandwidth:

```
Tokens per second ≈ Memory Bandwidth / Model Size in Bytes
```

For a 12B BF16 model:

| GPU | Memory Bandwidth | Approx Tokens/sec (12B BF16, batch=1) |
|---|---|---|
| A100 40GB | 1,555 GB/s | ~65 tokens/sec |
| A100 80GB | 2,039 GB/s | ~85 tokens/sec |
| H100 SXM5 | 3,350 GB/s | ~140 tokens/sec |
| L40S | 864 GB/s | ~36 tokens/sec |

These are approximate single-request numbers. With quantization to INT8, the model is 12 GB instead of 24 GB, roughly doubling tokens per second on the same hardware:

| GPU | Approx Tokens/sec (12B INT8, batch=1) |
|---|---|
| A100 80GB | ~170 tokens/sec |
| H100 SXM5 | ~280 tokens/sec |

### Prefill vs. Decode Throughput

LLM inference has two distinct phases with different performance characteristics:

**Prefill phase:** The full input prompt (source text + instruction) is processed in a single forward pass to initialize the KV-cache. This is a large matrix multiplication — compute intensive and benefits from high TFLOPS. For a 500-token prompt, prefill takes a single forward pass and completes in milliseconds.

**Decode phase:** Each output token is generated one at a time via the autoregressive loop. This is memory-bandwidth bound, as described above. For a 200-token translation, this requires 200 sequential decode steps.

For typical translation workloads (short prompts, moderate-length outputs), total latency is dominated by the decode phase. However, for long document translation where the source prompt is thousands of tokens, prefill latency becomes significant.

### Batching and Throughput Scaling

At batch size 1, throughput is limited by memory bandwidth as shown above. As batch size increases, arithmetic intensity rises — more computation is performed per byte of memory read — and throughput scales up:

| Batch Size | Throughput Scaling | Latency Impact |
|---|---|---|
| 1 | Baseline | Lowest latency |
| 8 | ~4–6× throughput | Moderate latency increase |
| 32 | ~10–15× throughput | Higher latency |
| 128 | ~20–30× throughput | Highest latency |

The throughput gains taper off as batch size increases because at some point the GPU becomes compute-bound rather than memory-bandwidth bound. The optimal batch size for a given latency target sits at the knee of this curve.

---

## 13.4 Multi-GPU Deployment

### When to Scale Up vs. Scale Out

**Scaling up** means using a larger, faster GPU — moving from an A100 40GB to an A100 80GB, or from an A100 to an H100. This increases VRAM capacity, memory bandwidth, and potentially compute per GPU. Scaling up is the preferred first step because it avoids the complexity and communication overhead of multi-GPU setups.

**Scaling out** means adding more GPUs, either within a node (multi-GPU) or across nodes (multi-node). This is necessary when a single GPU cannot hold the model (memory constraint) or cannot deliver the required throughput (compute constraint).

| Constraint | Solution |
|---|---|
| Model too large for one GPU | Tensor Parallelism across multiple GPUs |
| Throughput insufficient | Data Parallelism — replicate model across GPUs |
| Both model size and throughput | 3D Parallelism (TP + DP) |

### NVLink vs. PCIe Impact on Tensor Parallelism

Tensor parallelism requires frequent all-reduce communication between GPUs — at every layer of every forward pass. The bandwidth of the GPU interconnect directly determines how much of this communication overhead is tolerable.

| Interconnect | Bandwidth | TP Efficiency |
|---|---|---|
| NVLink 3.0 (A100) | 600 GB/s | High — minimal overhead |
| NVLink 4.0 (H100 SXM5) | 900 GB/s | Very high |
| PCIe 4.0 | ~64 GB/s | Low — significant overhead |
| PCIe 5.0 | ~128 GB/s | Moderate |

For a 4-GPU tensor parallel deployment, NVLink reduces communication overhead to near-negligible. The same deployment over PCIe can lose 30–50% of theoretical throughput to communication bottlenecks.

**Practical rule:** use NVLink-connected GPUs (multi-GPU server nodes with SXM form factor GPUs) for tensor parallelism. Use PCIe-connected GPUs only for data parallelism, where GPUs operate independently and do not need to communicate during inference.

### Single-Node vs. Multi-Node

| | Single Node | Multi-Node |
|---|---|---|
| Max GPUs | 8 (typical) | Unlimited |
| Interconnect | NVLink (fast) | InfiniBand / Ethernet (slower) |
| Latency overhead | Low | Higher |
| Operational complexity | Low | High |
| Best for | Models up to ~70B | Models 70B+ |

For most translation deployments — even with large models — a single 8-GPU node with NVLink is sufficient and significantly simpler to operate than a multi-node cluster.

---

## 13.5 Monitoring in Production

A deployed translation system requires continuous monitoring to detect quality regressions, performance degradation, and capacity issues before they impact users.

### Key Metrics to Monitor

**Latency metrics:**

| Metric | Definition | Alert Threshold Example |
|---|---|---|
| TTFT (Time to First Token) | Time from request received to first token returned | > 500ms at P95 |
| TPOT (Time Per Output Token) | Average time between successive output tokens | > 50ms at P95 |
| End-to-end latency | Total request duration | > 5s at P95 |
| Queue wait time | Time request spent waiting before processing | > 1s at P95 |

**Throughput metrics:**

| Metric | Definition |
|---|---|
| Requests per second (RPS) | Total requests completed per second |
| Output tokens per second | Total generation throughput across all requests |
| Batch size (rolling average) | Average requests processed per batch iteration |

**GPU resource metrics:**

| Metric | Definition | What It Reveals |
|---|---|---|
| GPU utilization (%) | Fraction of GPU compute being used | Low: underutilized; High: at capacity |
| GPU memory used (GB) | Total VRAM consumed | Approaching limit → risk of OOM |
| KV-cache utilization (%) | Fraction of KV-cache capacity in use | Near 100% → concurrency is memory-limited |
| Memory bandwidth utilization | Fraction of peak bandwidth being used | Near 100% → decode throughput is maxed |

### Diagnosing Common Issues

**High latency with low GPU utilization:**
Requests are spending time in the queue, not on the GPU. The system is receiving more requests than it can process. Either scale out (add more replicas) or increase batch size to improve throughput.

**High latency with high GPU utilization:**
The GPU is working hard but individual requests are slow. Likely cause: batch sizes too large (each request waits for others in the batch), very long input sequences, or high beam width. Reduce batch size or beam width to recover latency.

**Rising KV-cache utilization without rising request rate:**
Requests are taking longer than expected to complete — possibly due to very long outputs, a hung request, or a generation loop that is not terminating. Check for missing EOS tokens or generation length limits not being enforced.

**Sudden quality drop without model change:**
Check for upstream changes — tokenizer version mismatch, prompt format change, language detection failures routing requests to the wrong model, or input normalization issues. Translation quality regressions without a model change are almost always a pipeline issue, not a model issue.
