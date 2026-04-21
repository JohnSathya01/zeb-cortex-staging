# Chapter 6: Data Parallelism — Training the Same Model on Multiple GPUs

## Learning Objectives

- Understand why a single GPU eventually becomes the bottleneck and what scaling out means
- Explain how data parallelism splits training work across multiple GPUs without splitting the model
- Describe the synchronization step that happens after each batch and why it's necessary
- Identify the communication cost of data parallelism and when it becomes a problem
- Calculate the effective batch size and approximate speedup when adding GPUs

---

## Key Concepts

### 6.1 Recap

In Modules 4 and 5, we learned how a single GPU trains a neural network: data flows in, weights get updated via backpropagation, and the process repeats thousands of times. We also learned how precision formats (FP16, BF16) and memory tricks keep training from crashing or running out of VRAM.

But here's the wall every AI researcher eventually hits: **one GPU is not enough**.

Training GPT-4 on a single H100 GPU — even if you somehow had unlimited time — would take an estimated **tens of thousands of years**. Real training runs for large models use hundreds or thousands of GPUs running simultaneously. This module is about how that works.

There are several ways to split training across multiple GPUs. We start with the simplest and most widely used: **data parallelism**.

---

### 6.2 The Factory Analogy: Why One Line Isn't Enough

Imagine a single factory worker whose job is to assemble phones. They can assemble 100 phones per day. Your orders come in at 10,000 phones per day. You're never going to catch up.

You have two options:

**Option A:** Build a faster worker (a bigger, more powerful GPU). There are limits to this — there's only so fast one person can move.

**Option B:** Hire more workers and split the order between them. Ten workers, each handling 1,000 phones — done in a day.

**Data parallelism** is Option B. You don't make the model faster; you make copies of it and run those copies in parallel, each processing a different slice of your training data.

---

### 6.3 What Data Parallelism Actually Does

Here's the setup before data parallelism:

```
                  SINGLE GPU TRAINING
┌─────────────────────────────────────────────┐
│                    GPU 0                    │
│                                             │
│  Full Model (weights)                       │
│  ┌──────────────────────────────────────┐   │
│  │  Layer 1 → Layer 2 → ... → Layer N  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  Processes batch of 32 samples              │
│  Updates weights once per batch             │
└─────────────────────────────────────────────┘
```

With data parallelism across 4 GPUs:

```
              DATA PARALLELISM — 4 GPUs
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    GPU 0     │ │    GPU 1     │ │    GPU 2     │ │    GPU 3     │
│              │ │              │ │              │ │              │
│ Full Model   │ │ Full Model   │ │ Full Model   │ │ Full Model   │
│  (copy 1)   │ │  (copy 2)   │ │  (copy 3)   │ │  (copy 4)   │
│              │ │              │ │              │ │              │
│ Samples 1-8  │ │ Samples 9-16 │ │ Samples17-24 │ │ Samples25-32 │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
       ↓               ↓               ↓               ↓
  Compute           Compute           Compute          Compute
  gradients         gradients         gradients        gradients
       ↓               ↓               ↓               ↓
       └───────────────┴───────────────┴────────────────┘
                              ↓
                   SYNCHRONIZE GRADIENTS
                   (average them together)
                              ↓
               All GPUs update their weights
               with the same averaged gradient
```

Each GPU has a complete copy of the model. The training batch (say, 32 examples) is divided evenly — 8 examples per GPU. Each GPU processes its slice independently, computes gradients, and then — this is the key step — **all GPUs share their gradients and average them**.

After averaging, every GPU updates its weights using the same combined gradient. All four model copies remain identical after each step.

---

### 6.4 The Synchronization Step: Why It's Necessary

This is the part that trips people up: *why do we need to average gradients at all?*

Think about it this way. Imagine four students each reading a different chapter of the same textbook, then each one teaches themselves separately. By the end of the day, they've all learned different things — their "models" of the subject have diverged.

If instead they pause at the end of each chapter, compare notes, and write a combined summary together — then everyone updates their understanding using the full picture. That's gradient averaging.

Without synchronization, each GPU would update its weights in a slightly different direction based on its slice of data. After a few hundred steps, the four model copies would diverge completely, each having "learned" a different thing. The training run would be scientifically meaningless.

With synchronization, even though each GPU only saw 8 examples, the combined gradient represents what *all 32 examples* were trying to teach the model. It's as if one GPU processed all 32 — but four times faster.

---

### 6.5 The All-Reduce Operation: How GPUs Share Gradients

The technical name for the "share and average" step is the **all-reduce** operation. (We'll go deeper on communication patterns in Chapter 34, but let's understand the basics now.)

"All-reduce" means: *every GPU sends its data to all other GPUs, and together they compute a combined result that every GPU receives.*

```
BEFORE all-reduce:
  GPU 0 has gradient: [2.0, 4.0, 1.0]
  GPU 1 has gradient: [3.0, 2.0, 5.0]
  GPU 2 has gradient: [1.0, 6.0, 3.0]
  GPU 3 has gradient: [4.0, 0.0, 3.0]

AFTER all-reduce (average):
  All GPUs receive:   [2.5, 3.0, 3.0]
  (Each value is the average across all 4 GPUs)
```

This is like four bakers each tasting a different tray of cookies, then calling each other to agree on a single average score — so they all make the same adjustment to their shared recipe.

The all-reduce step is also the **bottleneck** of data parallelism. While GPUs are computing their gradients, they work in parallel with no communication needed. But during the all-reduce, every GPU has to talk to every other GPU. The larger the model, the more gradient data there is to exchange, and the longer this takes.

---

### 6.6 Effective Batch Size and Why It Matters

When you use data parallelism, your **effective batch size** grows with the number of GPUs.

If each GPU processes 8 examples per step, and you have 4 GPUs:

```
Effective batch size = 8 examples × 4 GPUs = 32 examples
```

This sounds great — you're "seeing" 32 examples per step instead of 8. And you're doing it in roughly the same time as processing 8 examples on one GPU (plus a small overhead for the all-reduce).

But there's a catch. Research has shown that **very large batch sizes can hurt model quality** if you're not careful. When you train with a batch of 32,000 instead of 32, each gradient update uses so much data that the updates become too "smooth" — the model stops exploring different paths and gets stuck.

The standard fix is to **scale the learning rate** (the size of each weight update step) proportionally to the batch size. If you double your batch size, you roughly double your learning rate too. This is called **linear scaling** and it works well up to a point (typically up to batch sizes in the thousands; beyond that, more careful tuning is needed).

| Batch Size | Typical Learning Rate | Effect              |
|------------|----------------------|---------------------|
| 32         | 0.0001               | Noisy but flexible  |
| 256        | 0.0008               | Good balance        |
| 2,048      | 0.006                | Fast but needs tuning |
| 32,768     | Careful tuning needed | Risk of instability |

---

### 6.7 The Limits of Data Parallelism

Data parallelism is the right tool in many situations, but it has hard limits.

**Problem 1: The model must fit on each GPU.**

Each GPU holds a complete copy of the model. If the model is too large to fit on a single GPU, data parallelism alone won't help — you can't copy a model that doesn't fit anywhere.

LLaMA-3 70B in BF16 requires about 140 GB of VRAM. A single H100 has 80 GB. Data parallelism won't help here — you'd need to split the *model* itself, which is what model parallelism (Chapter 29) handles.

**Problem 2: Communication overhead grows with model size.**

Every parameter in the model has a corresponding gradient. A model with 7 billion parameters produces 7 billion gradient values per step — roughly 14 GB in FP16. Sending 14 GB between GPUs takes time, even over fast connections like NVLink.

At some scale, GPUs spend more time waiting for gradients to arrive than actually training. Adding more GPUs stops helping — and may even slow things down.

**Problem 3: Synchronization requires all GPUs to wait for the slowest one.**

If one GPU is slightly slower (different workload, slightly slower hardware, one sample that takes longer to process), all other GPUs wait for it at the synchronization barrier. This is called **stragglers** and it's a real problem in large clusters.

---

### 6.8 When to Use Data Parallelism

Despite its limits, data parallelism is the **right first choice** for most training scenarios. Here's a practical guide:

```
Does your model fit on a single GPU?
        │
        Yes → Use data parallelism to go faster
        │     (add more GPUs = bigger effective batch = faster training)
        │
        No  → You need model or tensor parallelism (Chapter 29, 31)
              Often combined WITH data parallelism
```

Real-world training runs almost always use **combinations** of parallelism strategies. For example, a common setup for a 70B model with 64 H100s:

- **Tensor parallelism** across 4 GPUs to fit the model (each GPU holds ¼ of each layer)
- **Pipeline parallelism** across 4 GPUs to split layers across the depth
- **Data parallelism** across the remaining dimension (4 × 4 = 16 GPUs per model replica, 4 replicas total)

We'll build up to understanding this full picture by the end of Module 6.

---

### 6.9 Data Parallelism in Practice: The Numbers

Here are real-world scaling characteristics for data parallelism on common hardware:

| Setup             | GPUs  | NVLink? | Communication Overhead | Practical Speedup |
|-------------------|-------|---------|----------------------|-------------------|
| Single node       | 1–8   | Yes     | ~2–5% of step time   | Near-linear       |
| Single node       | 1–8   | No      | ~10–20% of step time | Moderate          |
| Multi-node        | 8–64  | Yes+IB  | ~5–15% of step time  | Good              |
| Multi-node        | 64+   | Yes+IB  | ~15–30% of step time | Diminishing       |

"Near-linear" means: 4 GPUs = approximately 3.8× speedup (not exactly 4× because of communication overhead).

The connection hardware matters enormously — NVLink (a fast direct connection between GPUs on the same machine) makes all-reduce much faster than standard PCIe connections. We'll cover this in detail in Chapter 35.

---

## Assessment

### Q1: In data parallelism, what is stored on each GPU?

- [ ] A different slice of the model's layers
- [x] A complete copy of the entire model, processing a different slice of the data batch
- [ ] Only the gradients, while the model stays on the CPU
- [ ] The optimizer states only, while model weights are shared

### Q2: After each training step in data parallelism, why must GPUs synchronize their gradients?

- [ ] To free up memory for the next batch
- [ ] Because GPUs can only update weights when all other GPUs are idle
- [x] Each GPU only saw part of the data batch, so their individual gradients are incomplete — averaging them gives an update that represents the full batch
- [ ] Synchronization is optional and only done when training is unstable

### Q3: You are training a 7B parameter model in BF16 (2 bytes per parameter). Your model fits on one H100 (80 GB VRAM). You add 3 more H100s using data parallelism. What is the primary benefit?

- [ ] The model can now use more parameters than before
- [ ] Each GPU now holds only 25% of the model, freeing VRAM
- [ ] Training crashes become less likely because gradients are averaged
- [x] Each GPU processes a different slice of each batch in parallel, increasing throughput — the model trains faster without any change to the model itself

### Q4: A researcher trains with 1 GPU using batch size 64. She switches to data parallelism with 8 GPUs, keeping 64 examples per GPU. What is the effective batch size now, and what should she consider adjusting?

- [ ] Effective batch size stays 64; no changes needed
- [ ] Effective batch size is 8; she should reduce the learning rate
- [x] Effective batch size is 512 (64 × 8); she should consider scaling up the learning rate proportionally
- [ ] Effective batch size is 64 but training is 8× faster with no downsides

### Q5: A model has 70 billion parameters stored in BF16 (2 bytes each). Why can't data parallelism alone allow this model to train on a cluster of 8 H100s (80 GB each)?

- [ ] Data parallelism requires all GPUs to have the same amount of VRAM
- [x] Each GPU needs a full copy of the model, which requires ~140 GB — more than any single H100's 80 GB
- [ ] 70B models require at least 16 GPUs to run any form of parallelism
- [ ] BF16 is not supported by data parallelism frameworks

### Q6: What happens during the "all-reduce" operation in data parallelism?

- [ ] All GPUs reset their weights to match GPU 0
- [ ] The CPU collects gradients from each GPU and broadcasts the average back
- [ ] GPUs take turns processing the full batch one at a time
- [x] Every GPU sends its gradients to all other GPUs, they're averaged together, and every GPU receives the same final averaged gradient

### Q7: You add a 5th GPU to a 4-GPU data parallelism setup, but training only speeds up by 2% instead of the expected ~20%. What is the most likely cause?

- [ ] The model is too small to benefit from a 5th GPU
- [ ] The learning rate was not scaled up to match the larger batch
- [x] The communication overhead (all-reduce time) is dominating — GPUs are spending most of their time exchanging gradients rather than computing
- [ ] The 5th GPU has a different VRAM size, causing an imbalance

---

## Exercise

### Exercise 1: The Restaurant Chain Analogy

A fast-food chain wants to serve more customers. They have two choices: build a bigger single kitchen with more equipment, or open 4 smaller identical restaurants in different neighborhoods.

Write 4–6 sentences mapping this analogy to data parallelism:
- What is the "kitchen" in the analogy?
- What is the "customer order" in the analogy?
- What would the "synchronization step" look like in a restaurant context? (Hint: imagine the four restaurants need to keep their recipes identical)
- What breaks down if the restaurants stop synchronizing?

**Submission Type:** text

---

### Exercise 2: Batch Size and Learning Rate Calculator

You are setting up a data parallelism training run. Fill in the blanks using the linear scaling rule: *learning rate scales proportionally with batch size*.

**Baseline:** 1 GPU, batch size = 32, learning rate = 0.0001

| Number of GPUs | Examples per GPU | Effective Batch Size | Recommended Learning Rate |
|----------------|-----------------|----------------------|--------------------------|
| 1              | 32              | 32                   | 0.0001                   |
| 2              | 32              | ?                    | ?                        |
| 4              | 32              | ?                    | ?                        |
| 8              | 32              | ?                    | ?                        |
| 16             | 32              | ?                    | ?                        |

After filling in the table, write 2–3 sentences explaining *why* the learning rate needs to increase when batch size increases. Use your own analogy — not the ones from this chapter.

**Submission Type:** text

---

### Exercise 3: Choosing the Right Parallelism Strategy

For each scenario below, decide whether data parallelism is the right choice, the wrong choice, or needs to be combined with something else. Justify each answer in 2–3 sentences.

**Scenario A:** You have a small 350M parameter model (fits easily on one GPU) and want to train it 8× faster.

**Scenario B:** You have a 180 billion parameter model that requires 360 GB of VRAM even in BF16. You have 8 H100s (80 GB each).

**Scenario C:** You have a 7B parameter model that fits on one H100, but your cloud provider charges by the hour and you want to minimize training time cost, not wall-clock time.

**Scenario D:** You have 64 GPUs connected over standard PCIe (no NVLink, no InfiniBand). Your model has 65B parameters. Each all-reduce takes 40 seconds; each training step takes 5 seconds.

**Submission Type:** text

---

### Exercise 4: Diagnose the Training Run

A team is running data parallelism training on 16 GPUs. They observe the following:

- GPU utilization across all 16 GPUs: 30–40% (they expected 90%+)
- VRAM usage: normal, all GPUs well within limits
- Network traffic between GPUs: maxed out, constantly saturated
- Training loss: decreasing normally, no instability

Write a 5–8 sentence diagnosis:
- What is causing the low GPU utilization?
- Is the training fundamentally broken, or just inefficient?
- What would you check or change first to fix this?
- If the GPUs were connected by NVLink instead of PCIe, how might the picture change?

**Submission Type:** text