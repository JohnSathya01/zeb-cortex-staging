

---

# Chapter 3: Where the GPU Keeps Its Stuff — Memory Explained

## Learning Objectives

- Explain why GPUs need multiple types of memory instead of one big storage
- Describe what happens at each memory level during a single calculation
- Calculate how much VRAM a model needs based on its size
- Identify why "out of memory" errors happen and how to fix them
- Compare memory bandwidth vs memory size and when each matters more

---

## Key Concepts

### 3.1 Recap: The GPU Is an Army, But Armies Need Supplies

In Chapter 2, we learned GPUs have thousands of workers (CUDA cores) doing math simultaneously. But here's the problem we skipped:

**Every math operation needs two numbers to multiply, and a place to put the result.**

If your workers don't have numbers ready, they stand idle. If results have nowhere to go, calculations stall. Memory is the supply chain that keeps workers busy.

---

### 3.2 Why Not One Big Memory? The Speed-Distance Trade-off

Imagine you're cooking in a kitchen. Where do you keep ingredients?

| Storage Location | Distance From Stove | What You Store | Speed |
|-----------------|---------------------|---------------|-------|
| **Your hand** | Touching | Nothing, just temporary holding | Instant |
| **Countertop** | 1 step away | Knife, cutting board, current ingredient | 1 second |
| **Kitchen cabinet** | 5 steps away | Spices, pots, frequently used items | 10 seconds |
| **Pantry** | Across the room | Bulk flour, rice, backup supplies | 1 minute |
| **Grocery store** | Drive away | Everything you might ever need | 30 minutes |

**The pattern:** The closer storage is to where you work, the faster you access it — but the less you can keep there.

**GPUs face the exact same problem:**

| Memory Level | Distance From Math Unit | Size | Speed |
|-------------|------------------------|------|-------|
| **Registers** | Inside the worker | Tiny | Instant |
| **L1 Cache** | Next to the worker | Small | Very fast |
| **L2 Cache** | Same building | Medium | Fast |
| **VRAM** | Same city | Large | Slow (relative) |
| **System RAM** | Different city | Very large | Very slow |
| **SSD/Disk** | Different country | Huge | Extremely slow |

---

### 3.3 Registers: The Worker's Hands

**What they are:** Tiny storage built directly into each CUDA core — literally part of the silicon that does math.

**What they do:** Hold the numbers being actively calculated right this nanosecond.

**Real specs:**
- Size per worker: 256 bytes (not KB — smaller than a text message)
- Total per GPU: ~256 KB across all workers combined
- Speed: Instant — no delay at all
- Purpose: "I need to multiply A × B, so hold A in my left hand, B in my right hand"

**Analogy:** Your hands while cooking. You can't hold much, but whatever you're holding is instantly usable.

```
REGISTER IN ACTION:

Worker needs to:  2.5 × 3.0 = ?

Step 1: Load 2.5 into register R1
Step 2: Load 3.0 into register R2  
Step 3: Multiply R1 × R2
Step 4: Store result 7.5 in register R3

All in ONE CLOCK CYCLE (less than a nanosecond)
```

**Why so small?** Registers are expensive silicon. Making them bigger would mean fewer workers fit on the chip.

---

### 3.4 L1 Cache / Shared Memory: The Countertop

**What it is:** Small, fast memory shared by 32 workers (one warp).

**What it does:** Holds data the team is working on right now, so they don't fetch from slower memory repeatedly.

**Real specs:**
- Size per team: 128 KB
- Speed: ~1 clock cycle (basically instant)
- Purpose: "We're all processing this batch of pixels — keep it on the counter"

**Analogy:** Your kitchen countertop. You can't store everything there, but everything for your current recipe stays within arm's reach.

```
L1 CACHE IN ACTION:

Scenario: Blur an image by averaging each pixel with its neighbors

Without L1 Cache:
- For each pixel, fetch from VRAM (1000 cycles)
- Process pixel
- Store result to VRAM (1000 cycles)
- Repeat for next pixel

With L1 Cache:
- Load 32×32 pixel block into L1 once (1000 cycles)
- Process all 1024 pixels using cached data (1 cycle each)
- Store results back once (1000 cycles)

Speedup: ~500× faster for this pattern
```

**Key term — "Shared Memory":** When programmers explicitly put data here for a team to share. Same physical hardware as L1 cache, different software control.

---

### 3.5 L2 Cache: The Kitchen Cabinet

**What it is:** Larger memory that all workers in a GPU section can access.

**What it does:** Keeps recently used data handy, guessing you might need it again soon.

**Real specs:**
- Size: 4-6 MB total (shared by all workers)
- Speed: ~10 clock cycles
- Purpose: "We used this data recently — don't put it back in the warehouse yet"

**Analogy:** Your kitchen cabinet. Stores things you use often (spices, pots) so you don't walk to the pantry every time.

```
L2 CACHE IN ACTION:

Step 1: Worker needs weight matrix row 1
        → Not in L1, check L2
        → Not in L2 either, fetch from VRAM (1000 cycles)
        → Store in L2 for future use

Step 2: Different worker needs weight matrix row 1
        → Not in its L1, check L2
        → Found in L2! (10 cycles, not 1000)
        → Copy to its L1 and use

Cache hit = fast. Cache miss = slow.
```

**Why L2 matters for AI:** Neural networks reuse the same weights (parameters) millions of times. L2 keeps those weights nearby after first use.

---

### 3.6 VRAM: The Pantry (GPU's Main Memory)

**What it is:** The big memory chips on your graphics card — what people mean when they say "my GPU has 24 GB."

**What it does:** Holds everything the GPU needs for its current job:
- The entire neural network (billions of numbers)
- The input data (text, images, audio)
- Intermediate results (activations)
- Output results

**Real specs:**
- Size: 8 GB (budget) to 80 GB (data center)
- Speed: ~100-1000 clock cycles to access
- Technology: GDDR6X (consumer) or HBM3 (data center)

**Analogy:** Your pantry. Stores all ingredients for the week. You can't cook directly from the pantry — you bring ingredients to the counter first.

```
VRAM HOLDS DURING TRAINING:

┌─────────────────────────────────────────┐
│  MODEL WEIGHTS                          │
│  12 billion numbers × 2 bytes = 24 GB    │
│  (The recipe itself)                    │
├─────────────────────────────────────────┤
│  INPUT DATA (current batch)             │
│  32 sentences × 512 tokens = ~2 MB      │
│  (Ingredients for this meal)            │
├─────────────────────────────────────────┤
│  ACTIVATIONS (layer outputs)            │
│  ~same size as model = 24 GB            │
│  (Intermediate dishes being prepared)   │
├─────────────────────────────────────────┤
│  GRADIENTS (what to change)             │
│  ~same size as model = 24 GB            │
│  (Notes on what went wrong)             │
├─────────────────────────────────────────┤
│  OPTIMIZER STATES (momentum, etc.)      │
│  ~2× model size = 48 GB                 │
│  (Chef's experience/memory)             │
└─────────────────────────────────────────┘

TOTAL FOR 12B MODEL IN FP16: ~120 GB
```

---

### 3.7 System RAM: The Grocery Store

**What it is:** Your computer's regular memory (not the GPU's). The CPU uses this.

**What it does:** Holds datasets, preprocessing code, and anything the CPU needs. Data must transfer here before going to GPU.

**Real specs:**
- Size: 16-512 GB typical
- Speed: ~10,000 clock cycles from GPU perspective
- Transfer: Must copy across PCIe bus (narrow highway)

**Analogy:** The grocery store. Has everything, but going there takes time. You shop in bulk and bring items to your pantry (VRAM).

```
THE JOURNEY OF ONE TRAINING EXAMPLE:

SSD (Disk)          System RAM          VRAM              GPU Cores
   │                    │                 │                  │
   │  1. Read file      │                 │                  │
   │────────────────────►                 │                  │
   │                    │  2. Preprocess  │                  │
   │                    │  (tokenize, etc)│                  │
   │                    │─────────────────►                  │
   │                    │                 │  3. Copy to GPU  │
   │                    │                 │─────────────────►│
   │                    │                 │  4. Load into    │
   │                    │                 │    registers     │
   │                    │                 │─────────────────►│
   │                    │                 │  5. Calculate!   │
   │                    │                 │                  │◄── Math happens
   │                    │                 │  6. Store result │
   │                    │                 │◄─────────────────│

Steps 1-3: Milliseconds (slow, CPU-bound)
Steps 4-6: Nanoseconds (fast, GPU-bound)
```

---

### 3.8 Why "Out of Memory" Happens (And How to Fix It)

**The Error:** `RuntimeError: CUDA out of memory. Tried to allocate X.XX GiB`

**What happened:** Your job needed more VRAM than available.

**Memory Math for Common Models:**

| Model Size | FP32 Weights | FP16 Weights | +Gradients | +Optimizer | FP16 Total | FP32 Total |
|-----------|-------------|-------------|-----------|-----------|-----------|-----------|
| 1B params | 4 GB | 2 GB | 2 GB | 4-8 GB | 8 GB | 14 GB |
| 7B params | 28 GB | 14 GB | 14 GB | 28-56 GB | 56 GB | 98 GB |
| 13B params | 52 GB | 26 GB | 26 GB | 52-104 GB | 104 GB | 182 GB |
| 70B params | 280 GB | 140 GB | 140 GB | 280-560 GB | 560 GB | 980 GB |


**Note: Activation Memory in Training**

The table above only accounts for **model weights, gradients, and optimizer states**. In practice, **activation memory** is also required during training and can be substantial.

#### **What are activations?**
Activations are the intermediate outputs of each layer computed during the **forward pass** (e.g., attention outputs, layer norm results, MLP intermediate values). They must be stored until the backward pass uses them to compute gradients.

#### **Why they matter**
- Without them, you cannot compute gradients
- They scale with **batch size × sequence length × hidden size × number of layers**
- For large models / long sequences, they can exceed weights+gradients

#### **Formula (approx for Transformer)**
```
Activation Memory (bytes) = batch_size × seq_len × hidden_size × num_layers × bytes_per_param × checkpoint_factor
```

Where:
- `bytes_per_param` = 2 for FP16, 4 for FP32
- `checkpoint_factor`:
  - Without checkpointing: ~2–4 (stores all activations)
  - With activation checkpointing: ~√L or ~1–2 (recomputes some forward passes)

#### **Simpler rule of thumb**
For a **single batch** (batch_size=1) in FP16:
```
Activation Memory ≈ Model Size (weights) × (2 to 4)
```
Example:
- 7B model → ~14 GB weights → activations ~28–56 GB without checkpointing
- With checkpointing → activations drop to ~4–8 GB

#### **Key takeaway**
Total Training VRAM = Weights + Gradients + Optimizer + **Activations**
→ Always include activations in your estimate, especially for:
- Long sequence lengths (>2048)
- Large batch sizes (>1)
- Deep models (>32 layers)

**Solutions (from easiest to hardest):**

| Solution | How It Works | Trade-off |
|----------|-------------|-----------|
| **Use FP16/BF16** | Halves memory | Slightly less precision |
| **Gradient checkpointing** | Recompute instead of store | 20% slower |
| **Smaller batch size** | Less data per step | Less stable gradients |
| **Gradient accumulation** | Fake big batch | Slower per effective step |
| **LoRA fine-tuning** | Train 0.3% of parameters | Less capacity to learn |
| **DeepSpeed ZeRO** | Shard across GPUs | Needs multiple GPUs |
| **CPU offloading** | Move optimizer to RAM | Much slower |
| **Smaller model** | Use 7B instead of 13B | Less capable |

---

### 3.9 Memory Bandwidth vs Memory Size

**Two different things people confuse:**

| Aspect | Memory SIZE | Memory BANDWIDTH |
|--------|------------|------------------|
| **What** | How much fits (GB) | How fast data moves (GB/s) |
| **Analogy** | Pantry shelf space | Pantry door width |
| **Determines** | Can you load this model? | How fast does training go? |
| **GPU example** | RTX 4090: 24 GB | RTX 4090: 1,008 GB/s |
| **When it matters** | Loading large models | Keeping workers fed with data |

**The Bandwidth Problem:**

```
SCENARIO: 10,000 workers need new numbers

GPU A: 10,000 cores, 100 GB/s bandwidth
- Each core needs 4 bytes/cycle
- Total need: 40,000 bytes/cycle
- Bandwidth provides: 100 GB/s ÷ 1.5 GHz = ~67 bytes/cycle
- Result: Workers wait 60% of the time (starved)

GPU B: 6,000 cores, 2,000 GB/s bandwidth  
- Each core needs 4 bytes/cycle
- Total need: 24,000 bytes/cycle
- Bandwidth provides: 2,000 GB/s ÷ 1.5 GHz = ~1,333 bytes/cycle
- Result: Workers never wait, 100% utilization
```

GPU B has fewer cores but finishes faster because it feeds them better.

---

### 3.10 HBM vs GDDR: Two Types of VRAM

| Technology | Used In | How It Works | Speed | Cost |
|-----------|---------|-------------|-------|------|
| **GDDR6X** | RTX 4090, consumer GPUs | Flat chips next to GPU | ~1 TB/s | Cheaper |
| **HBM3** | H100, A100, data center | 3D stacked chips on top of GPU | ~3.3 TB/s | Expensive |

**Visual difference:**

```
GDDR (Flat):
┌─────────┐  ┌─────────┐  ┌─────────┐
│ GDDR    │  │ GDDR    │  │ GDDR    │
│ Chip 1  │  │ Chip 2  │  │ Chip 3  │
└─────────┘  └─────────┘  └─────────┘
   ↓            ↓            ↓
┌─────────────────────────────────┐
│         GPU Chip                │
└─────────────────────────────────┘

HBM (Stacked/3D):
┌─────────┐
│ HBM Layer 4 │
├─────────┤
│ HBM Layer 3 │
├─────────┤
│ HBM Layer 2 │
├─────────┤
│ HBM Layer 1 │ ← Directly on top of GPU
├─────────┤
│   GPU Chip  │
└─────────┘
   ↓
Much shorter wires = much faster data movement
```

---

### 3.11 Key Terms Summary

| Term | Simple Definition |
|------|------------------|
| **Register** | Tiny storage inside each math worker, holds numbers being calculated right now |
| **L1 Cache / Shared Memory** | Fast storage for 32 workers (one warp), holds their current task's data |
| **L2 Cache** | Medium-fast storage shared by all workers, holds recently used data |
| **VRAM** | GPU's main memory, holds the entire model and all data for current job |
| **System RAM** | Computer's regular memory, CPU uses this, data must transfer to GPU |
| **Memory Bandwidth** | Speed of moving data from VRAM to workers (GB per second) |
| **Memory Size** | How much data VRAM can hold (GB total) |
| **Cache Hit** | Finding needed data in fast cache (good) |
| **Cache Miss** | Needing to fetch from slower memory (bad) |
| **HBM** | High Bandwidth Memory — expensive, fast, stacked, data center |
| **GDDR** | Graphics memory — cheaper, slower, flat, consumer |
| **Out of Memory (OOM)** | Job needs more VRAM than available |

---

## Assessment

### Q1: Why do GPUs have multiple memory levels instead of one big fast memory?
- [ ] To make programming more complex
- [ ] Because manufacturers want to sell more chips
- [x] Fast memory is expensive and limited; slow memory is cheap and abundant — hierarchy balances cost and speed
- [ ] Multiple memories are a historical accident

### Q2: Where does the GPU hold the entire neural network during training?
- [ ] In registers
- [ ] In L1 cache
- [x] In VRAM (the main GPU memory)
- [ ] In system RAM

### Q3: What causes a "CUDA out of memory" error?
- [ ] The GPU is overheating
- [x] The training job needs more VRAM than the GPU has available
- [ ] The CPU is too slow
- [ ] The model is training too fast

### Q4: Why might a GPU with less VRAM but higher bandwidth train faster than one with more VRAM but lower bandwidth?
- [ ] More VRAM is always wasted
- [x] If the model fits in both, bandwidth determines how fast workers get data — higher bandwidth means less waiting
- [ ] Bandwidth only matters for gaming, not AI
- [ ] VRAM size has no impact on training speed

### Q5: What is the main difference between HBM and GDDR memory?
- [ ] HBM is older technology
- [ ] GDDR is only for professional GPUs
- [x] HBM is stacked vertically for shorter wires and faster speed; GDDR is flat and cheaper
- [ ] There is no meaningful difference

## Exercise

### Exercise 1: The Kitchen Memory Hierarchy
Map your actual kitchen to the GPU memory hierarchy:

| GPU Memory | Your Kitchen Equivalent | What You Store There |
|-----------|------------------------|---------------------|
| Registers | | |
| L1 Cache | | |
| L2 Cache | | |
| VRAM | | |
| System RAM | | |
| SSD/Disk | | |

Fill in the second and third columns with real items from your kitchen. Then explain: If you're cooking a complex meal (like training a big model), what happens if your "countertop" (L1 cache) is too small?

**Submission Type:** text

### Exercise 2: Calculate Your VRAM Needs
You want to fine-tune a 7 billion parameter model. Using the formula:

- Weights (FP16): parameters × 2 bytes
- Gradients: same as weights
- Optimizer states (Adam): 2× weights
- Activations: roughly weights size

1. How much total VRAM do you need for full fine-tuning?
2. Can this fit on an RTX 4090 (24 GB)?
3. If not, which single technique from Section 3.8 would you try first to make it fit?

Show your calculations.

**Submission Type:** text