# Chapter 6: Tokenizers — Model Comparison

---

## 6.1 SentencePiece / Unigram Tokenizer

Encoder-decoder multilingual translation models use SentencePiece with the Unigram Language Model algorithm as their tokenizer. The design is optimized for breadth — covering hundreds of languages and scripts within a single shared vocabulary.

### Vocabulary Structure for Multilingual Coverage

A vocabulary of 256,000 tokens must serve languages as different as English, Arabic, Tamil, Chinese, and Georgian simultaneously. The token distribution is not equal across languages — high-resource languages with more training data naturally occupy more vocabulary slots, while low-resource languages share tokens or fall back to byte-level representations.

The vocabulary is built from a large multilingual corpus. Tokens that appear frequently across many languages (Latin characters, common subwords like `-tion`, `-ing`) occupy single slots. Rare scripts and characters that cannot be represented by any vocabulary token are handled by **byte fallback** — the tokenizer decomposes the character into its UTF-8 bytes and represents each byte as a token. This guarantees that no input ever produces an `<unk>` token, at the cost of longer sequences for unsupported characters.

### Language Code Tokens

A key feature of multilingual encoder-decoder tokenizers is the use of **language code tokens** as control signals. These are special tokens added to the vocabulary that tell the model which language to expect or generate:

```
<2en>   English
<2fr>   French
<2de>   German
<2hi>   Hindi
<2ta>   Tamil
<2zh>   Chinese
```

In practice, the language code is prepended to the decoder input to specify the target language:

```
Encoder input:   The weather is pleasant today.
Decoder input:   <2fr> Le temps est agréable aujourd'hui.
```

Changing the language code token changes the translation direction — the same encoder output can be decoded into any supported language simply by switching the language tag. This is the mechanism that enables zero-shot translation between language pairs not seen together during training.

### Byte Fallback in Practice

When tokenizing a language with a script not well-represented in the vocabulary — for example, a rare Indic script or an unusual symbol — the tokenizer falls back to raw UTF-8 bytes. Each byte is represented as a token in the form `<0xNN>`:

```
Input character: ꗏ  (a Vai script character)
UTF-8 bytes:     0xEA 0x97 0x8F
Tokens:          <0xEA> <0x97> <0x8F>
```

Three tokens instead of one. For languages where byte fallback is frequent, this significantly inflates sequence length and increases the chance of hitting the model's context limit.

---

## 6.2 SentencePiece BPE Tokenizer

Decoder-only LLM-based translation models use SentencePiece with the BPE algorithm. While the underlying SentencePiece library is the same, the algorithm and design choices differ in ways that matter for translation.

### Vocabulary and Shared Representation

The BPE vocabulary for large language models is also typically 256,000 tokens, built from a broad multilingual corpus. BPE merges the most frequent character pairs iteratively, resulting in a vocabulary where common words in high-resource languages appear as single tokens, and rare or morphologically complex words are split into subword pieces.

Because these models are pretrained on general web text rather than translation-specific corpora, their vocabulary reflects general language distribution — very strong on English and major European languages, progressively weaker on low-resource or non-Latin script languages.

### How Prompt Structure Affects Tokenization

In a decoder-only model, the translation prompt is part of the tokenized input. The structure of the prompt — instruction text, language names, source text, and the target language cue — all get tokenized together:

```
Prompt:
"Translate the following text from English to French.\n\nEnglish: The weather is pleasant today.\nFrench:"

Tokenized (approximate):
[Translate] [the] [following] [text] [from] [English] [to] [French] [.] [\n\n]
[English] [:] [The] [weather] [is] [pleasant] [today] [.] [\n] [French] [:]
```

This has a practical implication: the instruction tokens consume sequence length from the model's context window. A 30-token instruction prefix leaves less room for the actual source text, which matters for long documents. In production, prompt templates should be kept as concise as possible while still being unambiguous to the model.

Special tokens like `<bos>` (beginning of sequence) and `<eos>` (end of sequence) are automatically added by the tokenizer. The model learns during fine-tuning that `<eos>` signals the end of the translation — suppressing or misplacing this token in production can cause the model to continue generating beyond the intended output.

### Byte-Level Fallback

Like the Unigram tokenizer, BPE tokenizers for large language models include byte-level fallback. Characters outside the vocabulary are represented as individual bytes, ensuring robustness across all Unicode input. The byte tokens are typically represented as special `<0xNN>` tokens in the vocabulary.

---

## 6.3 Side-by-Side Comparison

### Token Fertility by Language

Token fertility — the average number of tokens a word produces — is the most direct measure of how well a tokenizer handles a given language. Lower fertility means more efficient representation; higher fertility means longer sequences, higher memory usage, and more generation steps.

The table below shows approximate fertility values for a sentence of 10 words across several languages, using a typical 256k multilingual vocabulary:

| Language | Script | Approx. Tokens for 10 Words | Fertility |
|---|---|---|---|
| English | Latin | 10 – 12 | Low |
| French | Latin | 11 – 14 | Low |
| German | Latin | 12 – 18 | Low–Medium |
| Russian | Cyrillic | 14 – 20 | Medium |
| Arabic | Arabic | 18 – 30 | Medium–High |
| Hindi | Devanagari | 16 – 28 | Medium–High |
| Tamil | Tamil script | 20 – 35 | High |
| Finnish | Latin | 15 – 25 | Medium–High |
| Chinese | CJK | 10 – 15 | Low–Medium |

German and Finnish have high fertility due to compound words and agglutination — a single long word tokenizes into many pieces. Arabic and Tamil have high fertility partly due to rich morphology and partly because their scripts are less represented in most vocabularies.

High fertility directly affects cost and quality: longer sequences are more expensive to process, more likely to be truncated, and harder for the model to attend over effectively.

### Padding and Packing Strategies for Batching

When processing multiple translation requests in a single batch, all sequences in the batch must be the same length. Two strategies handle this:

**Padding**
Shorter sequences are padded with a special `<pad>` token to match the length of the longest sequence in the batch. An attention mask marks which positions are real tokens and which are padding, so the model ignores padded positions during computation.

```
Sequence 1: [The][weather][is][pleasant][today][.][<pad>][<pad>][<pad>]
Sequence 2: [The][international][conference][on][climate][change][begins][today][.]
Attention:  [ 1 ][     1       ][ 1 ][ 1    ][ 1][ 1 ][  0  ][  0  ][  0  ]
```

Padding wastes compute on positions the model ignores. For batches with highly variable sequence lengths, a large fraction of tokens may be padding.

**Sequence Packing**
Instead of padding, multiple short sequences are concatenated into a single long sequence up to the model's maximum length, with a separator token between them. The attention mask prevents sequences from attending to each other.

```
[Seq1 tokens...][SEP][Seq2 tokens...][SEP][Seq3 tokens...]
```

Packing eliminates wasted padding compute and significantly improves GPU utilization for workloads with many short inputs. It is more complex to implement but is standard practice in high-throughput translation serving.

### Sequence Length Explosion in Agglutinative Languages

Agglutinative languages — where words are built by chaining morphemes together — pose a particular challenge. Finnish, Turkish, Hungarian, Tamil, and Swahili are examples. A single word in these languages can express what would require an entire phrase in English:

```
Finnish:  talossanikin
English:  "also in my house"
Tokens:   [talo][ssa][ni][kin]  →  4 tokens for 4 English words
```

While fertility looks moderate in this example, complex verb forms in these languages can produce 6–10 tokens for a single word. A Finnish sentence of 15 words may tokenize to 40–60 tokens, compared to 15–20 for an equivalent English sentence.

This sequence length inflation has compounding effects in translation:
- The source sequence is longer → more tokens processed by the encoder or the prompt
- The target sequence may also be longer → more generation steps, higher latency
- Combined, a single translation request can consume 3–4× the compute of an equivalent English-to-French request

Understanding fertility by language is essential when estimating capacity, setting context length limits, and diagnosing unexpected latency spikes for specific language pairs.

---

## 6.4 Tokenizer Inspection and Debugging

Understanding how a tokenizer behaves on real input is an essential skill for anyone building or debugging a translation pipeline. Unexpected tokenization is a common root cause of translation quality issues that can be difficult to diagnose without directly inspecting the tokenizer output.

### Loading and Using a Tokenizer

Using the HuggingFace `transformers` library, loading a tokenizer and inspecting its output is straightforward:

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("model-name-or-path")

text = "The weather is pleasant today."
encoded = tokenizer(text, return_tensors="pt")

print(encoded["input_ids"])
# tensor([[  1, 450, 278, 9950, 338, 14176, 3826, 29889,  2]])

tokens = tokenizer.convert_ids_to_tokens(encoded["input_ids"][0])
print(tokens)
# ['<s>', '▁The', '▁weather', '▁is', '▁pleasant', '▁today', '.', '</s>']
```

The `▁` (underscore) prefix on tokens indicates a word boundary — the token begins a new word. This is a SentencePiece convention. Tokens without the prefix are continuations of a previous token.

To decode token IDs back to text:

```python
decoded = tokenizer.decode(encoded["input_ids"][0], skip_special_tokens=True)
print(decoded)
# "The weather is pleasant today."
```

### Checking Token Fertility for a Language

To measure how efficiently the tokenizer handles a specific language, compute the token-to-word ratio on a sample of text:

```python
text = "Sää on tänään miellyttävä."  # Finnish: "The weather is pleasant today."
tokens = tokenizer.tokenize(text)
words = text.split()

fertility = len(tokens) / len(words)
print(f"Tokens: {tokens}")
print(f"Words: {len(words)}, Tokens: {len(tokens)}, Fertility: {fertility:.2f}")
# Tokens: ['▁S', 'ää', '▁on', '▁t', 'än', 'ään', '▁miel', 'lyt', 'tävä', '.']
# Words: 4, Tokens: 10, Fertility: 2.50
```

High fertility values (above 2.0) indicate the tokenizer is not well-suited for that language and the model will see fragmented, less meaningful units.

### Diagnosing Truncation Issues

When a source text is longer than the model's maximum sequence length, the tokenizer truncates it. Silent truncation is a common source of translation quality issues — the model receives an incomplete source and produces an incomplete or incoherent translation without any error signal.

To check whether a given input would be truncated:

```python
max_length = tokenizer.model_max_length
encoded = tokenizer(text, truncation=False)  # Do not truncate yet
n_tokens = len(encoded["input_ids"])

if n_tokens > max_length:
    print(f"WARNING: Input has {n_tokens} tokens, exceeds limit of {max_length}")
    print(f"Characters that will be cut: ~{len(text) * (n_tokens - max_length) / n_tokens:.0f}")
```

In production pipelines, this check should be applied before tokenization to decide whether chunking is needed.

### Special Tokens and Common Pitfalls

Special tokens are added automatically by the tokenizer and have specific roles in model behavior. Understanding them prevents subtle bugs.

| Token | Role | What Goes Wrong Without It |
|---|---|---|
| `<bos>` / `<s>` | Beginning of sequence | Model starts generating without proper context initialization |
| `<eos>` / `</s>` | End of sequence | Model does not know when to stop; generation continues indefinitely |
| `<pad>` | Padding for batch alignment | Without masking, model attends to padding positions and produces garbage |
| `<unk>` | Unknown token (rare with byte fallback) | Loss of information for unsupported characters |
| Language code | Target language control (encoder-decoder) | Model generates in the wrong language or switches mid-output |

**Common pitfall — EOS suppression:**
Some generation configurations set `eos_token_id=None` or add EOS to the `suppress_tokens` list to prevent early stopping. If the EOS token is suppressed globally, the model will never stop generating and will fill the remaining context window with hallucinated content after the translation ends.

**Common pitfall — missing language code:**
For encoder-decoder models, if the target language code token is omitted from the decoder input, the model has no signal for which language to generate. It may default to the most common language in its training distribution or produce mixed-language output.

**Common pitfall — tokenizer mismatch:**
Using a tokenizer from one model with the weights of another will produce incorrect token IDs. Always load the tokenizer and the model from the same checkpoint or ensure they share an identical vocabulary. A mismatch typically produces nonsensical output with no obvious error.
