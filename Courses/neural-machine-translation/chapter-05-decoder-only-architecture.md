# Chapter 5: Decoder-Only Architecture

---

## 5.1 Architecture Deep Dive

The decoder-only architecture takes a fundamentally different approach to translation compared to the encoder-decoder design. Rather than separating source understanding and target generation into two distinct components, a decoder-only model treats translation as a single, unified text generation task.

### Translation as Conditional Generation

In a decoder-only model, there is no encoder. There is no cross-attention. There is only a single stack of Transformer decoder layers, and translation is framed as: *given a prompt containing the source text, continue generating the target translation.*

The input to the model is a structured prompt that concatenates the instruction, the source language, the source text, and a target language cue — all as one continuous token sequence:

```
Translate the following text from English to French.

English: The conference will begin at noon.
French:
```

The model then generates the translation token by token, continuing from where the prompt ends:

```
French: La conférence commencera à midi.
```

From the model's perspective, this is no different from any other text completion task. The translation emerges from the same autoregressive generation mechanism used for question answering, summarization, or any other language task.

### Causal Self-Attention

The only attention mechanism in a decoder-only model is **causal self-attention** — the same masked self-attention used in the encoder-decoder's decoder stack, but now applied to the entire sequence: both the prompt (source) and the generated output (target).

Causal means each token can only attend to itself and the tokens before it — never tokens that come later. This is enforced by a causal mask that sets all future attention scores to negative infinity before the softmax:

```
Token position:  1    2    3    4    5    6
                [The][conf][will][beg][at][noon]

Token 4 (beg) can attend to: positions 1, 2, 3, 4
Token 4 cannot attend to:    positions 5, 6
```

This constraint is what makes autoregressive generation possible — at each step, the model predicts the next token based only on what has already been generated, which is the only information that would be available in a real inference scenario.

### Source and Target in a Single Sequence

Because the source prompt and the target translation are part of the same sequence, the model processes them together in one forward pass through the same layers. There is no separate encoding step and no explicit cross-attention bridge.

This has an important implication: when the model generates the first target token, it has attended over the entire source prompt through causal self-attention. When it generates the second target token, it attends over the source prompt plus the first target token. The source context is always available — not through a dedicated cross-attention mechanism, but simply because it sits earlier in the same sequence.

```
Full sequence:
[Translate...][English:][The][conf][...][noon][French:][La][conf][...]
|___________________________|                 |___________________|
         Source (prompt)                           Target (generated)

← All tokens attend left (causal) →
```

The boundary between source and target is defined only by the prompt format — structurally, they are the same sequence processed by the same layers.

### The Autoregressive Generation Loop

Generation in a decoder-only model is an iterative process:

1. The full prompt is passed through all model layers → produces a hidden state at the last token position
2. A linear projection (the language model head) maps this hidden state to a probability distribution over the vocabulary
3. The next token is sampled or selected from this distribution
4. The new token is appended to the sequence
5. Steps 1–4 repeat until an end-of-sequence token is generated

In practice, step 1 is not recomputed from scratch at every step — the **KV-cache** (covered in section 5.3) stores intermediate computations so only the new token needs to be processed at each step.

---

## 5.2 Decoder-Only Model Specifics

Large decoder-only translation models bring several architectural refinements that make them practical at scale.

### Large Language Model Base with Translation Fine-Tuning

Decoder-only translation models are typically not trained for translation from scratch. Instead, they start from a large pretrained language model — one that has already learned rich language representations from vast amounts of text — and are then fine-tuned specifically for translation using parallel corpora and instruction-following examples.

This approach is effective because strong language modeling is a prerequisite for translation quality. A model that deeply understands both the source and target languages, their grammar, idioms, and vocabulary, will produce more natural translations than one trained on parallel data alone.

The fine-tuning stage teaches the model to follow the translation instruction format, align source and target meanings, and produce fluent output in the target language — building on the language understanding that pretraining already established.

### Grouped Query Attention (GQA)

Standard multi-head attention computes separate Query, Key, and Value projections for every attention head. During autoregressive decoding, the Key and Value tensors for all previous tokens must be stored in the **KV-cache** — one K and V matrix per head, per layer. For a model with 32 layers and 32 heads, this is 64 matrices that grow with every generated token.

**Grouped Query Attention (GQA)** reduces this memory cost by sharing Key and Value projections across groups of Query heads. Instead of every Query head having its own K and V, multiple Query heads share a single K and V pair:

```
Standard MHA (32 heads):   Q1 K1 V1 | Q2 K2 V2 | ... | Q32 K32 V32
GQA (8 KV groups):         Q1 Q2 Q3 Q4 → K1 V1 | Q5 Q6 Q7 Q8 → K2 V2 | ...
```

This reduces KV-cache memory by the grouping factor (e.g., 4× reduction with 8 KV groups for 32 query heads) with minimal impact on output quality. For large models serving many concurrent requests, this memory saving directly translates to higher throughput — more requests can be processed simultaneously because less memory is consumed per request.

### Sliding Window Attention

Standard self-attention attends to every previous token in the sequence. For long sequences, this becomes expensive — the cost grows quadratically with sequence length. **Sliding window attention** addresses this by restricting each token to attend only to a fixed window of the most recent tokens, rather than the entire history.

A model using sliding window attention alternates between:
- **Local attention layers:** each token attends only to a window of W preceding tokens (e.g., W = 4,096)
- **Global attention layers:** standard full attention over all previous tokens

The local layers handle most of the computation cheaply. The global layers, appearing less frequently, ensure long-range dependencies are still captured. This hybrid design allows the model to handle long inputs efficiently without completely sacrificing the ability to attend over the full context when necessary.

### Prompt Format and Its Effect on Quality

The way the translation instruction is structured in the prompt significantly affects output quality. A well-designed prompt format:

- Clearly identifies the source and target languages
- Separates the source text from the instruction
- Uses a consistent format that matches what the model saw during fine-tuning

A typical format for an instruction-tuned translation model:

```
Translate the following text from {source_language} to {target_language}.

{source_language}: {source_text}
{target_language}:
```

Deviating from the expected format — using different language names, changing the structure, or omitting the target language cue — can lead to degraded translations or the model responding in the wrong language. Consistency with the fine-tuning format is important in production.

---

## 5.3 KV-Cache — A Key Concept

The KV-cache is one of the most important optimizations in decoder-only inference. Without it, generating a 100-token translation would require 100 full forward passes through the model — each one reprocessing the entire sequence from scratch. The KV-cache reduces this to one full pass followed by 99 lightweight single-token passes.

### What the KV-Cache Stores

During the forward pass, each attention layer computes Key (K) and Value (V) tensors for every token in the sequence. These tensors encode the "memory" of each past token — what it has to offer to future tokens via attention.

Once computed, these K and V tensors do not change for existing tokens. When a new token is generated and appended to the sequence, only the new token's K and V need to be computed. All previous K and V tensors are retrieved from the cache.

```
Step 1 — Process full prompt (cache all K, V):
  [Translate...][English:][The][conference][...] → Cache K,V for each token

Step 2 — Generate "La" (only compute K,V for new token):
  Retrieve cached K,V + compute K,V for [La] → Predict next token

Step 3 — Generate "conférence":
  Retrieve cached K,V + compute K,V for [conférence] → Predict next token
  ...
```

This makes each generation step much faster than a full recomputation.

### Memory Cost and Growth

The KV-cache grows linearly with sequence length. For each token in the cache:

```
Memory per token = 2 × num_layers × num_kv_heads × head_dim × bytes_per_element
```

For a large model (e.g., 32 layers, 8 KV heads with GQA, 128 head dim, BF16):
```
= 2 × 32 × 8 × 128 × 2 bytes = 131,072 bytes ≈ 128 KB per token
```

A 500-token sequence would consume ~64 MB of KV-cache. For a server handling hundreds of concurrent translation requests, this adds up quickly and is often the primary constraint on how many simultaneous requests can be served.

This is why GQA (fewer KV heads) and quantized KV caches (storing K and V in INT8 instead of BF16) are important optimizations in production deployments.

### Prefix Caching

Many translation workloads use a fixed instruction prefix — the same "Translate the following text from X to Y" prompt header for every request. **Prefix caching** pre-computes and stores the KV tensors for this fixed prefix once, and reuses them across all requests that share it.

This means the model only processes the variable part (the actual source text) for each new request, saving compute and latency proportional to the length of the shared prefix. In high-throughput translation services where the instruction prefix is constant, prefix caching can provide meaningful latency reductions.

---

## 5.4 Encoder-Decoder vs. Decoder-Only: When to Use Which

The two architectures are not universally better or worse — they make different trade-offs that suit different use cases.

| Dimension | Encoder-Decoder | Decoder-Only |
|---|---|---|
| **Source encoding** | Full bidirectional encoding before generation | Causal attention over source as part of same sequence |
| **Cross-attention** | Explicit, at every decoder layer | None — source accessed via self-attention |
| **Memory footprint** | Higher (encoder + decoder + cross-attn KV) | Lower per parameter (single stack, GQA reduces KV) |
| **Short input latency** | Slower (encode-first overhead) | Faster (single pass, no separate encode step) |
| **Long document quality** | Strong (dedicated bidirectional encoder) | Depends on context window and attention design |
| **Multilingual zero-shot** | Strong (language tag routing) | Strong (instruction following + pretraining coverage) |
| **Deployment complexity** | Moderate | Lower (single model, standard LLM serving stack) |
| **Best for** | Long structured documents, high-fidelity translation | General-purpose, instruction-following, multi-task use |

### Practical Guidance

**Choose encoder-decoder when:**
- The primary task is translation and nothing else
- Input documents are long and structured (legal, technical, medical)
- Maximum faithfulness on specific language pairs is the priority
- You are operating within a constrained compute budget and need efficiency per translation quality point

**Choose decoder-only when:**
- Translation is one of several tasks the model needs to handle
- The serving infrastructure is already built around LLM tooling (vLLM, TensorRT-LLM)
- You need flexibility in prompt design and instruction following
- You are working with a wide range of language pairs and want a single model to cover all of them

In practice, the gap in translation quality between strong models of each type has narrowed significantly. The choice increasingly comes down to operational fit — what infrastructure you already have, what other tasks the model needs to serve, and where your language pair coverage needs are strongest.
