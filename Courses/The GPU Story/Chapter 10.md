# Chapter 10: Inference & Deployment — Getting Your Model Into the Real World

## Learning Objectives

- Explain why inference uses significantly less GPU memory than training, and identify what memory is still required
- Describe how the KV cache eliminates redundant computation during text generation
- Understand how continuous batching allows a single GPU to serve thousands of users efficiently
- Compare GPTQ, AWQ, and GGUF as deployment quantization strategies and identify when to use each
- Explain how speculative decoding produces faster generation by combining a small "draft" model with a large "verifier" model

---

## Key Concepts

### 10.1 Recap: What We Know So Far

In Module 9, we learned how fine-tuning uses far less GPU memory than pre-training, because:

- We freeze most of the model's weights (no gradients needed for them)
- We only train tiny adapter layers using LoRA or QLoRA
- Gradient accumulation and mixed precision let us fit into smaller GPUs

Now we're moving to the next phase of a model's life: **deployment**. The model has been trained. It's ready. Now millions of people want to use it — at the same time, as fast as possible, as cheaply as possible.

This is inference. And it comes with its own set of tricks.

---

### 10.2 Inference vs. Training — Why Inference Needs Less GPU

"Inference" simply means using a trained model to make predictions. You give it an input (a question, an image, a document), and it produces an output (an answer, a caption, a summary).

Let's contrast inference with training to understand why inference is so much more memory-efficient.

Think of training as **learning to bake a cake from scratch**: you're doing messy, iterative experiments. You try a recipe, taste it, realize it needs more sugar, write a note, adjust, try again. You need all your ingredients, all your notes, all your previous attempts.

Inference is **baking a cake you already know by heart**: no notes, no experiments, no adjustments. Just execute.

Here's what that means in memory terms:

```
TRAINING — everything needed:
┌──────────────────────────────────────────────────────┐
│  Model weights (fp16/bf16)          ~14 GB (7B)      │
│  Gradients                          ~14-28 GB        │
│  Optimizer states (Adam)            ~28-56 GB        │
│  Activations (forward pass cache)   ~4-20 GB         │
│  Input batch                        ~1-4 GB          │
├──────────────────────────────────────────────────────┤
│  TOTAL:                             ~60-120 GB       │
└──────────────────────────────────────────────────────┘

INFERENCE — only essentials:
┌──────────────────────────────────────────────────────┐
│  Model weights (often quantized)    ~4-14 GB (7B)    │
│  Gradients                          NOT NEEDED ✗     │
│  Optimizer states                   NOT NEEDED ✗     │
│  Activations (much smaller)         ~0.5-4 GB        │
│  KV Cache (explained below)         ~1-8 GB          │
│  Input/output tokens                tiny             │
├──────────────────────────────────────────────────────┤
│  TOTAL:                             ~6-26 GB         │
└──────────────────────────────────────────────────────┘
```

Gradients and optimizer states — which together accounted for 3–6× the model's weight memory during training — simply don't exist during inference. There's nothing to learn, nothing to update.

The two memory costs unique to inference are:

1. **Activations**: Still needed for each forward pass, but much smaller because we process one request at a time (or small batches) instead of large training batches.
2. **KV Cache**: A new concept we'll explain in detail in section 10.4. It's a memory trade-off that makes text generation dramatically faster.

---

### 10.3 Batch Inference vs. Single Inference

Before we get to the KV cache, we need to understand a fundamental choice in how inference is run: **one at a time, or many at once?**

#### Single Inference

Imagine a restaurant where the chef makes each meal individually — takes an order, makes the dish, serves it, then takes the next order. Simple. Predictable. But the kitchen (GPU) is idle 80% of the time while the chef is taking orders and serving plates.

Single inference processes one request, waits for it to finish, then starts the next. This is:

- Simple to implement
- Good for latency (that one user gets their response fast)
- Terrible for **throughput** — how many requests you can serve per minute

#### Batch Inference

Now imagine the chef collects 16 orders at once, preps all the dishes simultaneously, then serves them together. The kitchen runs continuously. Much more efficient use of the GPU.

Batch inference groups multiple requests together and processes them in one forward pass. This is excellent for throughput.

```
SINGLE INFERENCE (sequential):
User A → [GPU busy] → response A
User B →               [GPU busy] → response B
User C →                             [GPU busy] → response C

GPU utilization: ████░░░░░░████░░░░░░████░░░░░░  ← lots of idle time

BATCH INFERENCE (16 users at once):
Users A-P → [GPU fully busy, processing 16 at once] → 16 responses

GPU utilization: ████████████████████████████████  ← near 100%
```

The tradeoff: batching makes the GPU more efficient, but **User A has to wait** until Users B through P are also ready — increasing latency for any individual.

**Memory implication of batching:**

Each user's request needs its own activation memory and (crucially) its own KV cache space. A batch of 16 requests needs 16× the per-request memory. This is why simply "make the batch bigger" hits a wall — you run out of VRAM.

This tension between throughput (batching) and latency (speed per user) is the central engineering challenge of LLM serving. The KV cache and continuous batching (sections 10.4 and 10.5) are the solutions the industry converged on.

---

### 10.4 KV Cache — The Memory Trick for Fast Text Generation

This is one of the most important concepts in LLM inference. Understanding it will make everything about how language models generate text click into place.

#### The Problem: Language Models Generate One Token at a Time

Language models don't produce entire responses in one shot. They generate text **one token at a time** (a token is roughly one word or word fragment). To generate each new token, the model re-reads everything that came before it.

Here's the painful inefficiency without any optimization:

```
Generating "The cat sat on the mat":

Step 1: Read ["The"] → predict "cat"
Step 2: Read ["The", "cat"] → predict "sat"
Step 3: Read ["The", "cat", "sat"] → predict "on"
Step 4: Read ["The", "cat", "sat", "on"] → predict "the"
Step 5: Read ["The", "cat", "sat", "on", "the"] → predict "mat"
```

At step 5, the model processes "The", "cat", "sat", "on", "the" all over again — even though it already computed everything about those tokens in steps 1–4. This is like a chef re-reading a recipe from the beginning every time they want to add the next ingredient.

#### The Solution: Cache the Intermediate Math

Inside the transformer architecture, at every layer, the model computes two things for each token: a **Key** (K) and a **Value** (V). Together they tell the model "here's information about this token and how it relates to others."

The insight: **these K and V computations don't change**. "The" always produces the same K and V whether we're at step 2 or step 500. There's no reason to recompute them.

The **KV cache** stores these computations. The first time a token is processed, its K and V are saved to VRAM. Every subsequent step retrieves them from cache instead of recomputing.

```
WITHOUT KV CACHE:
Step 1: Compute K,V for ["The"]                          → 1 computation
Step 2: Compute K,V for ["The","cat"]                    → 2 computations
Step 3: Compute K,V for ["The","cat","sat"]              → 3 computations
Step 4: Compute K,V for ["The","cat","sat","on"]         → 4 computations
Step 5: Compute K,V for ["The","cat","sat","on","the"]   → 5 computations
                                              TOTAL:     → 15 computations

WITH KV CACHE:
Step 1: Compute K,V for "The"    → cache it              = 1 computation
Step 2: Load cached "The", compute K,V for "cat"         = 1 computation
Step 3: Load cache, compute for "sat"                    = 1 computation
Step 4: Load cache, compute for "on"                     = 1 computation
Step 5: Load cache, compute for "the"                    = 1 computation
                                              TOTAL:     → 5 computations

Speed improvement: 3× faster (grows with sequence length!)
```

For long responses (hundreds or thousands of tokens), this speedup is massive. Responses that would take minutes to generate become near-instant.

#### The Cost: KV Cache Eats VRAM

Nothing is free. Storing all those K and V values requires memory — and it grows linearly with how many tokens you've generated so far.

```
KV CACHE MEMORY = num_layers × 2 (K and V) × num_heads × head_dim × sequence_length × precision

For a 7B model (32 layers, 32 heads, 128 head_dim, fp16):
Per token:  32 × 2 × 32 × 128 × 2 bytes ≈ 0.5 MB per token

For 2,048 token context:   ~1 GB of KV cache
For 8,192 token context:   ~4 GB of KV cache
For 32,768 token context:  ~16 GB of KV cache
```

For long-context models (128K token context windows), the KV cache can easily exceed the model weights themselves in VRAM usage. This is one of the primary engineering challenges in modern LLM deployment.

**KV cache memory grows with:**
- Longer conversations (more context to cache)
- More users being served simultaneously (each needs their own cache)
- Larger models (more layers and heads means more K,V per token)
- Higher precision (fp16 uses 2× memory vs int8)

This is why advanced inference engines use techniques like **paged attention** (borrowing an idea from operating systems) to manage KV cache memory efficiently, allocating it in chunks instead of reserving the maximum upfront.

---

### 10.5 Continuous Batching — Serving Multiple Users Efficiently

We established that batching (grouping users together) is great for GPU utilization. But traditional batching has a serious problem:

**Requests finish at different times.**

User A asks a short question: "What's 2+2?" — needs 3 tokens.
User B asks for a long essay about Roman history — needs 800 tokens.
User C asks for a code snippet — needs 150 tokens.

In a naive batch, the GPU can't start the next batch until every request in the current batch finishes. So User A's completed request just sits there waiting for User B's essay to finish before the GPU moves on. That's wasteful.

#### The Old Way: Static Batching

```
BATCH 1: [User A (3 tokens), User B (800 tokens), User C (150 tokens)]

Timeline:
User A finishes at step 3:  [DONE] ░░░░░░░░░░░░░░░░░░  ← waiting idle
User C finishes at step 150: [DONE DONE DONE...DONE] ░░  ← waiting idle
User B finishes at step 800: [busy busy busy...DONE]

GPU idle time: significant!
Batch 2 can't start until step 800.
```

#### The New Way: Continuous Batching

Continuous batching (also called "in-flight batching") solves this with a simple but powerful idea: **as soon as one request finishes, immediately slot in a new request from the queue.**

```
CONTINUOUS BATCHING:

Step 3:   User A finishes → immediately replace with User D
Step 150: User C finishes → immediately replace with User E
Step 800: User B finishes → immediately replace with User F

The GPU is processing requests continuously with no gaps.
Every "slot" in the batch is always occupied.
```

Think of it like a conveyor belt in a sushi restaurant. The belt keeps moving. Empty spots are immediately filled. You don't wait for everyone at the table to finish before the chef sends new plates.

**Why this matters for your system:**

| Approach | GPU Utilization | Users Served/Hour | Average Wait Time |
|---|---|---|---|
| Single inference | ~30–50% | Low | Low (no queue wait) |
| Static batching | ~60–80% | Medium | Medium |
| Continuous batching | ~90–99% | High | Low |

Continuous batching is the reason services like Claude, ChatGPT, and Gemini can handle millions of simultaneous users on a manageable number of GPUs. It's the core scheduling innovation that made large-scale LLM serving economically viable.

**The memory challenge of continuous batching:**

Each active request has its own KV cache growing in VRAM. Managing thousands of KV caches of different lengths, allocating and freeing memory as requests enter and exit — this is genuinely hard. It's why production inference engines like **vLLM** (discussed in section 10.6) use sophisticated memory management borrowed from operating system design.

---

### 10.6 vLLM, TensorRT-LLM, and TGI — Inference Engines Explained

You wouldn't run a formula one race with a Toyota Camry engine. Similarly, for production LLM serving, you don't just load a model and call `model.generate()`. You use a specialized **inference engine** — software purpose-built to serve LLMs as fast and efficiently as possible.

Think of an inference engine as the difference between a home kitchen and a professional restaurant kitchen. Same food, but the professional kitchen has industrial equipment, optimized workflows, and a team that knows exactly who does what.

#### vLLM — The Memory Efficiency Pioneer

**vLLM** (Virtual LLM) introduced **PagedAttention** — a technique that manages KV cache memory the same way operating systems manage RAM: in fixed-size pages, allocated on demand.

```
TRADITIONAL KV CACHE MANAGEMENT:
Request A: reserves 8,192 token slots upfront (even if it only uses 50)
Result: 8,142 wasted token slots sitting empty in VRAM
                     ↑ this waste accumulates across many requests

VLLM's PAGEDATTENTION:
Request A: reserves only the pages it actually needs, one at a time
Pages are small fixed blocks (e.g., 16 tokens each)
Result: near-zero wasted VRAM, 2–4× more requests served simultaneously
```

**Best for:** Production serving where you have many simultaneous users and unpredictable request lengths. The open-source go-to for most teams.

#### TensorRT-LLM — NVIDIA's Speed Specialist

**TensorRT-LLM** is NVIDIA's own inference engine, purpose-built to extract maximum performance from NVIDIA GPUs. It uses a process called **kernel fusion** — combining multiple GPU operations that would normally run sequentially into a single optimized operation.

Think of it like a cooking shortcut: instead of "heat pan, add oil, add garlic, add sauce" as four separate steps, TensorRT-LLM does "add everything to the pan that was already at the right temperature" in one step.

- Highest raw throughput on NVIDIA hardware
- More complex to set up (model must be "compiled" for your specific GPU)
- Not as flexible for different model architectures

**Best for:** Teams already committed to NVIDIA hardware who need maximum tokens per second and are willing to invest in the setup complexity.

#### TGI (Text Generation Inference) — HuggingFace's Serving Solution

**TGI** is built by HuggingFace — the company behind the most popular model-sharing platform. It integrates natively with HuggingFace's model library, making it trivial to deploy any model hosted there.

**Best for:** Teams already using HuggingFace's ecosystem, or those who prioritize ease of setup over ultimate performance.

**Quick comparison:**

| Engine | Best Strength | Setup Complexity | Hardware |
|---|---|---|---|
| vLLM | Memory efficiency, throughput | Medium | Any GPU |
| TensorRT-LLM | Maximum speed | High | NVIDIA only |
| TGI | Easy HuggingFace integration | Low | Any GPU |

For most teams starting out, vLLM is the pragmatic choice: excellent performance, open source, and runs on any NVIDIA GPU without special compilation steps.

---

### 10.7 Model Quantization for Deployment — GPTQ, AWQ, and GGUF

We've covered quantization in previous chapters — the idea of storing model weights in fewer bits (4-bit instead of 16-bit) to save memory and speed up computation. For deployment specifically, three formats have become the industry standards. Each takes a different approach to the central problem: **when you round a weight to 4 bits, you lose precision. How do you minimize the damage?**

#### The Core Problem: Not All Weights Are Equal

Before explaining each method, understand the insight they all share: in a trained model, some weights matter enormously for the model's behavior, and others barely matter at all.

Imagine a recipe with 50 ingredients. Most are standard (flour, water, sugar — tiny variations don't matter much). But a few are critical (a specific aged cheese, a particular spice blend — even small variations destroy the dish). Quantization is like rounding all ingredient amounts to the nearest tablespoon. You want to round the critical ingredients as carefully as possible.

#### GPTQ — Finding the Best 4-Bit Representation

**GPTQ** (Generalized Post-Training Quantization) works by asking: "Given that I must represent each weight in 4 bits, what 4-bit value causes the *least overall error* in the model's output?"

It does this by running calibration data (a small sample of text) through the model and observing how quantization errors interact. When rounding one weight causes too much error, GPTQ compensates by slightly adjusting neighboring weights.

```
GPTQ PROCESS:
┌─────────────────────────────────────────────┐
│ 1. Take trained fp16 model                  │
│ 2. Run calibration data (small text sample) │
│ 3. For each weight:                         │
│    a. Round to 4-bit                        │
│    b. Measure output error                  │
│    c. Adjust neighboring weights to         │
│       compensate for that error             │
│ 4. Result: 4-bit model that behaves much    │
│    more like the original than naive        │
│    rounding would                           │
└─────────────────────────────────────────────┘
```

**Characteristic:** GPTQ quantizes layer by layer and is designed to run on GPU. It's relatively fast to create and runs efficiently at inference time.

**Best for:** GPU-based deployment where you want good quality 4-bit inference.

#### AWQ — Protecting the Important Weights

**AWQ** (Activation-aware Weight Quantization) attacks the problem differently. It identifies which weights have the biggest impact on the model's behavior — the "critical ingredients" — and protects them during quantization.

How does it identify important weights? By looking at **activations** — the intermediate values produced during a forward pass. Weights that consistently produce large activation values have outsized influence on the model's behavior. AWQ scales these "salient" weight channels before quantization to preserve more precision for them.

```
AWQ SALIENT WEIGHT PROTECTION:

Regular weights:    [0.23] [0.51] [0.09] [0.87] [0.14]
                       ↓ quantize all equally
4-bit result:       [0.25] [0.50] [0.00] [0.75] [0.25]  ← errors everywhere

AWQ identifies salient channels (e.g., channel 4 is high-impact):
Scale up before quantize: [0.23] [0.51] [0.09] [8.70] [0.14]
                                                  ↑
                              multiplied by 10, so rounding hurts less
4-bit result:        [0.25] [0.50] [0.00] [8.75] [0.25]
                                           ↑
Scale back down after:                  [0.875] ← much closer to 0.87!
```

By temporarily "amplifying" important weights before quantization and "shrinking" them back after, AWQ preserves more of the model's original behavior in critical areas.

**Best for:** GPU deployment where quality is paramount. AWQ often produces slightly higher quality output than GPTQ at the same bit-width.

#### GGUF — The "Run Anywhere" Format

**GGUF** (GPT-Generated Unified Format) takes a completely different design philosophy. Rather than optimizing for GPU throughput, it's designed to run efficiently on **CPUs and Apple Silicon** — making it the format for users without powerful NVIDIA GPUs.

The key innovation: GGUF supports **mixed quantization**. Different layers of the model can use different bit widths. The most sensitive layers (which tend to be near the input and output of the model) get more bits; the bulk of the middle layers use fewer bits.

```
GGUF MIXED QUANTIZATION EXAMPLE (Q4_K_M):

Layer 1 (embedding):       8-bit  ← sensitive, keep more precision
Layers 2-30 (middle):      4-bit  ← bulk of model, compressed aggressively
Layer 31 (output):         6-bit  ← important for final token prediction

Result: overall compression similar to pure 4-bit, but better quality
        because sensitive layers are protected
```

GGUF models run via **llama.cpp** — an open-source engine that can run entirely on CPU, or split computation across CPU and whatever GPU you have.

**Best for:** Running models locally on a laptop or desktop without a powerful GPU. The format that democratized local LLM inference.

**Comparison table for deployment quantization:**

| Format | Primary Hardware | Quantization Strategy | Relative Quality | Relative Speed |
|---|---|---|---|---|
| GPTQ | NVIDIA GPU | Layer-by-layer, error compensation | Good | Fast |
| AWQ | NVIDIA GPU | Salient weight protection | Better | Fast |
| GGUF | CPU / Apple Silicon / any | Mixed bit-width per layer | Good | Medium |
| FP16 (no quant) | GPU (high VRAM) | None | Best | Fast |

---

### 10.8 Speculative Decoding — Using a Small Model to Help a Big Model

We've saved the most clever idea for last. Speculative decoding is an insight so elegant that it feels like cheating — and it can make large model inference roughly **2–3× faster** with no reduction in output quality.

#### The Problem: Large Models Are Slow Token by Token

Even with KV cache, generating tokens from a 70B model is slow. Each token requires passing data through 80+ transformer layers with billions of parameters. You're waiting for a very large, very thorough brain to work through each word.

What if there were a way to make the big model process multiple tokens at once?

There is.

#### The Draft-Then-Verify Strategy

Speculative decoding works in two phases, using two models:

1. **The draft model** (small, fast — maybe 7B parameters): Quickly guesses the next several tokens.
2. **The target model** (large, accurate — maybe 70B parameters): Checks all the guesses in parallel and either accepts or rejects them.

The key physics: the big model can **verify multiple tokens in parallel** much faster than it can **generate** those same tokens one by one.

Here's why: generation requires a sequential chain (each token depends on the previous one). Verification can be done in a single forward pass where all the "guesses" are processed simultaneously — similar to how the model processes a prompt at the start of a conversation.

```
NORMAL GENERATION (70B model):
Token 1: [70B model works hard] → "The"
Token 2: [70B model works hard] → "weather"
Token 3: [70B model works hard] → "today"
Token 4: [70B model works hard] → "is"
Token 5: [70B model works hard] → "sunny"
Time: 5 × (time for 1 token) = 5 units

SPECULATIVE DECODING:
Draft (7B, fast):  Guesses quickly → "The" "weather" "today" "is" "cloudy"
                                                               ↑
                                                         wrong guess!

Target (70B):      Verifies all 5 guesses in ONE forward pass
                   ✓ "The" ✓ "weather" ✓ "today" ✓ "is" ✗ "cloudy" → "sunny"

Result: 4 tokens accepted (for the cost of 1 verification step) + 1 correction
Time: (fast draft) + (1 verification step) ≈ 1.5 units

Speed improvement: ~3× faster!
```

The output is identical to what the large model would have generated alone — because every accepted token was verified by the target model. If the draft model guesses wrong, the target model catches it and provides the correct token.

#### Why Does the Target Model Verify Faster Than It Generates?

This is the subtle part. Think of it like proofreading vs. writing:

- **Writing** from scratch requires generating each word, waiting for that decision to be made, then choosing the next word. Sequential.
- **Proofreading** a draft document processes the whole thing at once. You scan all the words in parallel. Much faster.

Transformers are the same way. Processing a sequence of tokens (the draft) can be parallelized. Generating them one-by-one cannot.

#### When Does Speculative Decoding Work Best?

The key is **acceptance rate** — what fraction of the draft model's guesses the target model accepts. If the draft model is terrible at predicting what the target model would say, it gets rejected constantly and you gain nothing.

```
High acceptance rate (good conditions):
Draft: "The weather today is sunny"
Target accepts: ✓ ✓ ✓ ✓ ✓ → 5 tokens in ~1.5x the time of 1
Speedup: ~3×

Low acceptance rate (bad conditions):
Draft: "The atmosphere presently exhibits..."
Target accepts: ✓ ✗ → only 1 token accepted, draft was wasted
Speedup: ~0.8× (actually slower!)
```

**Conditions that favor speculative decoding:**

- The draft model and target model were trained on similar data
- The text being generated is predictable / formulaic (code, structured output)
- The draft model is well-chosen — often a smaller version of the same model family (e.g., Llama 3 8B drafting for Llama 3 70B)

**Memory cost:** You need to load both models into VRAM simultaneously. A 7B draft model adds ~14 GB of VRAM overhead. This is the primary reason speculative decoding isn't universally deployed everywhere.

---

### 10.9 Putting It All Together — The Stack That Serves a Real LLM

Here's how all these pieces fit together in a production LLM serving system:

```
USER REQUEST
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                   LOAD BALANCER                      │
│  Distributes requests across multiple GPU servers    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              INFERENCE ENGINE (e.g., vLLM)           │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │          CONTINUOUS BATCHING SCHEDULER       │    │
│  │  Manages request queue, slots new requests  │    │
│  │  as others complete                         │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           KV CACHE MANAGER (PagedAttention) │    │
│  │  Allocates/frees memory pages per request   │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │         QUANTIZED MODEL (AWQ/GPTQ 4-bit)    │    │
│  │  [optional] + speculative decoding draft    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
              RESPONSE TOKENS
         (streamed back to user)
```

Each layer solves a specific problem:

| Problem | Solution |
|---|---|
| Model too large for GPU | Quantization (GPTQ/AWQ/GGUF) |
| Recomputing past tokens is slow | KV Cache |
| GPU idle between requests | Continuous Batching |
| KV cache wastes memory on long requests | PagedAttention (vLLM) |
| Each token is slow to generate | Speculative Decoding |

No single technique solves everything. Production LLM serving is the combination of all of them working in concert — which is why specialized inference engines exist rather than just using the raw model.

---

## Assessment

### Q1: A friend says "inference is basically the same as training, just without the learning." What is wrong with this statement?

- [ ] It's correct — inference and training use identical amounts of GPU memory
- [ ] It's wrong because inference actually uses *more* memory than training
- [x] It's wrong because inference eliminates gradients and optimizer states, which are the largest memory consumers in training
- [ ] It's wrong because inference requires a different model architecture than training

### Q2: You're generating a 500-token response. Without KV cache, the model would compute key-value pairs for every previous token at every step. Approximately how many total KV computations does this require?

- [ ] 500
- [ ] 1,000
- [x] 125,250 (the sum 1+2+3...+500)
- [ ] 500,000

### Q3: A startup is serving an LLM to 10,000 users per day. Requests vary widely — some are 10 tokens, others are 2,000 tokens. Which batching strategy would you recommend?

- [ ] Single inference — simplest to implement
- [ ] Static batching with batch size 64 — processes many users at once
- [x] Continuous batching — immediately fills slots as requests finish, handles variable-length requests efficiently
- [ ] No batching is needed — GPUs handle concurrent users automatically

### Q4: You want to run a 13B model on a MacBook Pro with Apple Silicon (no NVIDIA GPU). Which quantization format is most appropriate?

- [ ] GPTQ — optimized for fast GPU quantization
- [ ] AWQ — best quality on NVIDIA hardware
- [x] GGUF — designed for CPU and Apple Silicon inference
- [ ] FP16 — highest quality, works on any hardware

### Q5: Speculative decoding requires loading two models into VRAM simultaneously. Despite this overhead, when does it provide a net speedup?

- [ ] Always — a small draft model always speeds things up
- [ ] Never — the two-model overhead always cancels out the speed benefit
- [x] When the draft model's acceptance rate is high enough that many tokens are verified per forward pass, outweighing the memory overhead cost
- [ ] Only when the target model is smaller than 7B parameters

### Q6: AWQ (Activation-aware Weight Quantization) differs from naive 4-bit quantization primarily because:

- [ ] AWQ uses 8-bit instead of 4-bit for all weights
- [ ] AWQ skips quantizing the largest weight matrices entirely
- [x] AWQ identifies weights with high influence on model outputs and preserves their precision during quantization by temporarily scaling them
- [ ] AWQ requires re-training the model from scratch in 4-bit precision

---

## Exercise

### Exercise 1: KV Cache Memory Budgeting

You are deploying a 13B parameter model with the following specs:
- 40 transformer layers
- 40 attention heads
- Head dimension: 128
- Precision: fp16 (2 bytes per value)

Use the formula from section 10.4:
`KV Cache per token = num_layers × 2 × num_heads × head_dim × bytes_per_value`

Answer these questions:

1. How many bytes does one token's KV cache require?
2. How many MB does a full 4,096-token conversation require?
3. You want to serve 50 simultaneous users, each with up to 4,096 tokens of context. How many GB of VRAM must you reserve just for KV cache?
4. Your GPU has 80 GB total VRAM. The 13B model in 4-bit quantization takes ~8 GB. After reserving KV cache for 50 users at 4,096 tokens, how much VRAM is left for activations and other overhead?
5. A product manager asks: "Can we increase the maximum context from 4,096 to 16,384 tokens?" What would you tell them about the memory tradeoff?

**Submission Type:** text

---

### Exercise 2: Choosing a Deployment Strategy

Your company is building three different products. For each one, recommend a deployment approach from the options covered in this chapter, and justify your choice.

**Product A: An internal code review assistant**
- Users: 50 software engineers
- Typical request: paste a code file (~1,500 tokens), get feedback (~500 tokens)
- Hardware budget: Two NVIDIA A100 80GB GPUs
- Priority: Quality of output over speed

**Product B: A customer-facing chatbot for an e-commerce site**
- Users: Potentially thousands of simultaneous sessions
- Typical request: Short questions, short answers (50–200 tokens each)
- Hardware budget: Limited — 2 NVIDIA A10 24GB GPUs
- Priority: Serving many users simultaneously, low cost

**Product C: A personal research assistant for a PhD student**
- Users: 1 person
- Hardware: MacBook Pro M2 with 32GB unified memory, no NVIDIA GPU
- Priority: Running entirely locally, privacy (no cloud)

For each product, specify:
- Which model quantization format (GPTQ, AWQ, GGUF, or FP16)?
- Continuous batching or single inference?
- Speculative decoding: yes or no, and why?

**Submission Type:** text

---

### Exercise 3: Speculative Decoding Analysis

A team is evaluating speculative decoding for their legal document generation system. They test two draft model candidates:

**Draft Model X:** 7B parameters, same model family as the 70B target
- Average acceptance rate: 78% of draft tokens accepted
- Draft generation speed: 8 tokens per second
- Target verification speed: 3 steps per second (each step verifies up to 5 tokens)

**Draft Model Y:** 3B parameters, different model family
- Average acceptance rate: 41% of draft tokens accepted
- Draft generation speed: 15 tokens per second
- Target verification speed: 3 steps per second

Without speculative decoding, the 70B target alone generates 2 tokens per second.

1. For Draft Model X: if 5 tokens are drafted and 78% are accepted on average, roughly how many tokens are accepted per verification step?
2. Estimate the effective tokens-per-second throughput for each draft model.
3. Which draft model would you recommend, and why?
4. The team notices speculative decoding works much better on their "contract clause generation" task (boilerplate, formulaic) than on their "legal strategy brainstorming" task (creative, varied). Using concepts from section 10.8, explain why this pattern makes sense.

**Submission Type:** text