# Chapter 9: Fine-Tuning — Teaching an Old Model New Tricks (Without Breaking the Bank)

## Learning Objectives

- Explain what fine-tuning is and why it uses less GPU memory than training from scratch
- Describe how LoRA modifies a model's behavior by adding small "adapter" layers
- Identify which parameters are frozen vs. trainable and understand the memory implications of each
- Understand how gradient accumulation, mixed precision, and batch size choices affect fine-tuning memory usage
- Calculate approximate memory savings when using LoRA vs. full fine-tuning

---

## Key Concepts

### 9.1 Recap: What We Know So Far

In earlier chapters, we learned that training a neural network means three things happen in sequence on your GPU:

1. **Forward pass** — the model makes a prediction
2. **Loss calculation** — we measure how wrong it was
3. **Backward pass** — gradients flow backward, and the model's weights get updated

We also learned that each of these steps consumes GPU memory (VRAM). During full training, *every single weight* in the model needs its own gradient stored in memory. For a 7-billion-parameter model, that's an enormous amount of VRAM — often 40–80 GB, which is more than most consumer or even professional GPUs can handle.

So the big question for this chapter: **Is there a smarter way?**

The answer is fine-tuning — and specifically, a family of techniques that dramatically reduce how much memory you need.

---

### 9.2 What Is Fine-Tuning, Really?

Imagine you've hired a brilliant chef who trained for 10 years at a world-class culinary school. They already know how to make thousands of dishes. But your restaurant specializes in one thing: authentic Neapolitan pizza. You don't need to teach them cooking from scratch. You just need to *adjust* their existing skills slightly — their technique for stretching dough, the exact temperature of the wood-fired oven, the balance of toppings.

That's fine-tuning.

A **pre-trained model** (like Llama, Mistral, or Falcon) already "knows" language — grammar, facts, reasoning patterns. It learned all of this during a massive, expensive training run on trillions of words. Fine-tuning means taking that existing model and nudging it toward a specific task: customer service, medical summarization, code generation, or answering questions in your brand's voice.

The key insight: **you don't need to change every weight.** Most of what the model knows is already useful. You only need to change a small portion of its behavior.

This is why fine-tuning uses far less memory than pre-training — and why it's within reach for organizations without supercomputer budgets.

---

### 9.3 Frozen vs. Trainable Parameters — The Museum Analogy

Picture a museum with 10,000 paintings. You've been hired to add a new exhibit about contemporary art. You have two options:

- **Option A:** Repaint all 10,000 existing paintings, then add your new exhibit.
- **Option B:** Leave the existing paintings exactly as they are (**freeze** them), and just hang your new pieces in an empty wing.

Option B is obviously faster, cheaper, and safer. That's the idea behind **frozen parameters**.

In fine-tuning:

- **Frozen parameters** = weights we don't change. Their gradients are never calculated, so they use almost no extra memory during training.
- **Trainable parameters** = weights we do update. These need gradients stored in memory.

```
FULL TRAINING (Pre-training):
┌─────────────────────────────────────────┐
│  ALL 7 billion weights                  │
│  [✓ trainable] [✓ trainable] [✓ ...    │
│  Memory needed: ENORMOUS               │
└─────────────────────────────────────────┘

FINE-TUNING (Frozen + Small Adapters):
┌─────────────────────────────────────────┐
│  7 billion base weights                 │
│  [🔒 frozen] [🔒 frozen] [🔒 frozen]  │
│  + small adapter layers                 │
│  [✓ trainable] ← only ~0.1–1% of total│
│  Memory needed: MUCH SMALLER           │
└─────────────────────────────────────────┘
```

By freezing most of the model, we skip calculating and storing gradients for billions of parameters. This is the foundational memory saving in fine-tuning.

**Memory implication at a glance:**

| Scenario | Parameters Updated | Gradient Memory |
|---|---|---|
| Full pre-training (7B model) | 7,000,000,000 | ~28 GB (fp32 gradients) |
| Full fine-tuning (7B model) | 7,000,000,000 | ~28 GB |
| LoRA fine-tuning (7B model) | ~4,000,000 (~0.06%) | ~16 MB |

That's not a typo. LoRA can reduce gradient memory from 28 gigabytes to 16 megabytes. Let's understand how.

---

### 9.4 LoRA — The "Sticky Note" Approach to Model Editing

LoRA stands for **Low-Rank Adaptation**. The name sounds intimidating, but the idea is elegant.

#### The Core Problem LoRA Solves

Inside a neural network, the most important components are large tables of numbers called **weight matrices**. Think of a weight matrix as a giant spreadsheet — maybe 4,096 rows by 4,096 columns — that encodes what the model has learned about language.

To change how the model behaves, we'd normally have to update every cell in that spreadsheet. For large models, those spreadsheets have millions or billions of cells. That requires enormous memory.

LoRA's insight: **we don't need to update the whole spreadsheet. We can describe the change using two much smaller spreadsheets, and add them together.**

#### The Sticky Note Analogy

Imagine you have a massive reference book (the original weight matrix). Instead of reprinting the whole book to make corrections, you place sticky notes on specific pages. Each sticky note is tiny. But together, they effectively "update" the book's content.

LoRA does exactly this — mathematically.

It adds two small matrices (the "sticky notes"), called **A** and **B**, alongside each original weight matrix **W**:

```
Original Matrix W:
┌──────────────────────────────┐
│  4096 × 4096 cells           │
│  = 16,777,216 numbers        │
│  [FROZEN — never changes]    │
└──────────────────────────────┘

LoRA Adapters A and B:
┌──────────┐   ┌──────────┐
│ 4096 × 8 │ × │ 8 × 4096 │  ← rank r = 8
│ = 32,768 │   │ = 32,768  │
│ numbers  │   │ numbers   │
└──────────┘   └──────────┘
Total adapter: 65,536 numbers  (vs 16.7 million in W)
```

The number **8** above is called the **rank** (written as `r`). It controls how expressive (and large) the adapters are. A rank of 8 or 16 is common for fine-tuning. Lower rank = less memory, less expressive. Higher rank = more memory, more capable of change.

#### The W + BA Formula in Action

During the **forward pass**, here's what actually happens:

```
Normal forward pass (no LoRA):
  output = input × W

LoRA forward pass:
  output = input × W  +  input × B × A
              ↑                  ↑
         frozen base         tiny adapter
         (no gradients)     (has gradients)
```

The model still uses W for its core knowledge. The **BA term** is a small correction — the fine-tuning signal. During training:

- W is **frozen**: no gradient calculated, no memory used for it
- A and B are **trainable**: gradients are calculated only for these tiny matrices

This is why LoRA is memory-efficient: the gradient math only happens for a fraction of a percent of the model's parameters.

**After training**, you can even merge the adapters back into W permanently:

```
W_final = W + B × A
```

The merged model is identical in size to the original, with no runtime overhead. No extra sticky notes needed at inference.

---

### 9.5 Adapter Layers — Where Memory Actually Goes

Let's trace exactly where memory is consumed during LoRA fine-tuning. Think of VRAM like a whiteboard that gets filled as training progresses.

```
┌─────────────────────────────────────────────────────┐
│                    VRAM WHITEBOARD                   │
├──────────────────┬──────────────────────────────────┤
│ BASE MODEL       │ ~14 GB (7B model in fp16)        │
│ (frozen weights) │ Loaded once. Never changes.      │
├──────────────────┼──────────────────────────────────┤
│ LORA ADAPTERS    │ ~16–64 MB depending on rank      │
│ (A and B matrices│ These are small!                 │
│  per layer)      │                                  │
├──────────────────┼──────────────────────────────────┤
│ GRADIENTS        │ Only for adapter params          │
│                  │ ~32–128 MB (tiny vs full train)  │
├──────────────────┼──────────────────────────────────┤
│ OPTIMIZER STATES │ Only for adapter params          │
│ (Adam momentum)  │ ~64–256 MB                       │
├──────────────────┼──────────────────────────────────┤
│ ACTIVATIONS      │ Depends on batch size            │
│ (forward pass    │ Often the largest variable cost  │
│  intermediate    │ in fine-tuning                   │
│  values)         │                                  │
├──────────────────┼──────────────────────────────────┤
│ INPUT BATCH      │ Depends on sequence length       │
└──────────────────┴──────────────────────────────────┘
```

Notice the pattern: the base model takes most of the VRAM just to *exist*, but the **training overhead** (gradients + optimizer states) is tiny because we're only training the adapters.

Compare this to full fine-tuning:

| Memory Component | Full Fine-Tuning (7B) | LoRA Fine-Tuning (7B) |
|---|---|---|
| Model weights | ~14 GB | ~14 GB |
| Gradients | ~28 GB | ~64 MB |
| Optimizer states (Adam) | ~56 GB | ~128 MB |
| **Total (approximate)** | **~98 GB** | **~15–18 GB** |

Full fine-tuning of a 7B model needs nearly 100 GB of VRAM — that's multiple high-end data center GPUs. LoRA fine-tuning needs around 15–18 GB — achievable on a single RTX 3090 or 4090.

---

### 9.6 QLoRA — Going Even Further with Quantization

LoRA already makes fine-tuning dramatically cheaper. But what if you want to fine-tune a 13B, 30B, or even 70B model on a single GPU? That's where **QLoRA** comes in.

QLoRA = **Quantization + LoRA**

#### Quick Recap: What Is Quantization?

We covered quantization in earlier chapters. It's like rounding numbers. Instead of storing each weight as a 16-bit decimal (which can represent very precise values), you store it in 4-bit (a much coarser approximation). This uses 4× less memory.

#### How QLoRA Combines the Two Ideas

```
STANDARD LORA:
┌────────────────────┐     ┌──────────┐
│  Base model in     │  +  │  LoRA    │
│  fp16 (16-bit)     │     │  adapters│
│  ~14 GB (7B model) │     │  in fp16 │
└────────────────────┘     └──────────┘

QLORA:
┌────────────────────┐     ┌──────────┐
│  Base model in     │  +  │  LoRA    │
│  NF4 (4-bit)       │     │  adapters│
│  ~4 GB (7B model!) │     │  in bf16 │
└────────────────────┘     └──────────┘
```

The trick: the base model is compressed to 4-bit to save space (memory). But when a computation actually needs to happen, those 4-bit weights are temporarily "uncompressed" to 16-bit for the math — then discarded. The adapters (A and B matrices) are always kept in 16-bit for accuracy.

Think of it like a compact suitcase. Your clothes are vacuum-packed (4-bit storage) to save space in the bag. But when you want to wear them, you take them out and let them expand (16-bit computation). You never do laundry inside a vacuum bag.

**QLoRA memory footprint for popular models (approximate):**

| Model Size | Full Fine-Tune | LoRA (fp16 base) | QLoRA (4-bit base) |
|---|---|---|---|
| 7B parameters | ~98 GB | ~16 GB | ~6 GB |
| 13B parameters | ~180 GB | ~28 GB | ~10 GB |
| 30B parameters | ~420 GB | ~60 GB | ~20 GB |
| 70B parameters | ~980 GB | ~140 GB | ~48 GB |

QLoRA made fine-tuning 70B models possible on a single 80GB A100 GPU — a feat that previously required a cluster of machines.

---

### 9.7 The Forward-Backward Pass During Fine-Tuning

Let's trace what actually happens step by step when you run one training iteration with LoRA. This is different from training from scratch in important ways.

```
STEP 1: FORWARD PASS
━━━━━━━━━━━━━━━━━━━
Input text enters the model.
↓
At each layer, two things happen simultaneously:
  [Frozen W] × input → base output
  [Adapter B] × [Adapter A] × input → small correction
  Both are added together: base output + correction
↓
Final layer produces a prediction.
↓
Loss is calculated (how wrong was the prediction?)

STEP 2: BACKWARD PASS (Backpropagation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gradients flow backward through the network.
↓
When gradient reaches a FROZEN layer (W):
  → Gradient is calculated just enough to pass through
  → NOT stored (no update needed)
  → Memory freed immediately
↓
When gradient reaches an ADAPTER layer (A or B):
  → Gradient is stored in VRAM
  → Will be used to update A and B
  → This is the only gradient memory needed!

STEP 3: WEIGHT UPDATE
━━━━━━━━━━━━━━━━━━━━
Optimizer (e.g., Adam) uses stored gradients
to slightly adjust A and B matrices.
W is untouched.
```

The crucial difference from pre-training: **gradients don't accumulate for frozen layers**. The backward pass still *traverses* the frozen layers (it has to, to reach the adapters), but it doesn't *store* gradients for them. This is the mathematical reason why LoRA fine-tuning uses a fraction of the gradient memory.

---

### 9.8 Gradient Accumulation During Fine-Tuning

You've learned a frustrating truth about GPU memory: you want to train on large batches (more stable, better results), but large batches require enormous amounts of VRAM for activations.

**Gradient accumulation** is the workaround. Think of it like a piggy bank.

Instead of depositing $100 into your savings account in one go (large batch), you deposit $25 four times across the day (small batches, accumulated). The end result in your account is the same: $100.

In GPU terms:

```
WITHOUT GRADIENT ACCUMULATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Batch of 16 samples → forward pass → loss → backward pass → UPDATE WEIGHTS

(Needs enough VRAM to hold all 16 samples' activations at once)

WITH GRADIENT ACCUMULATION (accumulation steps = 4):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Batch of 4 → forward → backward → gradients stored (no update yet)
Batch of 4 → forward → backward → gradients ADDED to stored (no update yet)
Batch of 4 → forward → backward → gradients ADDED (no update yet)
Batch of 4 → forward → backward → gradients ADDED → UPDATE WEIGHTS ← now!

Effective batch size = 16. Peak VRAM = only 4 samples at once.
```

The gradients from each mini-batch are **accumulated** (summed) in memory. Only after all mini-batches have run does the optimizer step happen. Mathematically, this is equivalent to training with the larger batch — you get the benefits of a big batch without the VRAM cost.

**Why this matters especially for fine-tuning:**

Fine-tuning often uses long-sequence data (documents, code files, conversations). Long sequences = massive activations. Gradient accumulation lets you effectively train on larger batches of long sequences without running out of VRAM.

**A practical example:**

| Setting | VRAM for Activations | Effective Batch Size |
|---|---|---|
| Batch 16, no accumulation | ~8 GB | 16 |
| Batch 4, accumulate 4 | ~2 GB | 16 (same!) |
| Batch 1, accumulate 16 | ~0.5 GB | 16 (same!) |

The tradeoff: more accumulation steps = slower training (more forward/backward passes per update). But the math comes out equal.

---

### 9.9 Mixed Precision During Fine-Tuning — Risks and Rewards

We introduced mixed precision in earlier chapters: the idea of using 16-bit numbers instead of 32-bit for most calculations, saving memory and speeding up computation.

During fine-tuning, mixed precision still applies — but with some specific risks to be aware of.

#### The Rewards

Using **bf16** (brain float 16) or **fp16** (float 16) instead of fp32 during fine-tuning:

- Cuts activation memory roughly in half
- Speeds up matrix multiplications on modern GPUs (Tensor Cores love 16-bit)
- Reduces the bandwidth needed to move data around

For LoRA fine-tuning specifically, the adapter weights (A and B) are kept in 16-bit, the base model may be in 16-bit or 4-bit (for QLoRA), and a **master copy** of the adapter weights in fp32 is kept by the optimizer for accurate updates.

```
MIXED PRECISION SETUP IN LORA:
┌─────────────────────────────────────────────┐
│  Base model (W): bf16 or fp16 or nf4        │
│  Adapter A, B: bf16 (for computation)       │
│  Optimizer master weights: fp32             │
│     (hidden copy, used for precise updates) │
│  Loss scaling: enabled (for fp16 only)      │
└─────────────────────────────────────────────┘
```

#### The Risks

**Risk 1: Gradient underflow in fp16**
Very small gradient values can become zero in fp16 (they "underflow" — the number is too small to represent). This causes the model to stop learning. The solution is **loss scaling**: multiply the loss by a large number before the backward pass, then divide the gradients afterward. This keeps gradients in a representable range.

bf16 is more forgiving than fp16 here — it has a larger range of representable values, so underflow is less common. This is why most modern fine-tuning frameworks default to bf16 when hardware supports it (A100, H100, RTX 4000 series).

**Risk 2: Instability with very small LoRA ranks**
If you set rank r=1 or r=2 to save memory, the adapter has very little expressive capacity. Combined with fp16's precision issues, training can become unstable (loss spikes erratically). The fix: use a slightly higher rank (4–16) and bf16.

**bf16 vs fp16 for fine-tuning:**

| Property | fp16 | bf16 |
|---|---|---|
| Memory usage | Same | Same |
| Numerical range | Smaller | Larger (matches fp32) |
| Precision | Higher | Lower |
| Gradient stability | Needs loss scaling | Usually stable without |
| Hardware support | Older GPUs too | Ampere and newer (A100, RTX 30/40xx) |

**Rule of thumb:** Use bf16 if your GPU supports it. Fall back to fp16 with loss scaling if not.

---

### 9.10 Batch Size for Fine-Tuning — Why Smaller Is Often Better

In pre-training, larger batches are almost always better. More data per step = more stable gradient estimates. But fine-tuning has a counterintuitive twist: **small batches often work better**.

#### Why Small Datasets Change the Calculus

Pre-training uses trillions of tokens. Fine-tuning typically uses thousands to hundreds of thousands of examples. When your dataset is small, the math changes:

- With a **large batch**, each update sees a significant chunk of your small dataset. Updates are smooth but slow to converge — you might need many epochs before seeing improvement.
- With a **small batch**, each update is noisier (more random), but that noise actually helps the model **generalize** rather than memorize your fine-tuning examples.

Think of it like studying for an exam. If you review 200 flashcards in one session (large batch), you see each card slowly and methodically. If you study 8 cards at a time, shuffling frequently (small batch), the randomness forces your brain to work harder and often leads to better long-term retention.

This "beneficial noise" in small batches is called **stochastic gradient descent** — the slight randomness prevents the model from finding a shortcut that only works on your training set.

#### Memory Implications

| Batch Size | Activation Memory | Training Stability | Risk of Overfitting |
|---|---|---|---|
| 1 | Minimal | Very noisy | Low |
| 4–8 | Low | Moderate noise (good for fine-tuning) | Low-Medium |
| 16–32 | Medium | Smooth | Medium |
| 64+ | High | Very smooth | Higher (for small datasets) |

For most LoRA fine-tuning jobs, **batch size 4–8 with gradient accumulation to reach an effective batch of 16–32** hits the sweet spot: manageable VRAM, stable-enough training, and good generalization.

---

### 9.11 Learning Rate and GPU Memory — They're Connected

You might be surprised to see "learning rate" in a chapter about GPU memory. They seem unrelated: one is a training hyperparameter, the other is a hardware resource. But they're connected in a subtle way.

#### What Is Learning Rate?

Learning rate controls how big each weight update step is. Imagine you're trying to find the lowest point in a hilly landscape while blindfolded. Each step you take is determined by the slope under your feet. **Learning rate is your step size.**

- Too large: You overshoot valleys and bounce around chaotically (divergence)
- Too small: You shuffle forward very slowly (wasted GPU time)
- Just right: You efficiently descend toward a good minimum

#### The Memory Connection

Here's the link: **large learning rates require more training steps to recover if they cause instability.** If your learning rate is too aggressive, the loss spikes, and you may need to restart training — wasting all the GPU time and memory bandwidth spent on those failed steps.

More subtly: learning rate affects how many **epochs** (full passes through your dataset) are needed. More epochs = more GPU-hours = more electricity and cloud compute cost.

For fine-tuning specifically, **lower learning rates than pre-training are almost always correct.** You're making small adjustments to an already-trained model, not learning from scratch.

**Typical learning rates:**

| Training Type | Typical Learning Rate |
|---|---|
| Pre-training from scratch | 1e-4 to 3e-4 |
| Full fine-tuning | 1e-5 to 5e-5 |
| LoRA fine-tuning | 1e-4 to 3e-4 (higher OK — adapters are small) |
| QLoRA fine-tuning | 1e-4 to 2e-4 |

Wait — LoRA uses higher learning rates than full fine-tuning? Yes! Because only tiny adapter layers are being trained, they can tolerate more aggressive updates without destabilizing the frozen base model. The large W matrices act as a stable anchor.

#### Learning Rate Schedulers: The GPS Rerouting Strategy

Most fine-tuning runs use a **learning rate scheduler** — a plan that changes the learning rate over time. The most common pattern:

```
Learning Rate Over Time:
▲
│    ╱╲
│   ╱  ╲_______________
│  ╱                   ╲___
│ ╱                        ╲
└──────────────────────────────▶ Training Steps
   warmup  ↑  decay begins here

Warmup: Slowly ramp up from 0 → target LR
         (prevents unstable updates early on)
Decay:  Gradually reduce LR toward end
         (fine precision adjustments near the end)
```

This ramp-up-then-decay pattern costs no extra memory, but it can save significant GPU time by preventing early instability that would require restarting.

---

### 9.12 Putting It All Together — Fine-Tuning a 7B Model in ~10 GB of VRAM

Here's how all the techniques from this chapter combine in a real setup. Imagine you want to fine-tune a 7B language model to answer customer support questions for your company. You have a single NVIDIA RTX 3090 (24 GB VRAM).

```
YOUR FINE-TUNING RECIPE:
━━━━━━━━━━━━━━━━━━━━━━━

Base model:         Llama 3 7B
Quantization:       4-bit NF4 (QLoRA)  → saves ~10 GB vs fp16
LoRA rank:          r = 16
LoRA target layers: attention Q and V matrices
Trainable params:   ~20 million (of 7 billion = 0.28%)
Batch size:         2 per GPU
Gradient accum:     8 steps (effective batch = 16)
Precision:          bf16 for adapters, nf4 for base
Learning rate:      2e-4 with cosine decay
Gradient checkpointing: ON (trades compute for memory)

━━━━━━━━━━━━━━━━━━━━━━━
MEMORY BREAKDOWN:
━━━━━━━━━━━━━━━━━━━━━━━
Base model (4-bit):     ~4.2 GB
LoRA adapter weights:   ~0.08 GB
Gradients (adapters):   ~0.16 GB
Optimizer states:       ~0.32 GB
Activations (batch=2):  ~4–8 GB (varies by sequence length)
Overhead and buffers:   ~1–2 GB
━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  ~10–15 GB ✓ fits on 24 GB card!
━━━━━━━━━━━━━━━━━━━━━━━
```

Without any of these techniques, the same training job would require ~98 GB of VRAM — completely out of reach for a single consumer GPU. By combining QLoRA, small batch sizes, gradient accumulation, and mixed precision, you've made it entirely feasible.

---

## Assessment

### Q1: Why does LoRA fine-tuning use so much less gradient memory than full fine-tuning?

- [ ] Because LoRA uses a faster optimizer that needs less memory
- [ ] Because LoRA compresses all gradients before storing them
- [x] Because only the small adapter matrices (A and B) need gradients stored — the frozen base weights do not
- [ ] Because LoRA skips the backward pass entirely

### Q2: A company wants to fine-tune a 13B model. They have one GPU with 24 GB VRAM. Which approach gives them the best chance of success?

- [ ] Full fine-tuning with fp32 precision
- [ ] Full fine-tuning with fp16 precision
- [ ] LoRA fine-tuning with the base model in fp16
- [x] QLoRA fine-tuning with the base model in 4-bit and adapters in bf16

### Q3: You're fine-tuning with batch size 2 and gradient accumulation steps of 8. What is your effective batch size?

- [ ] 2
- [ ] 8
- [x] 16
- [ ] 10

### Q4: Which of the following statements about learning rates for LoRA fine-tuning is TRUE?

- [ ] LoRA requires a lower learning rate than full fine-tuning because the adapters are fragile
- [x] LoRA can use a relatively higher learning rate than full fine-tuning because the frozen base model acts as a stable anchor
- [ ] Learning rate doesn't matter for fine-tuning — only the rank of adapters matters
- [ ] Higher learning rates always lead to better fine-tuning results regardless of method

### Q5: During QLoRA, the 4-bit base model weights are used in what way?

- [ ] They are used directly in 4-bit arithmetic for all calculations
- [x] They are temporarily "dequantized" to 16-bit for computation, then the 16-bit values are discarded
- [ ] They are permanently converted to 16-bit once training begins
- [ ] They are only used during inference, not during training

### Q6: Why is small batch size often *better* for fine-tuning (compared to pre-training), even when VRAM is not a constraint?

- [ ] Small batches process data faster on modern GPUs
- [ ] Small batches always produce lower loss values
- [x] The noise in small-batch gradient estimates helps prevent overfitting when fine-tuning on a small dataset
- [ ] Small batches allow you to use a higher LoRA rank

---

## Exercise

### Exercise 1: Identifying the Memory Budget

You are planning to fine-tune an open-source model. Using the approximate memory estimates from this chapter, fill in the table below for your scenario:

- **Model:** A 13B parameter model
- **Method:** QLoRA (4-bit base model)
- **LoRA rank:** r = 16
- **Batch size:** 4
- **Sequence length:** 512 tokens

Estimate the memory needed for each component (you don't need to be exact — use the patterns from section 9.5 and 9.6 as your guide):

| Memory Component | Your Estimate (GB) |
|---|---|
| Base model (4-bit quantized) | ? |
| LoRA adapter weights | ? |
| Gradients (adapter only) | ? |
| Optimizer states | ? |
| Activations (rough estimate) | ? |
| **Total** | ? |

Then answer: Would this fit on a 24 GB GPU? If not, name **two** changes from this chapter you could make to reduce memory.

**Submission Type:** text

---

### Exercise 2: Gradient Accumulation Planning

You are fine-tuning a model for a legal document summarization task. Your documents are long — average 2,048 tokens per example. You want an effective batch size of 32 for training stability, but your GPU runs out of memory if you put more than 2 examples in a single forward pass.

1. Calculate how many gradient accumulation steps you need to reach an effective batch size of 32.
2. If each forward + backward pass takes 3 seconds, how long does one effective "update step" take?
3. Your fine-tuning run has 500 update steps. Estimate the total training time in minutes.
4. A colleague suggests "just use batch size 32 with no accumulation — it's simpler." What would you tell them about why that won't work, based on what you learned in this chapter?

**Submission Type:** text

---

### Exercise 3: Technique Selection for a Real Scenario

You work at a startup. Your company wants to fine-tune a 30B parameter language model to generate marketing copy in your brand's voice. Your budget allows you to rent one NVIDIA A100 80GB GPU for training.

Using what you know from this chapter:

1. Which fine-tuning approach would you recommend — full fine-tuning, LoRA, or QLoRA? Why?
2. From the memory table in section 9.6, does your chosen approach fit in 80 GB?
3. What learning rate range would you start with, and why?
4. If you discover after starting training that your loss is wildly unstable (jumping up and down), name **two** things from this chapter you could adjust to fix it.

**Submission Type:** text