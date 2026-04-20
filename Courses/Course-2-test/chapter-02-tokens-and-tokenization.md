# Chapter 2: Tokens & Tokenization

---

## 2.1 What is a Token?

Before a translation model can process any text, it needs to convert that text into a format it understands — numbers. But the first step is deciding how to split the text into meaningful units. These units are called **tokens**.

Consider the sentence:

> *"The researchers are working on low-resource language translation."*

Depending on the tokenization strategy, this could be split in different ways:

| Strategy | Tokens |
|---|---|
| Word-level | `The`, `researchers`, `are`, `working`, `on`, `low-resource`, `language`, `translation`, `.` |
| Character-level | `T`, `h`, `e`, ` `, `r`, `e`, `s`, `e`, `a`, `r`, `c`, `h`, `e`, `r`, `s`, ... |
| Subword-level | `The`, `research`, `ers`, `are`, `working`, `on`, `low`, `-`, `resource`, `language`, `trans`, `lation`, `.` |

Each strategy has a different granularity, and each comes with trade-offs.

**Word-level tokenization** is intuitive but problematic. Languages have enormous vocabularies — new words, names, technical terms, and morphological variants mean any fixed word vocabulary will constantly encounter words it has never seen. These are called **out-of-vocabulary (OOV)** tokens, and they get replaced with a generic `<unk>` token, losing all meaning.

**Character-level tokenization** solves the OOV problem entirely — every character is known. But it produces very long sequences (the sentence above becomes 60+ characters), making it expensive to process and harder for the model to learn meaningful patterns.

**Subword tokenization** is the practical middle ground used by virtually all modern NMT models. Frequent words remain whole (`are`, `on`, `The`), while rare or complex words are split into recognizable pieces (`researchers` → `research` + `ers`, `translation` → `trans` + `lation`). This balances vocabulary size, sequence length, and the ability to handle unseen words gracefully.

---

## 2.2 Tokenization Algorithms

Several algorithms exist for learning how to split text into subwords. They differ in how they build the vocabulary and how they handle ambiguous splits.

### Byte-Pair Encoding (BPE)

BPE starts with a vocabulary of individual characters and iteratively merges the most frequently co-occurring pair of symbols until the target vocabulary size is reached.

**How it works — a simplified example:**

Suppose our corpus contains only these words (with frequencies):
```
low (5), lower (2), newest (6), widest (3)
```

Starting vocabulary (characters + end-of-word marker):
```
l o w </w>   l o w e r </w>   n e w e s t </w>   w i d e s t </w>
```

Step 1: Count all adjacent pairs. The pair `e s` appears most often (in `newest` and `widest`). Merge it → `es`.

Step 2: Now `es t` is frequent. Merge → `est`.

Step 3: Continue until the vocabulary reaches the desired size.

The result is a vocabulary of character n-grams that reflect real word structure. Common words and common word-parts become single tokens; rare combinations stay split.

BPE is used by GPT models, RoBERTa, and many translation models. The vocabulary is learned from training data, so it naturally reflects the language's structure.

### SentencePiece and Unigram Language Model

SentencePiece is a tokenization library that operates directly on raw text — it does not require pre-tokenized, whitespace-separated words. This makes it especially useful for languages like Japanese, Chinese, or Thai that do not use spaces between words.

The **Unigram Language Model** algorithm (used within SentencePiece) takes the opposite approach from BPE. Instead of starting small and merging up, it starts with a large candidate vocabulary and prunes it down. At each step, it removes tokens whose removal least affects the overall likelihood of the training corpus, until the target vocabulary size is reached.

This produces a probabilistic tokenizer: a given input string can have multiple possible tokenizations, and the algorithm picks the most likely one. This results in slightly better handling of rare and ambiguous inputs compared to BPE.

SentencePiece with Unigram is used by MADLAD-400, T5, mBART, and many multilingual models.

### WordPiece

WordPiece is similar to BPE but uses a different merge criterion. Instead of choosing the most frequent pair, it chooses the pair whose merge maximizes the likelihood of the training data under a language model.

In practice, WordPiece tokens for non-initial subwords are prefixed with `##` to indicate they are continuations:

> `tokenization` → `token`, `##ization`

WordPiece is used by BERT and its variants. While less common in translation models, understanding it helps when working with models that use BERT-style encoders.

---

## 2.3 Vocabulary Size Trade-offs

The vocabulary size — how many unique tokens the tokenizer knows — is a critical design decision. It directly affects model size, training efficiency, and translation quality.

**Too small a vocabulary**

When the vocabulary is small (e.g., 8,000 tokens), rare words and morphological variants are split into many small pieces. A word like `internationalization` might tokenize into 6–8 fragments. The model has to reconstruct meaning from many short, low-signal tokens.

- Frequent `<unk>` tokens for unseen words → loss of meaning
- Long sequences → higher memory and compute cost
- Poor handling of named entities, technical terms, and proper nouns

**Too large a vocabulary**

When the vocabulary is very large (e.g., 500,000+ tokens), most words appear as single tokens — which sounds ideal. But there is a hidden cost: each token needs its own embedding vector. A vocabulary of 500k tokens with 1024-dimensional embeddings adds hundreds of millions of parameters just for the embedding table. Rare tokens in a large vocabulary are also seen very infrequently during training and end up with poorly-learned representations.

**The practical range**

Most modern NMT models use vocabularies between **32,000 and 256,000 tokens**. Multilingual models tend toward the higher end — covering hundreds of languages with a single vocabulary requires more tokens to represent diverse scripts and morphologies without excessive fragmentation.

| Vocabulary Size | Typical Use Case |
|---|---|
| 32k – 50k | Bilingual models, English-centric systems |
| 64k – 128k | Multilingual models (10–50 languages) |
| 256k | Massively multilingual models (100–400+ languages) |

---

## 2.4 Multilingual Tokenization Challenges

Building a tokenizer for a single language is straightforward. Building one that works well for hundreds of languages simultaneously is a significantly harder problem.

### Script Diversity

Different languages use entirely different writing systems. A single multilingual tokenizer must handle:

- **Latin script**: English, French, Spanish, German, Vietnamese
- **Cyrillic**: Russian, Bulgarian, Serbian, Ukrainian
- **Arabic script**: Arabic, Persian, Urdu (right-to-left, connected letters)
- **Devanagari**: Hindi, Marathi, Nepali
- **CJK (Chinese, Japanese, Korean)**: logographic and syllabic scripts with no word boundaries
- **Indic scripts**: Tamil, Telugu, Bengali, each with their own character sets

A tokenizer trained predominantly on high-resource languages will fragment low-resource language text more aggressively, since those language patterns are underrepresented in the vocabulary learning process.

### Token Fertility

**Token fertility** is the average number of tokens a word produces when tokenized. It is a direct measure of how well the tokenizer handles a given language.

A fertility of 1.0 means every word becomes exactly one token. Higher fertility means more fragmentation.

| Language | Example Word | Approx. Tokens | Fertility |
|---|---|---|---|
| English | `running` | 1 | Low |
| German | `Donaudampfschifffahrtsgesellschaft` | 6–8 | Medium |
| Finnish | `juoksentelisinkohan` | 5–7 | Medium-High |
| Arabic | `وَسَيَتَعَلَّمُونَ` | 6–10 | High |
| Tamil | `படிக்கவில்லை` | 4–8 | High |

High fertility has real consequences. If a sentence in Turkish tokenizes into 3× as many tokens as the same sentence in English, the Turkish input hits the model's sequence length limit sooner, more of its content gets truncated, and the model requires more compute to process it.

### Byte Fallback

A robust multilingual tokenizer includes a **byte fallback** mechanism. If a character is not in the vocabulary (a rare script, an emoji, a symbol), the tokenizer falls back to representing it as individual UTF-8 bytes. This ensures the tokenizer never produces an `<unk>` token — every possible input can be represented, even if inefficiently.

Both SentencePiece and the tokenizers used in modern large language models include byte fallback as a safety net.

---

## 2.5 Token Limits and Context Windows

Every transformer model has a **maximum sequence length** — the largest number of tokens it can process in a single forward pass. This is commonly referred to as the **context window**.

Typical limits:

| Model Type | Common Max Length |
|---|---|
| Early NMT models | 512 tokens |
| Modern translation models | 1,024 – 4,096 tokens |
| Long-context LLMs | 8,192 – 128,000+ tokens |

For most sentence-level translation tasks, 512–1,024 tokens is sufficient. A typical English sentence is 15–30 words, which tokenizes to roughly 20–40 tokens. But translation is not always sentence-level.

**What happens when input exceeds the limit?**

If a document is longer than the model's context window, the input must be handled in segments. There are two common strategies:

**Chunking**
The document is split into non-overlapping segments, each within the token limit. Each segment is translated independently. This is simple and fast, but can break sentences mid-thought and loses context across chunk boundaries — leading to inconsistencies in terminology, pronouns, or tense.

```
Document → [Chunk 1] [Chunk 2] [Chunk 3]
              ↓          ↓          ↓
           Translate  Translate  Translate
              ↓          ↓          ↓
           Output 1  Output 2  Output 3  → Concatenate
```

**Sliding Window with Overlap**
Consecutive chunks share an overlapping region (e.g., the last 50 tokens of one chunk become the first 50 tokens of the next). This provides context continuity. The overlapping translated region is discarded from the final output, keeping only the non-overlapping center of each window.

```
[← Chunk 1 →]
        [← Chunk 2 →]
                [← Chunk 3 →]
        ↑ overlap ↑
```

This produces more coherent output across chunk boundaries at the cost of additional compute (some tokens are processed twice).

The right strategy depends on the use case — for short documents and sentences, neither is needed. For legal contracts, technical manuals, or long articles, sliding window overlap typically produces better consistency.
