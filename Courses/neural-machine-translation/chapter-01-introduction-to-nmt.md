# Chapter 1: Introduction to Neural Machine Translation

---

## 1.1 What is Machine Translation?

Machine Translation (MT) is the task of automatically converting text from one human language to another using a computer. The goal is not just word substitution — it is producing a translation that preserves the original meaning, tone, and structure in the target language.

MT has evolved through three major phases:

**Rule-Based Machine Translation (RBMT)**
The earliest systems were built on handcrafted linguistic rules — bilingual dictionaries, grammar rules, and morphological analyzers written by language experts. While predictable and transparent, RBMT systems were brittle. They required massive manual effort for every language pair and broke down on anything outside their rule set.

**Statistical Machine Translation (SMT)**
In the 1990s, researchers shifted to learning translation patterns from large collections of parallel text (bilingual corpora). Instead of rules, the system learned probabilities: how likely is word X in the source to align with word Y in the target? SMT systems like Moses were far more scalable and flexible than RBMT. However, they translated in fragments — phrase by phrase — without a true understanding of sentence-level meaning.

**Neural Machine Translation (NMT)**
NMT, which became dominant around 2016, replaced the pipeline of hand-engineered components with a single end-to-end neural network. The model reads the entire source sentence, builds a continuous representation of its meaning, and generates the translation word by word. This approach produces significantly more fluent and natural output than SMT, handles long-range dependencies better, and generalizes well across domains and language pairs.

Today, all major translation systems — Google Translate, DeepL, Microsoft Translator — are built on neural architectures.

---

## 1.2 What does a Translation Model Do?

At a high level, a translation model takes a string of text in a source language and produces an equivalent string in a target language. But the process underneath is more structured.

**Input → Encoded Representation → Decoded Output**

The model first converts the input text into tokens (subword units). These tokens are then passed through an encoder, which transforms them into a sequence of dense numerical vectors — a representation that captures the meaning and context of the source sentence. A decoder then reads this representation and generates the target translation, one token at a time.

This encode-then-decode pattern means the model is not looking up words in a dictionary. It is building an internal understanding of the source and expressing that understanding in another language.

**How Context Changes Word Meaning**

A critical advantage of NMT over older approaches is sensitivity to context. Consider the English word "bank" — it means something entirely different in "river bank" vs. "bank account." NMT models represent each word in the context of the surrounding sentence, so the same word gets a different internal representation depending on how it is used. This allows the model to choose the correct translation rather than defaulting to the most common one.

**Fluency vs. Faithfulness**

Two properties define a good translation:

- **Faithfulness** (adequacy): Does the translation convey the same meaning as the source? Is anything omitted or added?
- **Fluency**: Does the translation read naturally in the target language? Would a native speaker accept it?

These two goals can conflict. A very literal translation may be faithful but unnatural. A very fluent translation may drift from the original meaning. Good NMT systems are optimized to balance both — and evaluation metrics like BLEU and COMET are designed to measure different aspects of this balance.

---

## 1.3 Use-cases and Industry Applications

Machine translation is now embedded in a wide range of products and workflows.

**Real-Time Translation**
Live chat platforms, customer support tools, and messaging apps use MT to translate conversations instantly between users who speak different languages. Speed is critical here — the system must return a translation in milliseconds. Voice translation pipelines extend this further: speech is transcribed, translated, and synthesized back into speech in near real-time.

**Document Localization**
Businesses operating across multiple countries need to translate large volumes of content — websites, product manuals, legal contracts, marketing material, software interfaces. MT accelerates this process significantly. In many workflows, MT output is reviewed and corrected by a human translator (post-editing), combining machine speed with human accuracy.

**Multilingual Search**
Search engines and enterprise knowledge bases use MT to bridge language gaps — a query in one language can retrieve documents written in another. MT also powers cross-lingual information retrieval, allowing analysts or researchers to search global sources without being limited to content in their own language.
