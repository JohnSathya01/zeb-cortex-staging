# Chapter 10: Quantization & Model Compression

---

Chapter 9 established that large models require significant GPU memory — a 12B parameter model needs ~24 GB in BF16, and models above 32B push beyond what a single GPU can hold. Parallelism distributes this load across multiple GPUs, but it increases hardware cost and operational complexity. Quantization offers a complementary approach: make the model itself smaller by representing its weights at lower numerical precision, so it fits in less memory and runs faster on the hardware you already have.

---

## 10.1 Why Quantize?

### Memory Reduction

The most immediate benefit of quantization is reduced model size. The relationship is direct — halving the number of bits per parameter halves the memory required:

| Precision | Bits per Parameter | 12B Model Size | 70B Model Size |
|---|---|---|---|
| FP32 | 32 | ~48 GB | ~280 GB |
| BF16 / FP16 | 16 | ~24 GB | ~140 GB |
| INT8 | 8 | ~12 GB | ~70 GB |
| INT4 | 4 | ~6 GB | ~35 GB |

The practical impact is significant. A 12B model in BF16 requires two A100 40 GB GPUs. The same model in INT4 fits comfortably on a single GPU with room for the KV-cache and activations. This directly affects infrastructure cost and deployment simplicity.

### Inference Speed

Beyond memory, quantization improves inference speed. Modern GPUs have specialized hardware units — Tensor Cores — that perform integer arithmetic (INT8, INT4) faster than floating-point arithmetic. Smaller weights also transfer faster from GPU memory to compute units, which is often the bottleneck in LLM inference (memory bandwidth, not raw compute).

The combined effect: INT8 quantization typically delivers 1.5–2× faster inference than BF16, and INT4 can reach 2–4× faster, depending on the hardware and the specific operation.

### Cost Reduction

In cloud deployments, GPU memory is one of the primary cost drivers. A model that requires 4 GPUs in BF16 but fits on 1 GPU in INT4 reduces the hardware cost for that deployment by roughly 4×. For translation services serving high volumes, this cost difference compounds significantly over time.

---

## 10.2 Quantization Levels

### The Precision Ladder

Quantization reduces the number of bits used to represent each parameter. Each step down the ladder trades numerical precision for memory and speed:

**FP32 (32-bit floating point)**
The standard training precision. 32 bits per parameter, with a large dynamic range and high precision. Used during training and as the reference baseline for quality comparisons. Rarely used for inference due to high memory cost.

**FP16 (16-bit floating point)**
Half the memory of FP32. Fast on modern GPUs. The risk is numerical overflow — FP16 has a smaller range than FP32, and very large activation values can exceed its representable range, causing instability. Common in older inference pipelines.

**BF16 (Brain Float 16)**
Also 16 bits, but allocates more bits to the exponent (range) and fewer to the mantissa (precision) compared to FP16. This makes BF16 numerically stable even for large activation values, while keeping the memory footprint of FP16. BF16 is the standard precision for modern LLM inference and is supported natively on A100, H100, and recent GPU architectures.

**INT8 (8-bit integer)**
Weights are stored as 8-bit integers instead of floating-point values. At inference time, weights are dequantized (converted back to floating-point) before computation, or integer arithmetic is used directly with specialized kernels. INT8 halves memory compared to BF16 with minor quality degradation for most language pairs.

**INT4 (4-bit integer)**
Weights stored in 4 bits — a quarter of BF16's memory. The aggressive compression means more information is lost per parameter. Quality degradation becomes noticeable, particularly for complex or low-resource language pairs. INT4 is most viable when memory constraints are severe and some quality trade-off is acceptable.

**FP8 (8-bit floating point)**
A newer format supported on H100 and later GPUs. Like BF16 but at 8 bits — combines the numerical stability of floating-point with the compactness of INT8. FP8 is increasingly adopted as a middle ground between BF16 quality and INT8 efficiency.

### Quantization Granularity

The same precision level can be applied at different granularities, with different quality and efficiency trade-offs:

**Per-tensor quantization**
A single scale factor is computed for the entire weight matrix. Simple and fast, but if the matrix has a wide range of values, a single scale cannot represent all of them accurately — outlier values compress poorly and lose precision.

**Per-channel quantization**
A separate scale factor is computed for each row or column of the weight matrix. More accurate than per-tensor because each channel's values are scaled independently, preserving outliers better. Moderate overhead.

**Per-token quantization**
A separate scale factor for each token's activation vector at runtime. The most accurate quantization granularity for activations, but requires computing scale factors dynamically during inference. Used in high-quality INT8 inference pipelines.

The general rule: finer granularity → better quality → more overhead. Per-channel is the practical sweet spot for weight quantization in most production deployments.

---

## 10.3 Post-Training Quantization (PTQ) vs. QAT

### Post-Training Quantization (PTQ)

PTQ quantizes a model after training is complete, without any further gradient updates. The model's weights are analyzed and compressed using a calibration dataset — a small representative sample of inputs that helps determine the appropriate scale factors for each layer.

PTQ is the dominant approach in practice because it requires no training infrastructure and can be applied to any pretrained model in minutes to hours.

**GPTQ (Generative Pre-trained Transformer Quantization)**
GPTQ is a widely used PTQ algorithm specifically designed for large language models. It quantizes one layer at a time, using second-order gradient information to minimize the error introduced by quantization. By solving for the best possible INT4 or INT8 representation of each layer independently, GPTQ achieves significantly better quality than naive rounding-based quantization.

The key insight of GPTQ: rather than simply rounding each weight to the nearest integer, it compensates for the rounding error in one weight by slightly adjusting other weights in the same layer, keeping the layer's overall output as close to the original as possible.

**AWQ (Activation-Aware Weight Quantization)**
AWQ observes that not all weights are equally important — weights that are activated by large input values have a disproportionate impact on the output. Quantizing these high-salience weights less aggressively (keeping them at higher precision) while quantizing lower-salience weights more aggressively achieves better quality at the same average bit-width.

AWQ identifies high-salience weights by analyzing activation magnitudes on a calibration dataset and protects them during quantization. It consistently outperforms GPTQ on quality-sensitive tasks, including translation.

### Quantization-Aware Training (QAT)

QAT simulates quantization during the training or fine-tuning process. Fake quantization operations are inserted into the model's forward pass — weights and activations are quantized and dequantized at each step, so the model "feels" the effect of quantization while gradients still flow.

Because the model is trained with quantization present, it learns to adjust its weights to be robust to the precision loss. The result is a quantized model that retains more quality than a PTQ-quantized version of the same model.

The trade-off: QAT requires running a full training loop, which demands significant compute, time, and access to training data. It is most appropriate when:
- The target precision is very aggressive (INT4 or lower)
- The use case demands maximum quality at a given bit-width
- Training infrastructure is already in place for fine-tuning

For most production translation deployments, PTQ with GPTQ or AWQ is sufficient and far more practical.

| | PTQ | QAT |
|---|---|---|
| Requires training | No | Yes |
| Time to quantize | Minutes to hours | Hours to days |
| Quality at INT8 | Good | Very good |
| Quality at INT4 | Moderate | Good |
| Best for | Most production use cases | Maximum quality at aggressive compression |

---

## 10.4 Impact on Translation Quality

### Quality Degradation Patterns

Quantization always introduces some quality loss — the question is how much, and whether it is acceptable for the use case. The degradation follows a consistent pattern:

- **BF16 → INT8:** Minimal quality loss for most language pairs. COMET and BLEU scores typically drop by less than 1 point. For high-resource pairs (English ↔ French, Spanish, German), the difference is often imperceptible.
- **INT8 → INT4:** More noticeable degradation. Complex sentences, domain-specific terminology, and morphologically rich languages are more affected. COMET drops of 1–3 points are common.
- **INT4 and below:** Meaningful quality loss. Some language pairs may show clear translation errors that were not present in higher-precision models.

### Low-Resource Languages Are More Sensitive

High-resource language pairs have abundant training data, and the model's representations for those languages are robust and redundant. Quantization removes some of this redundancy but does not destabilize the core representations.

Low-resource language pairs — particularly those with limited parallel data, non-Latin scripts, or high morphological complexity — sit closer to the model's capability boundary. The representations for these languages are less robust, and quantization precision loss has a proportionally larger impact. A model that performs well on Irish or Armenian in BF16 may show noticeably degraded output in INT4.

This is an important consideration when choosing quantization levels for multilingual translation systems: the right precision for English ↔ French may not be the right precision for a system that also serves low-resource language pairs.

### Practical Guidance

| Use Case | Recommended Precision | Reasoning |
|---|---|---|
| High-resource pairs, latency-sensitive | BF16 or INT8 | Maximum quality, good speed |
| High-resource pairs, throughput-sensitive | INT8 or INT4 | Speed and memory gains, acceptable quality |
| Low-resource pairs, quality-critical | BF16 or INT8 (PTQ with AWQ) | Protect fragile representations |
| Low-resource pairs, constrained hardware | INT8 with per-channel quantization | Balance compression with quality preservation |
| Research / benchmarking | BF16 | Reference quality, no compression artifacts |

The safest approach when deploying a multilingual translation system is to evaluate quantized models on a representative sample of all supported language pairs — including the lowest-resource ones — before committing to a precision level. Quality metrics that look acceptable on average can mask significant degradation on specific pairs.
