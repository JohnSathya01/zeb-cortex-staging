# Chapter 3: Translation Model Architectures Overview

---

## 3.1 The Transformer — Core Building Block

Every modern neural machine translation model is built on a single foundational architecture: the **Transformer**, introduced in the 2017 paper *"Attention Is All You Need"* by Vaswani et al. Understanding the Transformer is not optional background — it is the common language of every architecture discussed in this course.

### Why RNNs Were Not Enough

Before the Transformer, sequence models like Recurrent Neural Networks (RNNs) and their variants (LSTMs, GRUs) were the standard for translation. RNNs process text sequentially — one token at a time, left to right. At each step, the model updates a hidden state that is supposed to carry information about everything it has seen so far.

This design has two fundamental problems:

**Sequential processing cannot be parallelized.** To process token 10, the model must first process tokens 1 through 9. On modern GPUs with thousands of parallel cores, this is a significant waste — the hardware is forced to work serially.

**Long-range dependencies degrade.** The hidden state is a fixed-size vector that must compress the entire history of the sequence. For long sentences, early tokens get "forgotten" as the state is overwritten by newer information. In translation, this matters enormously — the verb at the end of a German sentence may depend on a noun introduced at the beginning.

The Transformer solved both problems by abandoning recurrence entirely and replacing it with **attention**.

### Self-Attention — The Core Idea

The key insight of the Transformer is that instead of passing information through a sequential hidden state, every token should be able to directly look at every other token in the sequence simultaneously.

This mechanism is called **self-attention**.

Consider the sentence:

> *"The animal didn't cross the street because it was too tired."*

What does "it" refer to — the animal or the street? As a human reader, you resolve this by relating "it" to "animal" and "tired." Self-attention does exactly this: it allows the model to weigh how relevant each token is to every other token when building a representation.

**How self-attention works:**

For each token in the sequence, three vectors are computed:
- **Query (Q):** what this token is looking for
- **Key (K):** what this token has to offer
- **Value (V):** the actual content this token contributes

The attention score between two tokens is computed as the dot product of one token's Query with the other token's Key. These scores are then scaled and passed through a softmax to produce a probability distribution — how much attention to pay to each token.

```
Attention(Q, K, V) = softmax(QK^T / √d_k) × V
```

The output for each token is a weighted sum of all Value vectors, where the weights come from the attention scores. In practice, this means each token's new representation is an informed blend of every other token's content, weighted by relevance.

**A concrete example:**

For the token "it" in our sentence:
- High attention score toward "animal" → the model learns "it" refers to the animal
- Low attention score toward "street"
- The resulting representation of "it" carries information about the animal

This happens for every token, in parallel, in a single matrix operation — no sequential steps required.

### Multi-Head Attention

A single attention operation captures one type of relationship between tokens. But language is rich — words relate to each other syntactically, semantically, and positionally all at once.

**Multi-head attention** runs several attention operations in parallel, each with its own learned Q, K, V projection matrices. Each "head" learns to attend to a different type of relationship:

- One head might focus on syntactic dependencies (subject-verb agreement)
- Another might focus on coreference (pronoun resolution)
- Another might focus on local context (adjacent words)

The outputs of all heads are concatenated and projected back to the model dimension:

```
MultiHead(Q, K, V) = Concat(head_1, head_2, ..., head_h) × W_O
```

Typical Transformer models use 8 to 64 attention heads depending on model size. More heads allow the model to simultaneously track more types of linguistic relationships.

### Positional Encoding

Self-attention treats the input as a set — it has no inherent notion of order. The word "dog bites man" and "man bites dog" would produce identical attention patterns without additional information. Word order is fundamental to meaning, so the model must be explicitly told where each token sits in the sequence.

This is handled by **positional encoding** — a vector added to each token's embedding before it enters the attention layers. The positional encoding is designed so that the model can infer both the absolute position of each token and the relative distance between tokens.

The original Transformer used sine and cosine functions of different frequencies:

```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

Modern models often use learned positional embeddings or more sophisticated schemes like **Rotary Position Embeddings (RoPE)** or **ALiBi**, which generalize better to sequence lengths longer than those seen during training.

### Feed-Forward Layers

After the attention mechanism has allowed tokens to exchange information with each other, each token's representation is passed through a **position-wise feed-forward network (FFN)** — independently and identically for each token.

The FFN is a two-layer MLP with a non-linear activation:

```
FFN(x) = activation(x × W_1 + b_1) × W_2 + b_2
```

While attention handles inter-token relationships, the FFN is where token-level transformations happen — it acts as a kind of per-token memory that stores and transforms factual associations learned during training. Research has shown that factual knowledge (e.g., that Paris is the capital of France) is largely stored in the FFN layers.

The FFN's hidden dimension is typically 4× the model's embedding dimension (e.g., 4,096 hidden for a 1,024-dimensional model), making it the largest component by parameter count in most Transformer layers.

### Residual Connections and Layer Normalization

Deep neural networks are notoriously difficult to train — gradients can vanish or explode as they propagate through many layers. Two techniques address this directly.

**Residual connections** (also called skip connections) add the input of each sub-layer directly to its output:

```
output = LayerNorm(x + SubLayer(x))
```

This creates a direct path for gradients to flow through during backpropagation, bypassing the sub-layer entirely if needed. In practice, residual connections are what make it feasible to stack 24, 48, or even 96 Transformer layers without training instability.

**Layer normalization** normalizes the activations across the feature dimension for each token independently. This stabilizes the distribution of activations throughout training, preventing any single layer from producing values that are too large or too small for subsequent layers to handle.

Together, these two techniques are what allow Transformers to scale to billions of parameters.

### Putting It Together — The Full Stack

A complete Transformer model stacks multiple identical layers. Each layer contains:

1. Multi-head self-attention (with residual connection + layer norm)
2. Position-wise feed-forward network (with residual connection + layer norm)

A typical translation model might stack 12 to 48 such layers. The deeper the stack, the more abstract and context-rich the representations become at each successive layer.

The overall flow for a single input:

```
Input tokens
    → Token Embeddings + Positional Encoding
    → [Layer 1: Self-Attention → FFN]
    → [Layer 2: Self-Attention → FFN]
    → ...
    → [Layer N: Self-Attention → FFN]
    → Final token representations
```

These final representations are what the model uses — either to directly generate the output (decoder-only) or to pass to a decoder (encoder-decoder). Both architectures are built from this same stack of components; what differs is how they are assembled and how generation works. Those differences are the subject of Chapters 4 and 5.

---

## 3.2 Bilingual (One-to-One) Models

A bilingual translation model is trained on a single language pair — for example, English to French only. The entire model capacity is dedicated to that one direction, which typically yields high translation accuracy for that pair.

The trade-off is scalability. Supporting 10 language pairs requires 10 separate models. Supporting 100 pairs requires 100 models — each with its own training pipeline, storage footprint, and serving infrastructure. For organizations working across many languages, this becomes impractical quickly.

Bilingual models remain relevant in high-stakes, narrow-domain deployments where maximum quality for a specific pair outweighs operational complexity. The deep-dive into how these models are architected internally is covered in **Chapter 4**.

---

## 3.3 Multilingual Models

A multilingual model handles many language pairs within a single set of weights. This is achieved through a shared vocabulary that spans all supported languages and special language tag tokens that tell the model which language to expect as input and which to produce as output.

The benefits are significant: a single model to deploy and maintain, the ability to translate between language pairs that were underrepresented in training (zero-shot translation), and improved quality for low-resource languages that benefit from shared representations with related languages.

The challenge is capacity. A fixed-size model must now represent all supported languages simultaneously. High-resource languages may see a slight quality drop compared to a dedicated bilingual model — a phenomenon known as the **multilingual curse**. Balancing capacity across languages is an active area of research.

How these models are architected — and how encoder-decoder and decoder-only designs approach multilingual translation differently — is covered in **Chapters 4 and 5**.
