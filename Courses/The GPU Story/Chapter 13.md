# Chapter 13: How Much VRAM Do You Need? The Simple Math of Model Size

## Learning Objectives
- Calculate VRAM needs using the formula: `VRAM = Parameters × Bytes per parameter`
- Apply the training memory formula: `12P + Activations` for FP16+Adam scenarios
- Explain how precision choices (FP32→FP16→INT4) change the bytes-per-parameter multiplier
- Estimate KV cache overhead using: `2 × B × L × layers × hidden × 2 bytes`
- Choose between full training, LoRA, or QLoRA based on VRAM constraints

## Key Concepts

### 13.1 Recap: The GPU's Desk (VRAM)
In Chapter 3, we learned that **VRAM (Video RAM)** is the GPU's private workspace—like a chef's countertop. Just as a chef can only work with ingredients that fit on their counter, a GPU can only work with data that fits in its VRAM.

```
┌─────────────────────────────────┐
│         GPU "Kitchen"           │
│  ┌─────────────────────────┐    │
│  │    VRAM "Countertop"    │    │
│  │                         │    │
│  │  [Weights]              │    │
│  │  [Activations]          │    │
│  │  [Gradients]            │    │
│  │  [Optimizer]            │    │
│  │                         │    │
│  │  ⚠️ Overflow = Crash!  │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

> 💡 Key insight: VRAM isn't just for storing your model. During training, the GPU needs extra temporary workspace. We'll focus on the math first, then peek at the hidden costs.

### 13.2 The Suitcase Analogy: Numbers Have Sizes
Here's a truth that surprises beginners: **not all numbers take the same space**. Computers store numbers in different "formats," like luggage for a trip.

🧳 **The Suitcase Spectrum**:

| Format | Bytes per Number | Precision | Formula Multiplier |
|--------|-----------------|-----------|-------------------|
| **FP32** | 4 bytes | Very high | `VRAM = P × 4` |
| **FP16/BF16** | 2 bytes | Medium | `VRAM = P × 2` |
| **INT8** | 1 byte | Low | `VRAM = P × 1` |
| **INT4** | 0.5 bytes | Very low | `VRAM = P × 0.5` |

> 🔤 Plain English first: 
> - **P** = number of parameters (in billions)
> - **Bytes per number** = how much space each "knob" takes
> - **Precision** = how detailed a number can be (FP32: "3.14159", INT8: "3")

🎯 **Core inference formula** (weights only):
```
VRAM_GB = (Parameters × Bytes_per_param) ÷ 1,000,000,000
```

### 13.3 Inference Calculations: Step-by-Step Examples
Let's apply the formula to real models. All calculations show the math explicitly.

🔹 **Example: 7B model in FP16**
```
Parameters = 7,000,000,000
Bytes_per_param (FP16) = 2
VRAM_bytes = 7,000,000,000 × 2 = 14,000,000,000
VRAM_GB = 14,000,000,000 ÷ 1,000,000,000 = 14 GB
```

🔹 **Example: 10B model in INT4**
```
Parameters = 10,000,000,000
Bytes_per_param (INT4) = 0.5
VRAM_bytes = 10,000,000,000 × 0.5 = 5,000,000,000
VRAM_GB = 5,000,000,000 ÷ 1,000,000,000 = 5 GB
```

```python
# Plain English: This function applies the core formula
def calculate_inference_vram_gb(parameters, bytes_per_param):
    """
    parameters: total model knobs (e.g., 7_000_000_000 for 7B)
    bytes_per_param: 4=FP32, 2=FP16, 1=INT8, 0.5=INT4
    Returns: VRAM needed in GB for weights only
    """
    total_bytes = parameters * bytes_per_param
    return total_bytes / 1_000_000_000

# Test the formula:
print(calculate_inference_vram_gb(3_000_000_000, 2))  # 3B FP16 → 6.0 GB
print(calculate_inference_vram_gb(7_000_000_000, 0.5)) # 7B INT4 → 3.5 GB
```

**Inference Reference Table** (weights only, FP16 unless noted):
| Model | FP32 (`P×4`) | FP16 (`P×2`) | INT8 (`P×1`) | INT4 (`P×0.5`) |
|-------|-------------|-------------|-------------|---------------|
| **1B** | 4 GB | 2 GB | 1 GB | 0.5 GB |
| **3B** | 12 GB | 6 GB | 3 GB | 1.5 GB |
| **7B** | 28 GB | 14 GB | 7 GB | 3.5 GB |
| **10B** | 40 GB | 20 GB | 10 GB | 5 GB |

### 13.4 Training Memory: The Full Formula
When **training** (not just running) a model, VRAM needs grow significantly. Here's why:

```
Training VRAM Formula (FP16 + Adam optimizer):
┌─────────────────────────────────┐
│ Total = Weights + Gradients + Optimizer + Activations │
│                                                     │
│ Weights:     P × 2 bytes  (FP16)  = 2P             │
│ Gradients:   P × 2 bytes  (FP16)  = 2P             │
│ Optimizer:   P × 8 bytes  (Adam FP32 states) = 8P  │
│ Activations: B × L × hidden × layers × 2 bytes    │
│                                                     │
│ TOTAL ≈ 12P + Activations                           │
└─────────────────────────────────┘
```

> 🔤 Plain English: 
> - **Weights**: The model's current "knob settings"
> - **Gradients**: Notes on "which way to turn each knob"
> - **Optimizer**: Memory for the learning algorithm (Adam stores 2 FP32 values per parameter)
> - **Activations**: Temporary results from each layer during the forward/backward pass

**Activation Memory Formula** (simplified):
```
Activations_GB = (B × L × hidden × layers × 2) ÷ 1,000,000,000
```
Where:
- `B` = batch size (how many examples processed at once)
- `L` = sequence length (tokens per example)
- `hidden` = model's hidden dimension size
- `layers` = number of transformer layers
- `2` = bytes per FP16 number

### 13.5 Training Calculations: Worked Examples
Let's apply the training formula to real scenarios. Setup: `batch=1, seq_len=2048, FP16 weights/grads, Adam optimizer`.

🔹 **Example: 7B model training (FP16+Adam)**
```
Parameters (P) = 7,000,000,000
hidden = 4096, layers = 32

Weights:   7B × 2 bytes = 14 GB
Gradients: 7B × 2 bytes = 14 GB  
Optimizer: 7B × 8 bytes = 56 GB
Activations: (1 × 2048 × 4096 × 32 × 2) ÷ 1B = 0.54 GB

TOTAL = 14 + 14 + 56 + 0.54 = 84.54 GB ≈ 84.5 GB
```

🔹 **Example: 3B model training (FP32+Adam)**
```
Parameters (P) = 3,000,000,000
hidden = 3200, layers = 32

Weights:   3B × 4 bytes = 12 GB
Gradients: 3B × 4 bytes = 12 GB
Optimizer: 3B × 8 bytes = 24 GB
Activations: (1 × 2048 × 3200 × 32 × 4) ÷ 1B = 0.84 GB

TOTAL = 12 + 12 + 24 + 0.84 = 48.84 GB ≈ 48.8 GB
```

**Training Reference Table** (FP16+Adam, batch=1, L=2048):
| Model | Weights (`2P`) | Grads (`2P`) | Optimizer (`8P`) | Activations* | **TOTAL (`12P+Act`)** |
|-------|---------------|-------------|-----------------|--------------|----------------------|
| **1B** | 2 GB | 2 GB | 8 GB | 0.2 GB | **12.2 GB** |
| **3B** | 6 GB | 6 GB | 24 GB | 0.4 GB | **36.4 GB** |
| **7B** | 14 GB | 14 GB | 56 GB | 0.54 GB | **84.5 GB** |
| **10B** | 20 GB | 20 GB | 80 GB | 0.84 GB | **120.8 GB** |

*\*Activations formula: `(1 × 2048 × hidden × layers × 2) ÷ 1B`*

### 13.6 LoRA/QLoRA: The Parameter-Efficient Formulas
What if you only need to train a tiny fraction of the model? **LoRA** (Low-Rank Adaptation) adds small trainable "adapters" while keeping the base model frozen.

📝 **LoRA Memory Formula**:
```
LoRA_VRAM = Base_Weights + (LoRA_params × 2) + (LoRA_params × 2) + (LoRA_params × 8) + Activations
          = Base_Weights + (LoRA_params × 12) + Activations
```

Where `LoRA_params ≈ 2 × r × hidden × num_modules` (typically 0.05-0.1% of total parameters).

🔹 **Example: 7B model with LoRA (r=8, 16 modules)**
```
Base weights (FP16): 7B × 2 = 14 GB
LoRA_params: 2 × 8 × 4096 × 16 = ~1,048,576 parameters (~1M)
LoRA weights: 1M × 2 bytes = 2 MB
LoRA grads:   1M × 2 bytes = 2 MB  
LoRA optimizer: 1M × 8 bytes = 8 MB
Activations: ~0.54 GB (same as full training)

TOTAL ≈ 14 GB + 0.012 GB + 0.54 GB = ~14.6 GB
```

📦 **QLoRA Formula** (4-bit base + FP16 LoRA):
```
QLoRA_VRAM = (P × 0.5) + (LoRA_params × 12) + Activations
```

🔹 **Example: 7B model with QLoRA**
```
Base weights (INT4): 7B × 0.5 = 3.5 GB
LoRA components: ~0.012 GB (same as above)
Activations: ~0.54 GB

TOTAL ≈ 3.5 + 0.012 + 0.54 = ~4.1 GB
```

**LoRA/QLoRA Reference Table** (r=8, 16 modules, batch=1, L=2048):
| Model | Base Weights | LoRA Components | Activations | **TOTAL** |
|-------|-------------|-----------------|-------------|-----------|
| **1B** | 2 GB (FP16) | ~0.006 GB | 0.2 GB | **~2.2 GB** |
| **3B** | 6 GB (FP16) | ~0.019 GB | 0.4 GB | **~6.4 GB** |
| **7B** | 14 GB (FP16) | ~0.045 GB | 0.54 GB | **~14.6 GB** |
| **10B** | 20 GB (FP16) | ~0.07 GB | 0.84 GB | **~20.9 GB** |
| **7B QLoRA** | 3.5 GB (INT4) | ~0.045 GB | 0.54 GB | **~4.1 GB** |

### 13.7 KV Cache: The Conversation Memory Formula
When an AI chatbot remembers your conversation, it uses **KV cache** (Key-Value cache)—like a notepad where it jots down important points.

📋 **KV Cache Formula**:
```
KV_Cache_GB = (2 × B × L × layers × hidden × 2) ÷ 1,000,000,000
```
Where:
- `2` = key + value tensors
- `B` = batch size
- `L` = sequence length (context length)
- `layers` = number of transformer layers
- `hidden` = hidden dimension size
- `2` = bytes per FP16 number

🔹 **Example: 7B model, batch=1, L=2048**
```
KV_Cache = (2 × 1 × 2048 × 32 × 4096 × 2) ÷ 1B
         = (2 × 1 × 2048 × 32 × 4096 × 2) = 1,073,741,824 bytes
         = 1.07 GB
```

**Inference with KV Cache Reference** (FP16 weights + cache):
| Model | Weights (`P×2`) | KV Cache (L=2048) | KV Cache (L=8192) | **Total (L=2048)** | **Total (L=8192)** |
|-------|----------------|-------------------|-------------------|-------------------|-------------------|
| **1B** | 2 GB | `(2×1×2048×24×2048×2)/1B=0.4GB` | 1.6 GB | **2.4 GB** | **3.6 GB** |
| **3B** | 6 GB | `(2×1×2048×32×3200×2)/1B=0.84GB` | 3.4 GB | **6.8 GB** | **9.4 GB** |
| **7B** | 14 GB | `(2×1×2048×32×4096×2)/1B=1.07GB` | 4.3 GB | **15.1 GB** | **18.3 GB** |
| **10B** | 20 GB | `(2×1×2048×40×5120×2)/1B=1.68GB` | 6.7 GB | **21.7 GB** | **26.7 GB** |

🎯 **Practical tip**: For long-context inference (8K+ tokens), budget ~20-30% extra VRAM beyond weights alone.

### 13.8 Quick Decision Flowchart with Formulas
Use this step-by-step guide with embedded formulas:

```
START: Model has [P] billion parameters

Step 1: What's your task?
├─→ INFERENCE? → Use: VRAM = P × bytes_per_param [+ KV cache if needed]
│   ├─→ FP16: bytes=2 → VRAM = P × 2
│   ├─→ INT8: bytes=1 → VRAM = P × 1  
│   └─→ INT4: bytes=0.5 → VRAM = P × 0.5
│
└─→ TRAINING? → Use: VRAM = 12P + Activations (for FP16+Adam)
    ├─→ Full training: Apply formula directly
    ├─→ LoRA: VRAM = (P×2) + (LoRA_params×12) + Activations
    └─→ QLoRA: VRAM = (P×0.5) + (LoRA_params×12) + Activations

Step 2: Add KV cache if doing long-context inference:
    KV_Cache = (2 × B × L × layers × hidden × 2) ÷ 1B

Step 3: Compare to your GPU VRAM:
    If calculated_VRAM ≤ GPU_VRAM × 0.9 → ✅ Likely fits
    Else → ❌ Consider smaller model, lower precision, or cloud GPU
```

## Assessment

### Q1: You want to run inference on a 3B parameter model using FP16 precision. Using the formula `VRAM = P × bytes_per_param`, how much VRAM do you need just for the weights?
- [ ] 3 GB (incorrect: used bytes=1)
- [ ] 4 GB (incorrect: used bytes=1.33)
- [x] 6 GB (correct: 3B × 2 bytes = 6 GB)
- [ ] 12 GB (incorrect: used FP32 bytes=4)

### Q2: For full training of a 7B model in FP16 with Adam optimizer, which formula gives the correct weight+gradient+optimizer memory (excluding activations)?
- [ ] `4P` (incorrect: only counts weights in FP32)
- [ ] `8P` (incorrect: missing gradients)
- [x] `12P` (correct: 2P weights + 2P grads + 8P optimizer = 12P)
- [ ] `16P` (incorrect: uses FP32 for weights/grads)

### Q3: A friend has a 16 GB GPU and wants to LoRA fine-tune a 7B model. Using the LoRA formula `Base_Weights + (LoRA_params × 12) + Activations`, approximately how much VRAM is needed?
- [ ] ~2 GB (incorrect: used QLoRA base)
- [ ] ~8 GB (incorrect: underestimated activations)
- [x] ~15 GB (correct: 14 GB base + ~0.05 GB LoRA + 0.54 GB activations)
- [ ] ~85 GB (incorrect: used full training formula)

### Q4: You're running inference with a 10B model, batch=1, sequence length=8192. Using the KV cache formula `(2 × B × L × layers × hidden × 2) ÷ 1B`, approximately how much extra VRAM does the cache need beyond weights?
- [ ] 0.5 GB (incorrect: used L=2048)
- [ ] 1.7 GB (incorrect: used L=2048 for 10B model)
- [x] 6.7 GB (correct: calculated for L=8192)
- [ ] 20 GB (incorrect: added weights again)

### Q5: Why does the training formula include `8P` for the optimizer when using Adam?
- [ ] Adam stores 8 copies of the model weights
- [x] Adam maintains two FP32 state variables per parameter (4 bytes each = 8 bytes total)
- [ ] Adam requires 8× more precision than FP16
- [ ] The formula is wrong—optimizer memory is negligible

### Q6: You have a 24 GB GPU. Using the formulas, which scenario is MOST likely to fit?
- [ ] Full training of 7B model: `12×7 + 0.54 = 84.5 GB` → ❌
- [ ] Inference 13B FP16 + 8K cache: `13×2 + 4.3 = 30.3 GB` → ❌  
- [x] QLoRA fine-tuning 7B model: `7×0.5 + 0.045 + 0.54 = ~4.1 GB` → ✅
- [ ] Full training 1B model FP32: `16×1 + 0.4 = 16.4 GB` → ✅ but QLoRA is more versatile

## Exercise

### Exercise 1: Apply the Formulas
Use the formulas from this chapter to solve these real-world scenarios. Show your calculation steps.

**Scenario A**: Inference on a 5B model using INT8 precision, batch=1, no KV cache.
1. Write the inference formula: `VRAM = ______`
2. Plug in values: `______ × ______ = ______ bytes`
3. Convert to GB: `______ ÷ 1,000,000,000 = ______ GB`
4. Will it fit on an RTX 4070 (12 GB)? Yes / No

**Scenario B**: Full training of a 2B model in FP16+Adam, batch=2, seq_len=4096. Model specs: hidden=2560, layers=28.
1. Calculate base memory: `12P = 12 × ______ = ______ GB`
2. Calculate activations: `(B × L × hidden × layers × 2) ÷ 1B = (______ × ______ × ______ × ______ × 2) ÷ 1B = ______ GB`
3. Total training VRAM: `______ + ______ = ______ GB`
4. Will it fit on an RTX 4090 (24 GB)? Yes / No

**Scenario C**: QLoRA fine-tuning of a 10B model, batch=1, seq_len=2048. LoRA params = 6.5M.
1. Base weights (INT4): `P × 0.5 = ______ × 0.5 = ______ GB`
2. LoRA components: `LoRA_params × 12 = ______ × 12 bytes = ______ GB`
3. Activations (use 10B model specs): `______ GB`
4. Total: `______ + ______ + ______ = ______ GB`
5. Will it fit on a 16 GB GPU? Yes / No

**Submission Type:** text

### Exercise 2: Formula Creation Challenge
Create your own calculation using the chapter formulas:

1. Pick a model size not in our tables (e.g., 5B, 15B, or 20B parameters).
2. Choose a task: inference (specify precision) OR training (specify method: full/LoRA/QLoRA).
3. If inference with context >2K, include KV cache calculation.
4. Show your work using the exact formula format from this chapter:
   ```
   [Formula name]: [variables plugged in] = [result]
   ```
5. State whether your target GPU (choose from: 8GB, 12GB, 16GB, 24GB) can handle it.

Example starter:
```
Task: Inference, 15B model, FP16, L=4096
Weights: P × 2 = 15 × 2 = 30 GB
KV Cache: (2 × 1 × 4096 × 40 × 5120 × 2) ÷ 1B = [calculate] GB
Total: 30 + [cache] = [total] GB
GPU: RTX 4090 (24 GB) → ❌ Does not fit
```

**Submission Type:** text