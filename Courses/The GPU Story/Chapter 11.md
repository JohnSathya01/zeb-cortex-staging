# Chapter 11: Cloud GPUs & Hardware Selection — Renting the Right Brain for the Job

## Learning Objectives

- Identify the key differences between major NVIDIA GPU generations and explain what changed between them
- Distinguish between consumer GPUs (RTX) and data center GPUs (A100/H100) and know when each is appropriate
- Understand how cloud GPU pricing works — including per-hour billing, spot vs. on-demand, and reserved pricing
- Explain how GPU virtualization (time-slicing and MIG) allows one physical GPU to serve multiple workloads
- Select an appropriate GPU type for training, fine-tuning, or inference given a specific budget and use case

---

## Key Concepts

### 11.1 Recap: What We Know So Far

In Modules 9 and 10, we learned how to make models more memory-efficient — through LoRA, quantization, KV caching, and continuous batching. Now we face a practical question: **which GPU do you actually rent or buy to run these workloads?**

This chapter is about hardware decisions and the economics of GPU compute. We'll cover the GPU landscape, what the names and numbers actually mean, and how cloud billing works — including the traps that catch people off guard.

---

### 11.2 NVIDIA GPU Generations — A Brief History of Raw Power

NVIDIA releases new GPU generations roughly every two years. Each generation brings improvements in speed, memory size, and energy efficiency. Understanding the generational progression helps you decode marketing materials and benchmark comparisons.

Think of GPU generations like car model years. A 2024 sedan isn't just faster than a 2018 sedan — it has fundamentally different engineering under the hood: better fuel efficiency, safety systems that didn't exist before, a different engine architecture. Similarly, each NVIDIA generation isn't just "faster" — it introduces new capabilities that change what's possible.

Here are the generations relevant to AI/ML work today:

```
NVIDIA DATA CENTER GPU TIMELINE:

2017  ▌ V100 (Volta)
      │  · First GPU with Tensor Cores
      │  · 16/32 GB HBM2 memory
      │  · The GPU that trained the original BERT, GPT-2
      │  · Still found on older cloud instances

2020  ▌ A100 (Ampere)
      │  · 3× faster than V100 for AI workloads
      │  · 40 GB and 80 GB variants
      │  · Introduced MIG (Multi-Instance GPU)
      │  · Introduced bf16 support (important for stable training)
      │  · The workhorse of most LLM training 2020–2023

2022  ▌ H100 (Hopper)
      │  · 3× faster than A100 for transformer workloads
      │  · 80 GB HBM3 (faster memory bandwidth than A100)
      │  · NVLink 4.0 — faster multi-GPU communication
      │  · Introduced FP8 training support
      │  · The current top-tier training GPU (2023–present)

2024  ▌ H200 (Hopper refresh)
      │  · Same compute as H100, but 141 GB HBM3e memory
      │  · Designed for huge models and long context
      │  · Dramatically better inference for 70B+ models

      ▌ L40S (Ada Lovelace, 2023)
      │  · 48 GB GDDR6 (cheaper than HBM)
      │  · Excellent for inference, not ideal for large-scale training
      │  · Lower cost than H100, popular for deployment
```

**CONSUMER GPU COUNTERPARTS:**

```
2020  ▌ RTX 3090 (Ampere) — 24 GB GDDR6X
2022  ▌ RTX 4090 (Ada Lovelace) — 24 GB GDDR6X
2025  ▌ RTX 5090 (Blackwell) — 32 GB GDDR7
```

Consumer GPUs (RTX) share silicon with data center GPUs from the same generation — the RTX 4090 uses Ada Lovelace architecture just like the L40S. But they differ in important ways we'll explore in the next section.

**Key specs comparison table:**

| GPU | VRAM | Memory Bandwidth | Relative AI Speed | Cloud Price (approx.) |
|---|---|---|---|---|
| V100 16GB | 16 GB HBM2 | 900 GB/s | 1× (baseline) | $2–3/hr |
| A100 40GB | 40 GB HBM2e | 1,555 GB/s | ~3× | $3–4/hr |
| A100 80GB | 80 GB HBM2e | 2,000 GB/s | ~3.5× | $4–5/hr |
| H100 80GB | 80 GB HBM3 | 3,350 GB/s | ~9× | $8–12/hr |
| L40S 48GB | 48 GB GDDR6 | 864 GB/s | ~5× (inference) | $4–7/hr |
| RTX 4090 | 24 GB GDDR6X | 1,008 GB/s | ~3× | $0.70–1.20/hr |

*Prices are approximate and vary by cloud provider, region, and availability.*

---

### 11.3 Consumer GPUs vs. Data Center GPUs — What Are You Actually Paying For?

An RTX 4090 costs around $1,600 to buy outright, or $0.70–1.20/hr to rent. An H100 costs $30,000+ to buy, or $8–12/hr to rent. Both can run language models. So what justifies the 10× price difference?

The answer isn't raw compute speed alone. There's a whole category of features that data center GPUs have that consumer GPUs simply don't.

Think of it like comparing a delivery van to a Formula One car. The F1 car is faster on a straight line. But the delivery van can carry 500 packages, drives 24/7 without overheating, has a warranty for commercial use, and fits in a loading dock. They're built for completely different jobs.

#### ECC Memory — The Data Integrity Guarantee

Data center GPUs use **ECC (Error-Correcting Code) memory**. This means if a bit in VRAM gets flipped due to cosmic rays, heat, or electrical noise (which happens surprisingly often in large GPU clusters), ECC detects and corrects the error automatically.

For a training run that takes two weeks, a single undetected bit flip could corrupt your entire model checkpoint. For a hospital's diagnostic AI, a wrong bit could change a diagnosis. Consumer GPUs don't have ECC — they prioritize speed over reliability.

#### NVLink — The Highway Between GPUs

When you need more VRAM than one GPU can hold, you connect multiple GPUs together. Consumer GPUs connect via **PCIe** — the standard interface that connects all expansion cards to your motherboard. It's functional, but relatively slow.

Data center GPUs connect via **NVLink** — a dedicated high-speed interconnect built specifically for GPU-to-GPU communication.

```
PCIE (Consumer GPUs):
GPU A ←──────────────────→ GPU B
       PCIe: 32–64 GB/s
       (data passes through CPU)

NVLINK (Data Center GPUs):
GPU A ←══════════════════→ GPU B
       NVLink: 600–900 GB/s
       (direct GPU-to-GPU)

NVLink is ~15× faster for multi-GPU workloads
```

When training large models that need tensor parallelism across multiple GPUs (passing intermediate activations between GPUs thousands of times per second), PCIe bandwidth becomes a severe bottleneck. NVLink removes that bottleneck.

#### Thermal Design — Built for Continuous Operation

A gaming GPU runs hot for 3-hour sessions. Data center GPUs are designed to run at maximum load 24 hours a day, 7 days a week, indefinitely. They use different cooling designs, higher quality components, and have mean time between failures (MTBF) ratings appropriate for commercial operation.

#### MIG — One GPU, Many Workloads (More on This in 11.5)

The A100 and H100 can be physically partitioned into up to 7 independent mini-GPUs, each with its own isolated VRAM and compute. Consumer GPUs have no equivalent feature.

**Decision guide:**

| Use Case | Consumer GPU | Data Center GPU |
|---|---|---|
| Personal fine-tuning project | ✓ Great choice | Overkill, expensive |
| Small startup MVP | ✓ Often sufficient | When needed |
| Multi-week training run | Risk (no ECC, thermal) | ✓ Required |
| Multi-GPU tensor parallelism | Limited (PCIe bottleneck) | ✓ NVLink |
| Production serving (SLA) | Risk | ✓ Required |
| Learning and experimentation | ✓ Excellent | Unnecessary |

---

### 11.4 GPU Pricing on the Cloud — How the Bill Actually Works

Cloud GPU pricing sounds simple: you pay per hour for the GPU you use. But the details matter — significantly.

#### The Basic Model: Per-Hour (or Per-Second) Billing

Most cloud providers bill GPU usage by the hour or by the second. The meter starts when your instance starts up (when the GPU is allocated to you) and stops when you terminate it.

```
EXAMPLE BILLING:
You start an A100 80GB instance at 2:00 PM.
You finish your training run at 5:47 PM.
You terminate the instance immediately.

Time used:  3 hours, 47 minutes = 3.78 hours
Price:      $4.50/hr × 3.78 hr = $17.02

Even if your GPU sat idle during setup and debugging,
the meter was running from 2:00 PM.
```

The lesson: **idle time costs the same as active time**. This surprises many newcomers who assume you only pay when the GPU is "doing work." The GPU is allocated to you whether it's computing or waiting for you to write code.

#### The Three Pricing Tiers

Cloud providers offer GPU instances in three main pricing models, each with different cost and risk profiles:

**Tier 1: On-Demand**

You request a GPU, it's yours immediately (if available), and you pay the standard hourly rate. No commitment, no risk, cancel any time. The most expensive option per hour, but the simplest.

**Tier 2: Spot Instances (also called Preemptible Instances)**

Cloud providers have spare GPU capacity that sits idle when no one needs it. They sell this idle capacity at a steep discount — often 60–90% cheaper than on-demand pricing. The catch: if someone else needs that capacity for on-demand pricing, the cloud provider can **interrupt your spot instance** with little or no warning, shutting it down mid-training.

```
ON-DEMAND vs. SPOT PRICING (approximate, varies by provider):

GPU          On-Demand    Spot Price   Savings
─────────────────────────────────────────────
A100 80GB    $4.50/hr    $1.35/hr     70%
H100 80GB    $10.00/hr   $3.00/hr     70%
RTX 4090     $1.10/hr    $0.35/hr     68%
```

A 70% discount is enormous over a long training run. A two-week H100 training job at on-demand pricing costs ~$3,360. The same job at spot pricing costs ~$1,008. The difference funds another project entirely.

**Tier 3: Reserved / Committed Use**

You commit to using a specific GPU for a set period (1 year or 3 years) and pay upfront or monthly. Typically 30–50% cheaper than on-demand. Makes sense for teams with stable, predictable GPU usage. Requires confidence that you'll actually use the capacity.

| Pricing Model | Discount vs. On-Demand | Availability | Best For |
|---|---|---|---|
| On-Demand | — (baseline) | Immediate | Short runs, urgent jobs |
| Spot/Preemptible | 60–90% off | May be interrupted | Long training with checkpointing |
| Reserved (1-year) | 30–50% off | Guaranteed | Steady production workloads |

---

### 11.5 Spot Instance Interruptions — Checkpoint, Save, Resume

Spot instances are the biggest money-saver in cloud GPU budgeting. But using them safely requires one critical discipline: **checkpointing**.

#### What Happens During a Spot Interruption

The cloud provider warns you (usually 2 minutes in advance on AWS, less on some others) that your instance is about to be reclaimed. If you don't act in time, the instance shuts down. Everything in GPU memory is lost. Your training run is gone.

This sounds terrifying. But it's entirely manageable with proper checkpointing.

Think of it like working on a document. If you save every 10 minutes, a computer crash loses you at most 10 minutes of work. If you never save, you lose everything. Spot instances are the same.

#### The Checkpoint-Save-Resume Cycle

```
TRAINING LOOP WITH CHECKPOINTING:

Start training
    │
    ├─── Every N steps:
    │    ┌─────────────────────────────────────┐
    │    │  SAVE CHECKPOINT to persistent      │
    │    │  storage (S3, GCS, etc.):           │
    │    │  · Model weights                    │
    │    │  · Optimizer states                 │
    │    │  · Current step number              │
    │    │  · Learning rate schedule state     │
    │    │  · Random number generator state    │
    │    └─────────────────────────────────────┘
    │
    ├─── On spot interruption warning:
    │    ┌─────────────────────────────────────┐
    │    │  EMERGENCY SAVE immediately         │
    │    │  (2-minute window to save and exit) │
    │    └─────────────────────────────────────┘
    │
    └─── On restart (new spot instance):
         ┌─────────────────────────────────────┐
         │  LOAD CHECKPOINT from storage       │
         │  Resume from exact step saved       │
         │  Training continues seamlessly      │
         └─────────────────────────────────────┘
```

**What must be in a checkpoint:**

| Component | Why It Matters |
|---|---|
| Model weights | The actual learned parameters |
| Optimizer states | Adam's momentum — without this, training "forgets" its momentum and takes time to rebuild it, wasting steps |
| Step number | So you know where to resume |
| LR scheduler state | So your learning rate curve continues correctly (not restarted from the beginning) |
| RNG state | Ensures the data order and dropout patterns continue consistently |

Many newcomers only save model weights and wonder why their resumed training behaves strangely. The optimizer state is often the most critical piece to save correctly.

**Practical checkpointing cadence:**

| Training Duration | Save Every | Max Work Lost on Interruption |
|---|---|---|
| Short run (< 2 hours) | 15 minutes | 15 minutes |
| Medium run (2–24 hours) | 30 minutes | 30 minutes |
| Long run (> 24 hours) | 1 hour | 1 hour |

Saving too frequently wastes time and storage costs. Saving too rarely risks large rollbacks. For most fine-tuning jobs, every 30 minutes is reasonable.

---

### 11.6 GPU Virtualization — Time-Slicing and MIG

A large organization might have expensive H100 GPUs sitting available, but their teams' workloads are small — maybe just running inference on a 7B model that only uses 8 GB of the H100's 80 GB. Running one small workload on one large GPU wastes 72 GB of expensive VRAM.

GPU virtualization solves this by allowing one physical GPU to be shared across multiple workloads. There are two fundamentally different ways to do this.

#### Method 1: Time-Slicing — The Rotating Door

Time-slicing works exactly like CPU multitasking. When your laptop runs 10 apps simultaneously, the CPU isn't actually doing 10 things at once — it's switching between them so fast (thousands of times per second) that it feels simultaneous.

GPU time-slicing does the same: multiple workloads take turns using the GPU, each getting a slice of time.

```
TIME-SLICING: 1 GPU, 4 workloads

Time ──────────────────────────────────────────────▶
      │ A │ B │ C │ D │ A │ B │ C │ D │ A │ B │...

Workload A: runs, pauses, runs, pauses...
Workload B: waits, runs, waits, runs...
All share the full 80 GB of VRAM simultaneously.
```

**The problem:** all workloads share all of VRAM. If Workload A has a bug that corrupts memory, it can affect Workload B. There's no isolation. Time-slicing is useful for development and testing environments where this risk is acceptable.

#### Method 2: MIG (Multi-Instance GPU) — The Physical Partition

MIG, introduced with the A100, takes a fundamentally different approach. It **physically partitions** the GPU — splitting the compute units, memory bandwidth, and VRAM into completely isolated slices. Each slice is a real, hardware-isolated mini-GPU.

```
MIG: 1 H100 (80 GB) → Up to 7 isolated instances

┌─────────────────────────────────────────────────┐
│                  H100 80GB                       │
├──────────┬──────────┬──────────┬────────────────┤
│ MIG 1    │ MIG 2    │ MIG 3    │ MIG 4          │
│ 10 GB    │ 10 GB    │ 20 GB    │ 40 GB          │
│ 1/7 GPU  │ 1/7 GPU  │ 2/7 GPU  │ 4/7 GPU        │
│          │          │          │                 │
│ Team A   │ Team B   │ Team C   │ Team D's        │
│ inference│ inference│ fine-tune│ large training  │
└──────────┴──────────┴──────────┴─────────────────┘

Each instance is completely isolated:
✓ Can't read each other's memory
✓ Guaranteed compute and memory bandwidth
✓ Can be given to different users / tenants
```

If Team A's workload crashes, Teams B, C, and D are unaffected. Each MIG instance has guaranteed, predictable performance — not variable depending on what neighbors are doing.

**Time-Slicing vs. MIG:**

| Property | Time-Slicing | MIG |
|---|---|---|
| Isolation | None — shared VRAM | Complete — dedicated VRAM |
| Performance predictability | Variable (depends on neighbors) | Guaranteed |
| Supported GPUs | Any modern GPU | A100, H100 only |
| Configuration | Software-only | Hardware partition |
| Use case | Dev/test, low-stakes sharing | Production, multi-tenant |
| Flexibility | High (many workloads) | Lower (fixed partition sizes) |

Cloud providers use MIG to offer smaller GPU slices at lower cost. On AWS, a "A100 10GB" instance isn't a special GPU — it's a MIG slice of a full A100 80GB.

---

### 11.7 Choosing the Right GPU — Training vs. Fine-Tuning vs. Inference

Now we tie everything together. The "best" GPU depends entirely on what you're doing. A GPU that's perfect for training from scratch is wasteful for running inference. A GPU that's ideal for local inference won't work for multi-node training.

Think of it like choosing a vehicle. A semi-truck is ideal for moving freight across the country. An electric scooter is ideal for the last mile in a city. Neither is the "best vehicle" in absolute terms — the right choice depends on the job.

#### Decision Framework

**Step 1: What is your task?**

```
Training from scratch?
    └── You need maximum VRAM (80 GB+) and NVLink for multi-GPU
        → H100 80GB or H200 on cloud

Fine-tuning (LoRA/QLoRA)?
    └── You need moderate VRAM (16–48 GB) and good fp16/bf16 speed
        → A100 40GB, RTX 4090, L40S

Inference / serving?
    └── Depends on model size and throughput needs
        → See below
```

**Step 2 (for inference): What's your model size and traffic?**

```
Model ≤ 13B, low traffic → RTX 4090 or A10G (24 GB)
Model ≤ 30B, medium traffic → A100 40GB or L40S (40–48 GB)
Model 70B, production serving → A100 80GB, H100, or L40S ×2
Model 70B+ or very long context → H100 80GB or H200
```

**Step 3: What's your budget model?**

```
Experimenting, learning → Consumer GPU (RTX 4090) or spot instances
Short project (1–4 weeks) → On-demand cloud GPU
Long training run (months) → Spot instances with checkpointing
Production serving (ongoing) → Reserved instances or owned hardware
```

#### Comprehensive GPU Selection Table

| Scenario | Recommended GPU | Pricing Tier | Monthly Cost (estimate) |
|---|---|---|---|
| Learning, experiments | RTX 4090 (24GB) | On-demand or owned | $200–500/mo cloud |
| LoRA fine-tuning (7B) | A100 40GB or RTX 4090 | Spot | $100–300/mo |
| LoRA fine-tuning (70B) | A100 80GB | Spot | $400–800/mo |
| Training 7B from scratch | 8× A100 80GB (NVLink) | Spot | $5,000–15,000/run |
| Inference: 7B, 100 users | A10G 24GB or RTX 4090 | On-demand or reserved | $500–800/mo |
| Inference: 70B, 1000+ users | 2× A100 80GB with vLLM | Reserved | $5,000–8,000/mo |
| Cutting-edge training | H100 80GB cluster | On-demand | $10,000+/mo |

*Estimates based on 2024–2025 cloud pricing. Always check current provider rates.*

---

### 11.8 Cloud Provider Landscape — AWS, the Others, and Alternatives

When most people think "cloud GPU," they think AWS. But the landscape has expanded considerably, and for many ML workloads, alternatives offer better prices or availability.

#### AWS (Amazon Web Services)

The largest cloud provider. Most complete ecosystem of supporting services (storage, networking, managed ML services). GPU instances are called **P-series** (training) and **G-series** (inference).

```
AWS GPU Instance Types (common ones):

p4d.24xlarge   → 8× A100 40GB    → ~$32/hr on-demand
p4de.24xlarge  → 8× A100 80GB    → ~$40/hr on-demand
p5.48xlarge    → 8× H100 80GB    → ~$98/hr on-demand
g5.xlarge      → 1× A10G 24GB    → ~$1.00/hr on-demand
g6.xlarge      → 1× L4 24GB      → ~$0.80/hr on-demand
```

**Pricing model:** per-second billing (minimum 1 minute). Spot instances available with 2-minute interruption warning.

#### Other Major Cloud Providers

**Google Cloud (GCP):** Strong integration with TPUs (Google's own AI chips, an alternative to NVIDIA GPUs). A100 and H100 instances available. Often competitive pricing, especially with TPU pods for large-scale training.

**Microsoft Azure:** Deep integration with Microsoft's enterprise ecosystem. A100 and H100 instances. Important for organizations already using Microsoft services.

**Lambda Labs:** GPU cloud purpose-built for ML. Often significantly cheaper than AWS for comparable hardware, simpler pricing. Less supporting infrastructure but sufficient for most training workloads.

**RunPod / Vast.ai:** Marketplace models where individual GPU owners rent out their hardware. Cheapest options available, but variable reliability and no enterprise SLA.

| Provider | Strength | Weakness | Best For |
|---|---|---|---|
| AWS | Ecosystem, reliability, scale | Most expensive | Enterprise, complex pipelines |
| GCP | TPU access, competitive pricing | Less ML community | Large-scale training |
| Azure | Enterprise integration | Complex pricing | Microsoft-ecosystem teams |
| Lambda Labs | ML-focused, cheaper | Less ecosystem | Focused ML training jobs |
| RunPod/Vast.ai | Cheapest | Variable reliability | Experiments, tight budgets |

---

### 11.9 Putting It All Together — A Decision Playbook

Here's a practical playbook for the three most common scenarios:

**Scenario A: You're running your first fine-tuning experiment**

```
Goal:        Validate that fine-tuning works for your use case
Model:       Llama 3 8B with QLoRA
Timeline:    A few days of experimentation
Budget:      Minimize cost

Recommendation:
├── GPU:     RTX 4090 (24 GB) on RunPod or Vast.ai
├── Pricing: Spot/interruptible at ~$0.35–0.50/hr
├── Storage: Save checkpoints to cloud storage every 30 min
├── Cost:    ~$8–15 total for a 24-hour experiment
└── Why:     24 GB handles QLoRA on 8B models easily;
             spot pricing minimizes cost; interruptions
             are low-risk for short experiments
```

**Scenario B: You're training a custom 7B model from scratch**

```
Goal:        Pre-train a domain-specific 7B model
Timeline:    3–4 weeks
Budget:      Justify to management

Recommendation:
├── GPU:     8× A100 80GB with NVLink (p4de on AWS)
├── Pricing: Spot instances with aggressive checkpointing
│            (every 30 minutes to S3)
├── Cost:    ~$1.35/hr × 8 GPUs × ~600 hours = ~$6,500
│            vs. on-demand: ~$40/hr × 600 hr = ~$24,000
│            Savings: ~$17,500 using spot
├── Backup:  Save every checkpoint — you will be interrupted
└── Why:     NVLink required for tensor parallelism at 8 GPUs;
             80 GB per GPU for model + optimizer states;
             spot savings are transformational at this scale
```

**Scenario C: You're deploying a 70B inference service**

```
Goal:        Serve a quantized 70B model to 500+ concurrent users
Model:       Llama 3 70B in AWQ 4-bit (~40 GB)
Traffic:     Peaks during business hours

Recommendation:
├── GPU:     2× A100 80GB running vLLM with tensor parallelism
├── Pricing: Reserved instances (1-year) for predictable savings
├── Cost:    ~$4.50/hr × 2 × 8,760 hr × 0.60 (reserved) ≈ $47,000/yr
│            vs. on-demand: ~$4.50/hr × 2 × 8,760 = $78,840/yr
│            Savings: ~$31,000/yr with reservation
├── Setup:   vLLM with PagedAttention, continuous batching
└── Why:     Two 80 GB cards comfortably hold 40 GB model
             + KV cache headroom; reserved pricing justified
             by constant production load; vLLM maximizes
             throughput for multi-user serving
```

---

## Assessment

### Q1: A researcher needs to run a 6-week training job. Their institution has both RTX 4090 GPUs and A100 80GB GPUs available. What is the most important reason to choose the A100 for this long run?

- [ ] The A100 is faster at every single computation
- [ ] The A100 has more CUDA cores than the RTX 4090
- [x] The A100 has ECC memory and is designed for continuous 24/7 operation, reducing the risk of silent data corruption over a long training run
- [ ] The A100 is cheaper to operate than the RTX 4090

### Q2: Your spot instance gets an interruption warning. You have 2 minutes. You saved a full checkpoint 25 minutes ago. What is the best course of action?

- [ ] Try to save only the model weights — optimizer states take too long
- [ ] Let the instance terminate — the cloud will preserve your state automatically
- [x] Trigger an emergency checkpoint save immediately, including model weights, optimizer states, step number, and scheduler state, then let the instance terminate
- [ ] Immediately restart training from scratch on a new on-demand instance

### Q3: A company has one H100 80GB GPU and three small teams, each needing ~20 GB of isolated VRAM for separate inference workloads. Which virtualization approach should they use?

- [ ] Time-slicing — all three teams share the GPU in rotating turns with their workloads in the same 80 GB
- [x] MIG — the H100 is physically partitioned into three isolated ~20 GB instances, one per team
- [ ] They cannot share one GPU at all — each team needs their own physical GPU
- [ ] They should use PCIe to connect three consumer GPUs instead

### Q4: You are building an inference service for a 13B model (needs ~10 GB in 4-bit quantization). You expect 200 simultaneous users. Which GPU is most cost-effective?

- [ ] H100 80GB — it is the fastest GPU available
- [ ] V100 16GB — older and cheaper per hour
- [x] A10G 24GB or L40S 48GB — sufficient VRAM for the model plus KV cache headroom for concurrent users, without paying for unnecessary H100 compute
- [ ] RTX 4090 — consumer GPU is cheapest per hour

### Q5: What is the primary advantage of NVLink over PCIe for multi-GPU training?

- [ ] NVLink allows more GPU memory cards to fit in a server
- [ ] NVLink reduces electricity consumption during training
- [x] NVLink provides ~15× higher bandwidth for GPU-to-GPU communication, eliminating the bottleneck when passing activations between GPUs during tensor parallelism
- [ ] NVLink enables ECC memory on consumer GPUs

### Q6: A startup is deciding between on-demand and spot instances for a 2-week H100 training run. They estimate spot instances will be interrupted 3–4 times. What is the correct analysis?

- [ ] Spot instances are too risky — any interruption ruins the entire training run
- [ ] On-demand is only slightly more expensive, so it is not worth the complexity of checkpointing
- [x] With proper checkpointing every 30–60 minutes, each interruption loses at most 1 hour of work, while the ~70% cost savings likely outweigh that lost compute time
- [ ] Spot instances are only available for consumer-grade GPUs, not H100s

---

## Exercise

### Exercise 1: Spot Instance Cost-Benefit Analysis

Your team wants to train a model that will take approximately 200 GPU-hours on an A100 80GB.

Use these prices:
- On-demand: $4.50/hr
- Spot: $1.35/hr (70% discount)
- Each spot interruption causes you to lose and re-run approximately 45 minutes of compute

Answer the following:

1. What is the total cost at on-demand pricing?
2. What is the total cost at spot pricing (ignoring interruptions)?
3. If you experience 5 interruptions during the run, how many additional GPU-hours are wasted?
4. What is the true spot cost including those 5 interruptions?
5. Even with 5 interruptions, how much money do you save by using spot vs. on-demand?
6. At what number of interruptions does spot pricing stop being cheaper than on-demand? (Calculate the break-even point.)

**Submission Type:** text

---

### Exercise 2: GPU Selection for Three Teams

You work at a company with a shared GPU budget. Three teams have submitted requests. For each team, recommend a specific GPU and pricing tier, and justify your choice using concepts from this chapter.

**Team Alpha — Research**
- Task: Experimenting with different LoRA configurations on a 13B model
- Dataset: 50,000 examples, each run takes 2–4 hours
- Timeline: Running experiments daily for the next month
- Constraint: Results don't need to be production-ready

**Team Beta — Platform**
- Task: Serving a quantized 70B model (AWQ 4-bit, ~40 GB) to internal employees
- Users: ~150 simultaneous employees during business hours, near-zero at night
- SLA: 99.5% uptime required
- Constraint: Cannot afford interruptions during business hours

**Team Gamma — Data Science**
- Task: Pre-training a 3B parameter domain-specific model from scratch
- Timeline: Expected 3-week training run
- Priority: Minimize total cost, willing to handle interruptions

For each team: name the GPU, the pricing tier (spot/on-demand/reserved), and the key reason for your recommendation.

**Submission Type:** text

---

### Exercise 3: Checkpoint Design

You are setting up a long training run on spot instances and need to design a robust checkpointing strategy. Your training job has these characteristics:

- Model: 7B parameters in bf16 (~14 GB of weights)
- Optimizer: AdamW (optimizer states = ~2× model weights = ~28 GB)
- Training duration: ~5 days on 4× A100 80GB GPUs
- Spot interruption rate: historically about 2 per day on this hardware

Answer these questions:

1. What is the approximate size of one full checkpoint (model weights + optimizer states)?
2. If you save a checkpoint every 30 minutes and training runs 24 hours/day, how many checkpoint saves happen over 5 days?
3. If you keep only the 3 most recent checkpoints to save storage, how much total storage do you need to reserve?
4. With interruptions happening twice per day and checkpoints every 30 minutes, what is the maximum amount of compute work you would ever have to redo after an interruption?
5. A colleague suggests "just save the model weights every hour to save storage space." Explain specifically what goes wrong when you resume training from a checkpoint that has model weights but is missing the optimizer states.

**Submission Type:** text