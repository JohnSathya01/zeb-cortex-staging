
---

# Chapter 1: What Is a Computer? (And Why Your Regular Computer Struggles with AI)

## Learning Objectives

- Understand what a computer actually does at its core
- Explain why CPUs (regular processors) hit limits with AI
- Describe what a GPU is in simple, non-technical terms
- Identify the three types of AI chips and when each is used
- Understand what "training on GPU" means step by step

---

## Key Concepts

### 1.1 What Is a Computer, Really?

Before we talk about GPUs, let's understand what any computer does.

**A computer is a machine that:**
1. Takes in data (numbers)
2. Processes that data using math operations
3. Outputs results

That's it. Everything — your phone, laptop, smartwatch — does only these three things.

**Example: Your Calculator**

| Step | What Happens |
|------|-------------|
| Input | You press `2 + 3` |
| Processing | Calculator adds the numbers |
| Output | Screen shows `5` |

Your laptop does the same thing, just billions of times per second with more complex math.

---

### 1.2 What Is a CPU? (The Brain You Already Know)

**CPU = Central Processing Unit**

This is the "brain" of every computer. It's what runs your web browser, your music player, your word processor.

**Think of a CPU like a very fast, very smart individual worker:**

```
CPU Worker:
┌─────────────────────────┐
│  👨‍💼 Smart Worker        │
│                         │
│  Can do ANY task        │
│  Very fast at ONE thing │
│  at a time              │
│                         │
│  Task 1: Add numbers    │
│  Task 2: Compare values │
│  Task 3: Move memory    │
│  (Does them in order)   │
└─────────────────────────┘
```

**CPU Characteristics:**

| Feature | What It Means |
|---------|--------------|
| **Few cores** | 4, 8, or 16 workers |
| **Very fast clock** | 3-5 billion operations per second |
| **General purpose** | Can do any type of calculation |
| **Sequential** | Does one thing, then the next |

**Analogy:** A CPU is like a master chef who can cook any dish perfectly, but can only cook one dish at a time.

---

### 1.3 The Problem: AI Needs MASSIVE Math

**What does "training an AI model" actually mean?**

It means doing math on millions or billions of numbers, over and over again, millions of times.

**Example: A Simple Prediction**

```
AI Model Input:  "The cat sat on the..."

Model needs to predict next word: "mat"

Inside the model, this happens:
- Multiply 768 numbers by 768 other numbers
- Add results together
- Apply some non-linear function
- Repeat this 12 times (layers)
- Do this for every word in the sentence

For one sentence of 10 words: ~100 million math operations
```

**Now scale up:**

| Task | Operations Needed |
|------|-----------------|
| Process one sentence | ~100 million |
| Train on one book | ~10 trillion |
| Train GPT-3 (175B parameters) | ~3.14 × 10²³ |
| Train GPT-4 (estimated) | ~10²⁵ |

**Your CPU can do this, but it would take years.**

---


### 1.4 The Solution: What Is a GPU?

**GPU = Graphics Processing Unit**

Originally invented to draw video game graphics. By accident, scientists discovered it's perfect for AI.

**Think of a GPU like an army of simple workers:**

```
GPU Army:
┌─────────────────────────────────────────┐
│  👷👷👷👷👷👷👷👷👷👷                    │
│  👷👷👷👷👷👷👷👷👷👷                    │
│  👷👷👷👷👷👷👷👷👷👷                    │
│  👷👷👷👷👷👷👷👷👷👷                    │
│                                         │
│  Thousands of simple workers            │
│  Each can only do basic math            │
│  But ALL work at the SAME TIME          │
│                                         │
│  Task: Multiply 10,000 pairs of numbers │
│  CPU: Does one at a time (fast)         │
│  GPU: Does all 10,000 simultaneously    │
└─────────────────────────────────────────┘
```

**GPU Characteristics:**

| Feature | What It Means |
|---------|--------------|
| **Many cores** | 4,000 to 16,000 workers |
| **Simpler cores** | Each worker is less smart |
| **Specialized** | Best at specific math (matrix multiply) |
| **Parallel** | Does thousands of things at once |

**Analogy:** A GPU is like a kitchen with 10,000 line cooks. Each cook can only make a sandwich, but they can all make sandwiches simultaneously.

---

### 1.5 CPU vs. GPU: Side by Side

![CPU vs GPU diagram](/courses/gpu-story/Difference-between-CPU-and-GPU-Architecture.jpg)
```


SCENARIO: You need to paint 10,000 houses

┌─────────────────────────────────────────┐
│  CPU APPROACH                           │
│                                         │
│  🏠 → 👨‍🎨 Master Painter                │
│                                         │
│  Paints one house perfectly             │
│  Then moves to next house               │
│  Then next...                           │
│                                         │
│  Time: 10,000 days                      │
│  (One painter, one house at a time)     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  GPU APPROACH                           │
│                                         │
│  🏠🏠🏠🏠🏠 → 👷👷👷👷👷           │
│  🏠🏠🏠🏠🏠 → 👷👷👷👷👷           │
│  🏠🏠🏠🏠🏠 → 👷👷👷👷👷           │
│      ... (2,000 painters total)         │
│                                         │
│  Each painter paints one house          │
│  ALL paint at the SAME TIME             │
│                                         │
│  Time: 5 days                           │
│  (Many painters, many houses at once)   │
└─────────────────────────────────────────┘
```

**The Trade-off:**

| Aspect | CPU | GPU |
|--------|-----|-----|
| Speed for one task | Very fast | Slower |
| Speed for many identical tasks | Slow | Very fast |
| Flexibility | Can do anything | Best at specific math |
| Cost | Cheaper | More expensive |
| Power | Less | More |

---

### 1.6 What Is VRAM? (The GPU's Desk Space)

**VRAM = Video Random Access Memory**

This is the GPU's own memory — separate from your computer's regular RAM.

![VRAM](/courses/gpu-story/vram.png)

**Analogy:**

| Component | Analogy |
|-----------|---------|
| **CPU** | Smart worker |
| **RAM** | Worker's desk (where papers are kept while working) |
| **GPU** | Army of workers |
| **VRAM** | Warehouse where the army stores all materials |

**Why VRAM Matters:**

```
Training a Model:
┌─────────────────────────────────────────┐
│  STEP 1: Load model into VRAM           │
│  (Store 12 billion numbers = 24 GB)     │
│                                         │
│  STEP 2: Load training data into VRAM   │
│  (Store 1,000 examples = 2 GB)          │
│                                         │
│  STEP 3: Do math on GPU                 │
│  (Read from VRAM, compute, write back)  │
│                                         │
│  STEP 4: Save results                   │
│  (Gradients, optimizer states = 48 GB)  │
│                                         │
│  TOTAL VRAM NEEDED: ~74 GB              │
│                                         │
│  If your GPU has only 24 GB VRAM:       │
│  ❌ CRASH: "Out of Memory"              │
└─────────────────────────────────────────┘
```

**VRAM Sizes:**

| GPU | VRAM | What It Can Handle |
|-----|------|-------------------|
| RTX 4060 (Consumer) | 8 GB | Small models, inference |
| RTX 4090 (Consumer) | 24 GB | Medium models, fine-tuning small models |
| A100 (Data Center) | 40-80 GB | Large models, training |
| H100 (Data Center) | 80 GB | Largest models, full training |

---

### 1.7 What Happens When You Press "Train"

Let's trace the complete journey from your Python code to the GPU actually computing.

![flow](/courses/gpu-story/flow.png)

**Key Insight:** Your Python code is 10,000x removed from the actual silicon doing the work. Frameworks handle all the complexity.

---

### 1.8 The Three Types of AI Chips

| Chip | Full Name | Who Makes It | Best For | Analogy |
|------|-----------|-------------|----------|---------|
| **GPU** | Graphics Processing Unit | NVIDIA, AMD | Training, fine-tuning, inference | Swiss Army knife — does everything |
| **TPU** | Tensor Processing Unit | Google | Training very large models | Specialized factory — only makes one thing, but extremely fast |
| **NPU** | Neural Processing Unit | Apple, Qualcomm, Intel | On-device inference (phone, laptop) | Pocket calculator — always available, low power |

**GPU (NVIDIA):**
- Most flexible
- Best software support (CUDA)
- Industry standard
- Expensive, power-hungry

**TPU (Google):**
- Designed specifically for matrix math
- Faster than GPU for specific operations
- Only available in Google Cloud
- Less flexible

**NPU (Apple M-series, etc.):**
- Built into your phone/laptop
- Runs AI locally (privacy, no internet needed)
- Very low power
- Limited to smaller models

---

### 1.9 Why Your Laptop Isn't Enough

**Typical Laptop:**
- CPU: 4-8 cores
- RAM: 16 GB
- GPU: Integrated (shares RAM with CPU) or none
- Power: 50-100 watts

**What You Need for Training GPT-level Models:**
- CPU: 64+ cores (for data loading)
- RAM: 512 GB - 2 TB
- GPU: 8× A100 (640 GB total VRAM)
- Power: 10,000+ watts
- Cost: $300,000+

**The Gap:**

| Task | Your Laptop | Data Center |
|------|------------|-------------|
| Run ChatGPT inference | ❌ No | ✅ Yes |
| Fine-tune 7B model | ❌ No | ✅ Yes |
| Train 1B model from scratch | Maybe (very slow) | ✅ Yes |
| Train GPT-4 class model | ❌ No | ❌ Needs 10,000+ GPUs |

**This is why cloud GPUs exist.** You rent access to powerful machines instead of buying them.

---

### 1.10 Key Terms Summary

| Term | Simple Definition |
|------|------------------|
| **CPU** | The smart, flexible brain of your computer. Good at one thing at a time. |
| **GPU** | An army of simple workers. Good at doing the same math operation thousands of times simultaneously. |
| **VRAM** | The GPU's private memory. Holds the model and data while computing. |
| **Core** | One processing unit. CPUs have few smart cores; GPUs have thousands of simple cores. |
| **Parallel** | Doing many things at the same time instead of one after another. |
| **CUDA** | NVIDIA's language that lets programmers tell GPUs what to do. |
| **TPU** | Google's specialized AI chip. Very fast for specific tasks, less flexible. |
| **NPU** | AI chip in your phone. Runs small models locally with low power. |

---

## Assessment

### Q1: What is the primary difference between a CPU and a GPU?
- [ ] GPUs are older technology than CPUs
- [x] CPUs are good at one complex task at a time; GPUs are good at many simple tasks simultaneously
- [ ] GPUs can only run video games
- [ ] CPUs have more memory than GPUs

### Q2: Why was the GPU originally invented?
- [ ] Specifically for artificial intelligence
- [x] For rendering video game graphics
- [ ] For cryptocurrency mining
- [ ] For scientific calculations

### Q3: What does VRAM store during AI model training?
- [ ] The final trained model only
- [ ] Your Python code
- [x] The model weights, training data, and intermediate calculations
- [ ] Internet browser history

### Q4: Which chip type is built into your smartphone for running AI locally?
- [ ] GPU
- [ ] TPU
- [x] NPU
- [ ] CPU

### Q5: In the "painting houses" analogy, why is the GPU faster?
- [ ] Each GPU painter is faster than the CPU painter
- [ ] The GPU uses better paint
- [x] The GPU has thousands of painters working simultaneously
- [ ] The GPU paints houses in a different order




