# Chapter 4: Encoder-Decoder Architecture

---

## 4.1 Architecture Deep Dive

The encoder-decoder architecture is the most natural design for translation. The task itself has two distinct phases — understanding the source, then expressing it in another language — and the architecture mirrors this directly. The encoder handles understanding; the decoder handles generation.

### The Encoder

The encoder receives the source sentence as a sequence of tokens and processes them into a rich set of contextual representations. It is built from stacked Transformer layers, each containing multi-head self-attention and a feed-forward network (as described in Chapter 3).

The defining characteristic of the encoder is **bidirectional attention** — every token can attend to every other token in the source, both left and right. There is no masking of future tokens. When building the representation of the word "bank" in "river bank," the encoder can simultaneously look at "river" (to the left) and whatever follows (to the right) to resolve the meaning.

After passing through all encoder layers, each source token has a representation that reflects not just its own meaning but its meaning in the full context of the sentence. These representations — one vector per source token — form the **encoder output**, which the decoder will consult throughout generation.

```
Source tokens: [The] [river] [bank] [was] [flooded]
                  ↓       ↓      ↓      ↓       ↓
             [Encoder Layer 1]
             [Encoder Layer 2]
                  ...
             [Encoder Layer N]
                  ↓       ↓      ↓      ↓       ↓
             Contextual representations (one per token)
```

### The Decoder

The decoder generates the target translation one token at a time. At each step, it takes three inputs:
1. The tokens it has already generated (its own partial output)
2. The full encoder output (the source representations)
3. Its position in the sequence

The decoder is built from stacked layers too, but each layer contains **three** sub-components instead of two:

**Masked Self-Attention**
The decoder attends over its own previously generated tokens. The "masked" part is critical — when generating token at position 5, the decoder must not see positions 6, 7, 8... (those haven't been generated yet). A causal mask enforces this by setting future attention scores to negative infinity before the softmax, making them effectively zero.

**Cross-Attention**
After the masked self-attention, the decoder runs a second attention operation — but this time, the Queries come from the decoder's current state, while the Keys and Values come from the encoder output. This is the mechanism that connects source and target. At each generation step, the decoder asks: *"Given what I've generated so far, which parts of the source are most relevant to what I should generate next?"*

**Feed-Forward Network**
The same position-wise FFN as in the encoder, applied after the cross-attention.

```
Decoder at step t:
  Partial output [y_1, y_2, ..., y_{t-1}]
      → Masked Self-Attention (attend to own history)
      → Cross-Attention (attend to encoder output)
      → Feed-Forward Network
      → Predict y_t
```

This process repeats until the model generates an end-of-sequence token, signaling that the translation is complete.

### Why This Design Suits Translation

The encoder-decoder split is well matched to the structure of translation for a specific reason: the encoder sees the entire source sentence before the decoder generates a single token. This means the decoder always has access to a complete, fully contextualized representation of the source — it never has to generate output while the source is still being processed.

This contrasts with decoder-only architectures (Chapter 5), where source and target are concatenated and processed together in a single forward pass, meaning early target tokens are generated with only partial source context.

---

## 4.2 Encoder-Decoder Model Specifics

Large multilingual encoder-decoder models extend the base architecture with design choices that make them practical at scale across hundreds of languages.

### Multilingual Coverage via a Unified Model

Rather than training a separate model for each language pair, a multilingual encoder-decoder model uses a shared vocabulary and shared weights across all languages. A special language tag token at the start of the decoder input tells the model which language to generate:

```
Encoder input:  <2en> The conference will begin at noon.
Decoder input:  <2fr> La conférence commencera à midi.
```

The same model can translate between any pair of its supported languages by changing the language tag. This allows a single model to serve hundreds of language pairs, and enables **zero-shot translation** — translating between language pairs the model was never explicitly trained on, by routing through shared multilingual representations.

### Document-Level Denoising Pretraining

Most translation models are pretrained before fine-tuning on parallel data. Encoder-decoder models designed for translation often use a **document-level denoising** objective during pretraining.

In denoising, the training signal comes from corrupted text: the model receives a noisy version of a document (with tokens masked, dropped, or shuffled) and must reconstruct the original. This is done at the document level — not just individual sentences — which forces the model to learn discourse-level coherence, long-range dependencies, and cross-sentence context.

This pretraining approach produces representations that are particularly strong for translation of long, structured text where sentence-to-sentence consistency matters.

### Backtranslation

High-quality parallel corpora (human-translated sentence pairs) are expensive to create. For low-resource language pairs, they are scarce or nonexistent. **Backtranslation** is a data augmentation technique that addresses this.

The process is straightforward:
1. Take a large monolingual corpus in the target language
2. Use an existing (possibly weaker) translation model to translate it *back* into the source language
3. Use these synthetic source–target pairs as additional training data

The target side is real human text (high quality); the source side is machine-generated (noisier). Despite the noise on the source side, backtranslation consistently improves translation quality, especially for low-resource languages where genuine parallel data is limited.

### Model Size Variants

Encoder-decoder translation models are typically released in multiple sizes. Larger models have more layers, wider hidden dimensions, and more attention heads — which translates to better quality but higher memory and compute requirements.

| Model Size | Approx. Parameters | Typical Use Case |
|---|---|---|
| Small | ~300M | Edge deployment, low-latency services |
| Base / Medium | 1B – 4B | Balanced quality and efficiency |
| Large | 8B – 10B | High-quality production translation |
| Extra Large | 32B+ | Research, maximum quality benchmarks |

---

## 4.3 Cross-Attention Mechanism

Cross-attention is the defining feature of the encoder-decoder architecture — it is the bridge between source understanding and target generation, and it does not exist in decoder-only models.

### How Cross-Attention Works

At each decoder layer and each generation step, cross-attention computes:

- **Queries (Q):** derived from the decoder's current hidden state — representing "what does the decoder need right now?"
- **Keys (K) and Values (V):** derived from the encoder output — representing "what does the source offer?"

The attention scores are computed between the decoder's queries and the encoder's keys, producing a distribution over all source positions. The decoder then reads the corresponding values, weighted by these scores:

```
CrossAttention(Q_dec, K_enc, V_enc) = softmax(Q_dec × K_enc^T / √d_k) × V_enc
```

The result is a context vector — a weighted blend of encoder representations — that tells the decoder which parts of the source to focus on when generating the current target token.

### Attention Maps and Alignment

Because cross-attention produces a score for every source token at every generation step, it creates a natural alignment between source and target. This can be visualized as an **attention map** — a matrix where rows are target tokens and columns are source tokens, and each cell shows how much the decoder attended to that source token when generating that target token.

For well-trained models, attention maps often reveal meaningful alignment:

```
Source: The  conference  will  begin  at  noon
         ↑       ↑         ↑      ↑     ↑    ↑
Target: La  conférence  commencera   à  midi   .
```

The model learns, without any explicit alignment supervision, that "conférence" in the target corresponds to "conference" in the source, and "midi" corresponds to "noon." This emergent alignment is a direct product of cross-attention.

### Why Cross-Attention Matters for Quality

Cross-attention gives the decoder a dynamic, step-by-step connection to the source. At each generation step, it can re-read the source with a fresh perspective based on what has already been generated. This is particularly important for:

- **Long sentences:** where the relevant source context for a given target word may be far from the current generation position
- **Non-monotonic alignment:** languages like German and Japanese have word orders that differ significantly from English; cross-attention allows the decoder to look at source tokens out of order as needed
- **Disambiguation:** when generating an ambiguous target word, the decoder can consult the full source context to make the right lexical choice

---

## 4.4 Strengths and Limitations

### Strengths

**Explicit source encoding**
The encoder produces a complete, contextualized representation of the source before any target token is generated. The decoder always has access to the full source, via cross-attention, at every step. This is a structural advantage for translation — the model never has to "guess" about source content while generating.

**Strong on long and structured documents**
Document-level pretraining and the full-source encoding make encoder-decoder models particularly capable on long, coherent texts — legal documents, technical manuals, academic papers — where sentence-level context and discourse consistency matter.

**Efficient encoding**
The encoder runs only once per input, regardless of how many target tokens are generated. For long source sentences that produce relatively short translations, this is computationally efficient.

### Limitations

**Higher memory footprint**
An encoder-decoder model maintains two separate stacks of parameters — the encoder and the decoder — plus the encoder output (key-value states for cross-attention) in memory during decoding. This is more expensive than a decoder-only model of comparable quality.

**Slower for short inputs**
The encode-then-decode pipeline has a fixed overhead: the source must be fully encoded before generation begins. For very short inputs (a few words), this two-stage process is less efficient than decoder-only generation.

**Cross-attention adds decoding latency**
At every decoder layer and every generation step, cross-attention must compute scores against all encoder output positions. For long source documents, this adds meaningful latency per generated token.

These trade-offs are what motivate the decoder-only design explored in the next chapter — which takes a fundamentally different approach to the same translation task.
