# Chapter 4: Why Computers Can't Store 0.1 — Floating Point Numbers Explained

## Learning Objectives

- Understand why computers represent numbers imprecisely, and why that imprecision is usually harmless
- Explain the difference between integers and floating point numbers using real-world analogies
- Describe what "bits" are doing inside a floating point number (sign, exponent, mantissa)
- Identify the trade-off between range and precision in FP16, FP32, and FP64
- Explain how FP16 "rounds" numbers, what information gets lost, and why it often doesn't matter for AI training

---

## Key Concepts

### 4.1 Recap

In Module 3, we explored how GPUs split work across thousands of cores and shuffle data between memory layers at incredible speeds. We learned that **VRAM** is the GPU's desk — fast but limited — and that managing what sits on that desk is half the battle in training large models.

But here's a question we've been quietly avoiding: *what exactly is stored on that desk?*

When you train a neural network, you're storing billions of numbers — weights, gradients, activations. The format those numbers are stored in turns out to matter enormously. A single design decision about number format can:

- **Cut your memory usage in half** (or in quarters)
- **Double your training speed**
- Or — if done carelessly — **completely break your training**

This chapter explains *why* those trade-offs exist, starting from the very bottom: what is a number, to a computer?

---

### 4.2 How Computers Actually Count

You grew up learning to count in **base 10** — ten digits (0 through 9), and when you run out, you add a new column to the left. So after 9 comes 10, after 99 comes 100, and so on.

Computers count in **base 2**, called **binary**. They only have two digits: 0 and 1. When a computer runs out, it adds a new column too — but it runs out *much faster*.

| Base 10 (you) | Base 2 (computer) |
|---------------|-------------------|
| 0             | 0                 |
| 1             | 1                 |
| 2             | 10                |
| 3             | 11                |
| 4             | 100               |
| 5             | 101               |
| 8             | 1000              |


Why binary? Because computers are made of tiny electronic switches — billions of them — that are either *on* (1) or *off* (0). That's it. The entire digital world — every photo, video, song, AI model — is ultimately just a very, very long string of ones and zeroes.

This is fine for whole numbers. The problem begins when we need fractions.

---

### 4.3 The Ruler Problem: Why 0.1 Doesn't Exist in Binary

Imagine you have a ruler. But this ruler can *only* measure in halves, quarters, eighths, and sixteenths — no other fractions allowed.

You're asked to measure exactly one-tenth of an inch (0.1 inches). You look at your ruler. There's no mark for that. The closest you can get is something like:

```
0.0625 + 0.03125 + ... ≈ 0.09999...
```

You can get *close*, but you'll never land exactly on 0.1, no matter how many tiny subdivisions you add.

**Computers have exactly this problem.** In binary, you can represent halves (1/2), quarters (1/4), eighths (1/8), sixteenths (1/16), and so on — but 1/10 cannot be written as any exact combination of these. It goes on forever, like 1/3 goes on forever in base 10 (0.3333...).

So when you type `0.1` into a computer, it quietly stores the closest binary approximation it can fit. The error is microscopic — around 0.000000000000000055511 — but it's there.

> **Try this in Python (if you're curious):**
> ```python
> print(0.1 + 0.2)
> # Outputs: 0.30000000000000004
> ```
> This isn't a bug. It's how floating point arithmetic works on every computer ever made.

For most applications — bank balances, game scores, image pixels — this microscopic error is completely harmless. But in AI training, where billions of tiny errors accumulate across billions of calculations? It can become a real problem. We'll come back to this.

---

### 4.4 What Is a "Floating Point" Number?

The name **floating point** comes from how computers handle the decimal point — they let it *float* to wherever it needs to be.

Think of it like scientific notation. In school, you might have learned to write large numbers like:

```
300,000,000  →  3.0 × 10⁸
```

And small numbers like:

```
0.000000001  →  1.0 × 10⁻⁹
```

The key insight: you separate **magnitude** (how big) from **detail** (what the digits are). Floating point does exactly this — but in binary.

Every floating point number is stored as three pieces:

```
┌────────────────────────────────────────────────────────┐
│                 FLOATING POINT NUMBER                  │
│                                                        │
│   ┌───────┐   ┌──────────────┐   ┌─────────────────┐  │
│   │ SIGN  │   │   EXPONENT   │   │    MANTISSA     │  │
│   │ 1 bit │   │  (how big?)  │   │  (what digits?) │  │
│   │ + or -│   │              │   │                 │  │
│   └───────┘   └──────────────┘   └─────────────────┘  │
│                                                        │
│   Like:  -    ×    10⁸    ×    3.14159...             │
└────────────────────────────────────────────────────────┘
```

Let's break each piece down with a food analogy:

Imagine you're ordering pizza and you have to describe *how much pizza* you ate using only these three pieces of information:

- **Sign** — Did you eat pizza (positive) or *return* pizza (negative)? One bit: yes or no.
- **Exponent** — The *scale*. Are we talking about slices? Whole pies? Truckloads? This sets the magnitude.
- **Mantissa** — The *detail*. Exactly how many (3.7 slices? 2.14 pies?). This is where the actual digits live.

The exponent buys you **range** — the ability to represent both incredibly tiny and enormously large numbers. The mantissa buys you **precision** — the ability to distinguish 3.7 from 3.70001.

Here's the cruel trade-off: **you have a fixed number of bits total**. Every bit you give to the exponent is a bit stolen from the mantissa. More range = less precision. More precision = less range. You can't have both.

---

### 4.5 The Three Formats: FP64, FP32, and FP16

This trade-off plays out differently depending on *how many bits* you use for the whole number. The three formats you'll encounter in AI are:

| Format | Total Bits | Sign | Exponent | Mantissa | Nicknames        |
|--------|-----------|------|----------|----------|------------------|
| FP64   | 64 bits   | 1    | 11 bits  | 52 bits  | double precision |
| FP32   | 32 bits   | 1    | 8 bits   | 23 bits  | single precision |
| FP16   | 16 bits   | 1    | 5 bits   | 10 bits  | half precision   |

Let's make this concrete with a factory analogy:

Imagine each format is a **different size notepad** that a worker uses to write down measurements.

- **FP64 (64-bit)** is a huge notepad with 52 lines for detail. You can write numbers like `3.14159265358979323846...` with extraordinary precision. Scientific simulations love this. AI training used to use this — but it's expensive.

- **FP32 (32-bit)** is a standard notepad — 23 lines of detail. This was the default for AI training for years. Precise enough that errors don't accumulate badly, and half the size of FP64.

- **FP16 (16-bit)** is a tiny sticky note — only 10 lines of detail. It's fast, light, and fits twice as many numbers in the same memory. But it has real limitations.

---

### 4.6 How FP16 "Rounds" Numbers — And What Gets Lost

Here's where things get interesting for AI training.

FP16 can only store numbers in a certain range: roughly **−65,504 to +65,504**. Beyond that, it can't represent the number at all — it either rounds it to zero (if too small) or to infinity (if too large).

The precision gap is also dramatic. Let's look at what FP16 and FP32 can actually distinguish:

```
FP32 can tell apart:  1.0000001  vs  1.0000002
FP16 can tell apart:  1.001      vs  1.002
```

FP16 loses roughly the last 7 decimal places of detail that FP32 can see.

**The rounding in pictures:**

```
FP32 (fine ruler):
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
0                                            1.0
Every tiny tick is a number FP32 can store.

FP16 (coarse ruler):
|--------|--------|--------|--------|--------|
0                                           1.0
Fewer ticks — numbers must snap to the nearest one.
```

When a number falls *between* two FP16 ticks, it gets rounded to the nearest one. That's the lost information.

**Why does this often not matter?**

Here's the surprising part: most of the time, this rounding is completely fine for neural network training. Why? Because:

1. **Neural networks are redundant.** A model with billions of parameters can afford for any individual weight to be slightly off. The overall pattern — the thing the model has "learned" — survives minor rounding.

2. **Training is iterative.** You're not computing one precise answer — you're repeatedly nudging millions of numbers in roughly the right direction. A slightly imprecise nudge, applied millions of times, still gets you there.

3. **Noise can even help.** Some researchers argue that the small random rounding errors in FP16 act like a mild regularizer — preventing the model from memorizing too precisely.

Think of it like navigating by compass vs. GPS. FP32 is GPS — extremely precise. FP16 is a compass — less precise, but if you're walking in roughly the right direction, you'll still reach the mountain.


---

### 4.7 The Memory Math: Why This Matters Enormously

Let's do the arithmetic directly.

A model weight stored in FP32 takes **4 bytes** of VRAM. The same weight in FP16 takes **2 bytes**.

For GPT-2 (a small model by today's standards) with 1.5 billion parameters:

| Format | Bytes per weight | Total VRAM for weights |
|--------|-----------------|------------------------|
| FP32   | 4 bytes          | ~6 GB                  |
| FP16   | 2 bytes          | ~3 GB                  |
| INT8   | 1 byte           | ~1.5 GB                |
| INT4   | 0.5 bytes        | ~0.75 GB               |

Now scale to a modern model like LLaMA-3 70B (70 billion parameters):

| Format | Total VRAM for weights |
|--------|------------------------|
| FP32   | ~280 GB                |
| FP16   | ~140 GB                |
| INT8   | ~70 GB                 |
| INT4   | ~35 GB                 |

An NVIDIA H100 has 80 GB of VRAM. In FP32, LLaMA-3 70B doesn't *fit* on four H100s. In INT4, it fits on one. This is why number format is not an abstract mathematical curiosity — **it determines what you can even run**.

---

### 4.8 The Exponent Bit Story: Why BF16 Was Invented

Recall the structure of FP16:

```
FP16:  1 sign | 5 exponent | 10 mantissa
```

That 5-bit exponent gives FP16 its range of about ±65,504. Sounds like a lot — but in AI training, individual numbers (especially **gradients**, the signals that tell the model how to update itself) can get very large or very small, exceeding FP16's range entirely.

When a gradient exceeds FP16's maximum value, the hardware writes `Inf` — infinity. When it's too small, it becomes zero. Both are catastrophic: `Inf` turns into `NaN` (Not a Number) during subsequent math, and zero means the model stops learning from that signal entirely. Training crashes.

Google engineers at Google Brain ran into this problem repeatedly while training large models. Their solution, designed in 2018 and released publicly around 2019, was **BFloat16** (BF16) — where the "B" stands for "Brain."

The fix was elegant. They took FP32 and simply **chopped off the last 16 bits**:

```
FP32:  1 sign | 8 exponent | 23 mantissa   (32 bits total)
              ↓ chop here
BF16:  1 sign | 8 exponent | 7 mantissa    (16 bits total)
```

Compare that to FP16:

```
FP16:  1 sign | 5 exponent | 10 mantissa   (16 bits total)
BF16:  1 sign | 8 exponent | 7 mantissa    (16 bits total)
```

Both are 16 bits. But BF16 gave 3 of FP16's exponent bits *back* to the exponent column (going from 5 to 8 bits). Those 3 bits came from the mantissa (dropping from 10 to 7 mantissa bits).

The trade-off:

| Property        | FP16         | BF16              |
|-----------------|--------------|-------------------|
| Max value       | ~65,504      | ~3.4 × 10³⁸      |
| Range           | Narrow       | Same as FP32      |
| Precision       | Higher       | Lower             |
| Good for        | Inference    | Training          |
| Risk            | Overflow/Inf | Less precise math |

BF16's range is identical to FP32's — because it uses the exact same exponent structure. A gradient can grow as large or as small as FP32 would allow, and BF16 won't overflow. You just lose some precision in the mantissa — but as we discussed, neural networks can tolerate that.

**The analogy:** FP16 is a precise but small measuring cup — great for careful baking, but it overflows if you pour too much in. BF16 is a big pot that can hold anything FP32 can hold, but the measuring lines are a bit rougher. For training neural networks, the big pot is usually the better tool.

This is why BF16 became the default precision on modern AI hardware — including Google's TPUs and NVIDIA's A100/H100 GPUs.

---

### 4.9 Putting It All Together: The Format Decision Tree

When you're running AI workloads, the choice of number format comes down to a few key questions:

```
Are you training or running inference?
        │
        ├── Training
        │       │
        │       ├── Do you have modern hardware (A100, H100, TPU)?
        │       │           → Use BF16 (safe range, good speed)
        │       │
        │       └── Older hardware without BF16 support?
        │                   → Use FP16 with loss scaling 
        │
        └── Inference (just running the model, not training)
                │
                ├── Need maximum accuracy?
                │           → FP16 or BF16
                │
                └── Need to squeeze onto smaller hardware?
                            → INT8 or INT4 (quantization — Chapter 20)
```

The theme across all these decisions: **you're always trading precision for speed and memory**. The art is in making that trade intelligently — getting the most capability out of hardware while keeping the model's quality acceptable.

---

## Assessment

### Q1: Why can't a computer store the number 0.1 exactly?

- [ ] Because 0.1 is an irrational number, like pi
- [ ] Because computers can only store numbers up to a certain size
- [x] Because 0.1 cannot be written as an exact combination of binary fractions (halves, quarters, eighths, etc.)
- [ ] Because the engineers who designed computers made a mistake that was never fixed

### Q2: In a floating point number, what does the "exponent" control?

- [ ] Whether the number is positive or negative
- [ ] How many digits the number has after the decimal point
- [x] The scale or magnitude — how big or small the number is overall
- [ ] The speed at which the GPU can process the number

### Q3: A researcher switches from FP32 to FP16 for training a model. What is the most likely benefit?

- [x] The model uses half as much VRAM and can train faster on the same hardware
- [ ] The model becomes more accurate because smaller numbers are more precise
- [ ] The model can represent larger numbers without risk of overflow
- [ ] Training time doubles because the GPU works harder to compensate

### Q4: Why did Google invent BFloat16 (BF16) instead of just using FP16?

- [ ] FP16 was too slow on Google's hardware
- [ ] BF16 takes up less memory than FP16
- [x] FP16's exponent is too small, causing gradients to overflow during training, while BF16 uses the same exponent as FP32
- [ ] BF16 is more precise than FP16 in all circumstances

### Q5: You are training a large language model and notice that after a few hours, the training loss suddenly becomes "NaN" (Not a Number) and never recovers. Based on this chapter, what is a likely cause?

- [ ] The learning rate is set too low
- [ ] The model has too many parameters for the dataset
- [x] A gradient value exceeded the maximum representable value in FP16, producing an overflow (Inf), which then propagated as NaN through subsequent calculations
- [ ] The GPU ran out of power and throttled itself

### Q6: A model has 7 billion parameters. How much VRAM do the weights alone require in FP16?

- [ ] 7 GB
- [x] 14 GB
- [ ] 28 GB
- [ ] 3.5 GB

### Q7: Which statement best describes why FP16 rounding "often doesn't matter" in neural network training?

- [ ] The GPU automatically corrects rounding errors before they accumulate
- [ ] FP16 is actually more precise than FP32 for numbers between 0 and 1
- [x] Neural networks are redundant — individual weight imprecision doesn't destroy the overall learned pattern, and iterative updates still converge
- [ ] Modern models are trained on so much data that precision stops mattering entirely

---

## Exercise

### Exercise 1: The Format Detective

Open the calculator app on your phone or computer. Try the following calculation:

```
0.1 + 0.2
```

Write down exactly what result you get. Then try:

```
0.1 + 0.2 + 0.3 + 0.4
```

And:

```
1.0 - 0.9
```

For each result, note whether it came out exactly as you'd expect, or whether there's a tiny unexpected decimal. Write 2–3 sentences explaining *why* you think these results look the way they do, using what you've learned in this chapter.

**Submission Type:** text

---

### Exercise 2: The Memory Budget Planner

You are a machine learning engineer with exactly **40 GB of VRAM** available on your GPU server. A client wants to run the following models. For each one, calculate whether it fits in your available VRAM at the given precision format, and if it doesn't, suggest which format *would* make it fit.

Use: **bytes needed = parameters × bytes per weight**

| Format       | Bytes per weight |
|--------------|-----------------|
| FP32         | 4 bytes          |
| FP16 / BF16  | 2 bytes          |
| INT8         | 1 byte           |
| INT4         | 0.5 bytes        |

**Models:**

1. **Model A:** 13 billion parameters, requested in FP32. Does it fit? If not, what's the smallest format that makes it fit?
2. **Model B:** 7 billion parameters, requested in BF16. Does it fit? What format would cut the usage roughly in half again?
3. **Model C:** 70 billion parameters, requested in INT4. Does it fit? How much headroom is left?

Write your calculations step by step, and explain your format recommendations in plain English — as if you're writing an email to a client who doesn't know what FP16 means.

**Submission Type:** text

---

### Exercise 3: BF16 vs FP16 — The Right Tool for the Job

Consider two different scenarios:

**Scenario A:** You are *deploying* a finished model — meaning users are sending it questions and it's producing answers. No training is happening. Speed and efficiency matter. The inputs and outputs are well-behaved numbers (no extreme gradients).

**Scenario B:** You are *training* a new model from scratch on a large dataset. Gradients can spike unexpectedly during early training. You're on an NVIDIA A100.

For each scenario, choose between FP16 and BF16 and write 3–5 sentences explaining your reasoning. Make sure to reference the specific property of each format (range vs. precision) that drives your decision.

**Submission Type:** text

---

### Exercise 4: Explain Like I'm Ten

Your younger sibling asks: *"Why does the computer say 0.1 + 0.2 = 0.30000000000000004? Is it broken?"*

Write a 5–8 sentence explanation that:
- Does NOT use the words "binary," "bit," "exponent," or "mantissa"
- Uses a physical analogy (ruler, measuring cup, clock, tiles — your choice)
- Ends by reassuring them that this is normal and expected, not a malfunction

**Submission Type:** text