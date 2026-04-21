
---

# Chapter 2: Inside the GPU — How an Army of Workers Actually Works

## Learning Objectives

- Explain how a GPU organizes thousands of simple workers to cooperate
- Describe what CUDA cores, Tensor cores, and RT cores actually do
- Understand GPU memory hierarchy and why it matters for speed
- Identify how different GPU generations changed AI capabilities
- Calculate why memory bandwidth often matters more than compute power

---

## Key Concepts

### 2.1 Recap: From 10,000 Cooks to an Organized Army

In Chapter 1, we said a GPU is like **10,000 line cooks** working simultaneously. But how do you coordinate 10,000 people without chaos?

**The answer: strict organization.**

```
CHAOS (10,000 random workers):
👷👷👷👷👷👷👷👷👷👷
👷👷👷👷👷👷👷👷👷👷
  (Everyone does whatever they want)
  Result: Confusion, collisions, inefficiency

ORGANIZED (10,000 workers in structured teams):
┌─────────────────────────────────────────┐
│  TEAM 1    TEAM 2    TEAM 3    TEAM 4  │
│  [👷👷👷]  [👷👷👷]  [👷👷👷]  [👷👷👷]   │
│  [👷👷👷]  [👷👷👷]  [👷👷👷]  [👷👷👷]   │
│  [👷👷👷]  [👷👷👷]  [👷👷👷]  [👷👷👷]   │
│                                         │
│  All Team 1 does: Multiply numbers    │
│  All Team 2 does: Multiply numbers    │
│  Same task, same time, organized        │
└─────────────────────────────────────────┘
```

This organization is the key to GPU speed. Let's see how it works.

---

### 2.2 The GPU Factory: Warps, Blocks, and Grids

**Analogy: A Car Factory**

| GPU Concept | Factory Equivalent | What It Means |
|-------------|-------------------|---------------|
| **Thread** | One worker | Does one simple math operation |
| **Warp** | Work crew (32 workers) | 32 threads that execute together |
| **Block** | Assembly line | Group of warps sharing memory |
| **Grid** | Entire factory floor | All blocks working on one job |

**The Warp: GPU's Basic Unit**

```
WARP (32 threads):
┌─────────────────────────────────────────┐
│  Worker 1:  2 × 3 = 6                  │
│  Worker 2:  5 × 7 = 35                 │
│  Worker 3:  1 × 8 = 8                  │
│  ...                                     │
│  Worker 32: 4 × 9 = 36                 │
│                                          │
│  ALL 32 CALCULATIONS HAPPEN             │
│  AT THE EXACT SAME MOMENT               │
│  (Single instruction, multiple threads)   │
└─────────────────────────────────────────┘
```

**Critical rule:** All 32 workers in a warp must do the SAME type of operation. If one worker needs to do something different, the other 31 wait. This is called **warp divergence** — and it's bad for performance.

---

### 2.3 CUDA Cores: The Basic Math Workers

**CUDA = Compute Unified Device Architecture**

CUDA cores are the "basic workers" of the GPU. Each one can do:

- Addition
- Subtraction
- Multiplication
- Comparison (greater than, less than)

**What one CUDA core does:**

```
INPUT: Two numbers
OPERATION: Multiply them
OUTPUT: Result

Example: 2.5 × 3.0 = 7.5
```

**But a GPU has THOUSANDS of these:**

| GPU | CUDA Cores | What This Means |
|-----|-----------|-----------------|
| RTX 3060 (budget) | 3,584 | Small army |
| RTX 4090 (consumer flagship) | 16,384 | Large army |
| A100 (data center) | 6,912 | Specialized army (fewer but more powerful) |
| H100 (latest data center) | 16,896 | Largest specialized army |

**Why doesn't more cores always mean faster?**

Because you need:
1. Enough work to keep all cores busy
2. Data available when cores need it (memory bandwidth)
3. The RIGHT type of cores for your task

---

### 2.4 Tensor Cores: The Specialist Workers

**Problem:** AI models do one specific operation billions of times: **matrix multiplication**.

Regular CUDA cores can do this, but it's inefficient — like using a Swiss Army knife when you need a power drill.

**Tensor Cores are the power drill:**

```
MATRIX MULTIPLY (what AI actually does):

┌─────────┐   ┌─────────┐   ┌─────────┐
│ 1  2  3 │   │ 7  8  9 │   │ ?  ?  ? │
│ 4  5  6 │ × │ 10 11 12│ = │ ?  ?  ? │
└─────────┘   └─────────┘   └─────────┘
     A             B             C

CUDA core approach:
- Multiply 1×7, store result
- Multiply 2×10, add to result
- Multiply 3×?, add to result
- (Many separate operations)

Tensor Core approach:
- Load entire 4×4 chunk of A
- Load entire 4×4 chunk of B
- Compute entire 4×4 chunk of C in ONE cycle
- (One fused operation)
```

**Tensor Core Speedup:**

| Operation | CUDA Cores | Tensor Cores | Speedup |
|-----------|-----------|--------------|---------|
| Matrix multiply (FP32) | 1× | 8× | 8× faster |
| Matrix multiply (FP16/BF16) | 1× | 16× | 16× faster |
| Matrix multiply (FP8, H100) | 1× | 32× | 32× faster |

**Which GPUs have Tensor Cores?**

| Generation | Tensor Cores? | Notes |
|-----------|-------------|-------|
| GTX 10-series (2016) | ❌ No | Too old for modern AI |
| RTX 20-series (2018) | ✅ Yes (1st gen) | INT8, FP16 |
| RTX 30-series (2020) | ✅ Yes (2nd gen) | BF16, sparse |
| RTX 40-series (2022) | ✅ Yes (4th gen) | FP8 support |
| A100 (2020) | ✅ Yes (3rd gen) | BF16, TF32 |
| H100 (2022) | ✅ Yes (4th gen) | FP8, Transformer Engine |

---

### 2.5 RT Cores: The Lighting Specialists (Bonus)

**RT = Ray Tracing**

These cores calculate how light bounces in 3D scenes. Originally for video games, now used in:

- 3D rendering
- Scientific simulation
- Some AI applications (point cloud processing)

**For pure AI training:** RT cores mostly sit idle. They don't help with matrix math.

---

### 2.6 GPU Memory Hierarchy: The Warehouse System

**Problem:** Your 10,000 workers need materials (data) to work. Where do you store everything?

**The GPU has multiple "storage rooms," each with different speed and size:**

```
GPU MEMORY HIERARCHY (fastest to slowest):

┌─────────────────────────────────────────┐
│  REGISTERS                              │
│  • Each worker's personal pocket        │
│  • Size: ~256 KB per worker             │
│  • Speed: Instant access                │
│  • Holds: One number being calculated   │
├─────────────────────────────────────────┤
│  L1 CACHE / SHARED MEMORY               │
│  • Team's shared workbench              │
│  • Size: ~128 KB per team               │
│  • Speed: 1 cycle                       │
│  • Holds: Data team is working on now   │
├─────────────────────────────────────────┤
│  L2 CACHE                               │
│  • Factory's local storage              │
│  • Size: ~4-6 MB                        │
│  • Speed: ~10 cycles                    │
│  • Holds: Recently used data            │
├─────────────────────────────────────────┤
│  VRAM (HBM/GDDR)                        │
│  • Main warehouse                       │
│  • Size: 8-80 GB                        │
│  • Speed: ~100-1000 cycles              │
│  • Holds: Entire model, all data        │
├─────────────────────────────────────────┤
│  SYSTEM RAM (CPU memory)                │
│  • Off-site storage                     │
│  • Size: 16-512 GB                      │
│  • Speed: ~10,000 cycles                │
│  • Holds: Dataset, preprocessing        │
├─────────────────────────────────────────┤
│  SSD / HARD DRIVE                       │
│  • Archive                              │
│  • Size: 1-10 TB                        │
│  • Speed: ~1,000,000 cycles             │
│  • Holds: Training data, checkpoints      │
└─────────────────────────────────────────┘
```

**The Golden Rule:**

> **Data must be in registers to be computed. If it's in VRAM, the worker waits 1000 cycles. If it's on SSD, the worker waits essentially forever.**

This is why **memory bandwidth** (how fast you move data from VRAM to cores) often matters more than raw compute power.

---

### 2.7 Memory Bandwidth: The Conveyor Belt Speed

**Bandwidth = How much data you can move per second**

```
SCENARIO: 10,000 workers need new materials

Slow conveyor belt (100 GB/s):
├─────────────────────┤
Workers wait 10 seconds for materials
Actual work: 1 second
Efficiency: 9% (most time waiting)

Fast conveyor belt (1000 GB/s):
├─────────────────────┤
Workers wait 1 second for materials
Actual work: 1 second
Efficiency: 50% (better!)

The workers (CUDA cores) are the SAME.
The conveyor belt (memory bandwidth) makes the difference.
```

**Real GPU Bandwidth:**

| GPU | Memory Bandwidth | Type |
|-----|-----------------|------|
| RTX 3060 | 360 GB/s | GDDR6 |
| RTX 4090 | 1,008 GB/s | GDDR6X |
| A100 | 1,935 GB/s | HBM2e |
| H100 | 3,350 GB/s | HBM3 |

**HBM = High Bandwidth Memory** (stacked chips, very fast, expensive)
**GDDR = Graphics DDR** (cheaper, slower, used in consumer GPUs)

---

### 2.8 Compute Capability: What Your GPU Can Actually Do

**Compute Capability = Version number indicating GPU generation features**

| Compute Capability | GPU Generation | Key Features |
|-------------------|--------------|--------------|
| 7.0 | V100 (2017) | First Tensor Cores, FP16 |
| 8.0 | A100 (2020) | BF16, TF32, sparse |
| 8.6 | RTX 30-series | RTX 3090, etc. |
| 8.9 | RTX 40-series | FP8, DLSS 3 |
| 9.0 | H100 (2022) | Transformer Engine, best FP8 |

**Why this matters:**

```
Software (PyTorch) checks: "What compute capability is this GPU?"

If GPU is too old (compute capability < 7.0):
  "Sorry, no Tensor Cores. Training will be 10× slower."
  
If GPU is new (compute capability 9.0):
  "Great! Can use FP8, Transformer Engine, fastest paths."
```

---

### 2.9 Why A100 Has Fewer CUDA Cores Than RTX 4090 But Is Better for AI

| Specification | RTX 4090 | A100 |
|--------------|----------|------|
| CUDA Cores | 16,384 | 6,912 |
| Tensor Cores | 4th gen | 3rd gen |
| VRAM | 24 GB | 40-80 GB |
| Memory Bandwidth | 1,008 GB/s | 1,935 GB/s |
| Memory Type | GDDR6X | HBM2e |
| FP8 Support | Yes | No |
| Cost | ~$1,600 | ~$10,000 |

**Why A100 wins for training:**

1. **More VRAM** — can hold larger models (40-80 GB vs 24 GB)
2. **Higher bandwidth** — feeds data to cores faster (1,935 vs 1,008 GB/s)
3. **Reliability** — ECC memory (detects/corrects errors), 24/7 operation
4. **Multi-GPU scaling** — NVLink for fast GPU-to-GPU communication

**Why RTX 4090 wins for hobbyists:**

1. **Much cheaper** — 1/6th the price
2. **Faster for some inference** — higher clock speed
3. **Available** — you can buy one; A100 is enterprise-only

---

### 2.10 The Actual Math a GPU Does (Simplified)

When you write `model.forward()`, here's what reaches the silicon:

```
YOUR CODE:
output = model(input)

BECOMES:
┌─────────────────────────────────────────┐
│  1. Load weight matrix W from VRAM      │
│     (W is 4096 × 4096 numbers)          │
│                                         │
│  2. Load input vector x from VRAM       │
│     (x is 4096 numbers)                 │
│                                         │
│  3. Tell GPU: "Multiply W and x"        │
│                                         │
│  4. GPU breaks this into:               │
│     - 64 warps (2048 threads)           │
│     - Each thread does 8 multiplications│
│     - All happen simultaneously         │
│                                         │
│  5. Result stored back to VRAM          │
│     (4096 numbers)                      │
│                                         │
│  TIME: ~0.001 seconds                   │
│  (Same operation on CPU: ~0.1 seconds)   │
└─────────────────────────────────────────┘
```

This one operation is called **billions of times** during training.

---

### 2.11 Key Terms Summary

| Term | Simple Definition |
|------|------------------|
| **Thread** | One simple worker doing one math operation |
| **Warp** | Team of 32 threads that execute together |
| **Block** | Group of warps sharing memory |
| **Grid** | All blocks working on one job |
| **CUDA Core** | Basic math worker (add, multiply) |
| **Tensor Core** | Specialist worker for matrix multiply (much faster) |
| **RT Core** | Specialist for ray tracing (light calculations) |
| **VRAM** | GPU's main memory (the warehouse) |
| **L1/L2 Cache** | Fast, small memory close to cores (the workbench) |
| **Memory Bandwidth** | Speed of data movement (conveyor belt) |
| **HBM** | High Bandwidth Memory (expensive, fast, data center) |
| **GDDR** | Graphics memory (cheaper, slower, consumer) |
| **Compute Capability** | GPU generation number (what features it has) |
| **Warp Divergence** | When threads in a warp do different things (bad for speed) |

---

## Assessment

### Q1: What is the smallest group of GPU workers that execute together?
- [ ] One CUDA core
- [x] A warp (32 threads)
- [ ] A block (hundreds of threads)
- [ ] The entire grid

### Q2: Why are Tensor Cores faster than CUDA Cores for AI?
- [ ] They have higher clock speeds
- [ ] There are more of them
- [x] They do matrix multiply as one operation instead of many separate multiplications
- [ ] They use less electricity

### Q3: Which memory is fastest in the GPU hierarchy?
- [ ] VRAM (main GPU memory)
- [ ] L2 Cache
- [x] Registers (each worker's personal storage)
- [ ] System RAM

### Q4: Why might an A100 with fewer CUDA cores than an RTX 4090 still train AI models faster?
- [ ] Because it has more RT cores
- [x] Because it has higher memory bandwidth and more VRAM
- [ ] Because CUDA cores don't matter for training
- [ ] Because the RTX 4090 is too expensive

### Q5: What happens when threads in the same warp need to do different operations?
- [ ] The GPU automatically splits them into separate warps
- [x] Some threads wait while others finish, causing warp divergence
- [ ] The GPU crashes
- [ ] Nothing, GPUs handle this efficiently

## Exercise

### Exercise 1: The Factory Analogy
Imagine you're managing a real factory that makes 10,000 identical sandwiches per hour.

1. **CPU approach:** One master chef makes each sandwich from start to finish. How many sandwiches per hour? What limits speed?
2. **GPU approach:** 1,000 workers, each does one step (spread mayo, add cheese, etc.). How many sandwiches per hour? What could go wrong (bottlenecks)?
3. **Tensor Core approach:** A machine that makes 64 complete sandwiches in one press. When is this better than 1,000 individual workers? When might it be worse?

Apply this to AI: What type of "sandwich" (computation) benefits most from each approach?

**Submission Type:** text

### Exercise 2: Memory Bandwidth Calculation
A GPU has:
- 10,000 CUDA cores
- Each core can do 1 calculation per cycle
- Clock speed: 1.5 GHz (1.5 billion cycles per second)
- Memory bandwidth: 500 GB/s

1. How many calculations can all cores theoretically do per second?
2. If each calculation needs 4 bytes of data (FP32), how much data bandwidth do the cores need?
3. Is the memory bandwidth (500 GB/s) enough? If not, what's the efficiency?

**Submission Type:** text