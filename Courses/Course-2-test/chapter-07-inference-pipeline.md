# Chapter 7: Inference Pipeline — End to End

---

A translation request goes through several distinct stages before producing output. Each stage transforms the input in a specific way — from raw text to tokens, tokens to model representations, representations to output tokens, and output tokens back to text. Understanding each stage is essential for building reliable translation systems and diagnosing quality or performance issues.

The stages in order are:

1. Input Preprocessing
2. Tokenization
3. Forward Pass (Model Computation)
4. Decoding
5. Postprocessing & Detokenization

---

## 7.1 Input Preprocessing

Before the model sees any text, the input goes through a preprocessing stage that normalizes and prepares it for tokenization. Skipping or mishandling this stage is a common source of subtle translation errors.

### Language Detection

Most translation pipelines require knowing the source language before routing the request to the appropriate model or constructing the correct prompt. Language detection is typically handled by a lightweight classifier — a small, fast model separate from the translation model itself.

Common approaches:
- **fastText language identification** — a compact model from Meta that can identify 176 languages in microseconds
- **langdetect / langid** — statistical n-gram based detectors
- **CLD3 (Compact Language Detector)** — Google's neural language identifier

Language detection is not perfect. Short inputs (1–3 words), code-switched text (mixing two languages in one sentence), and transliterated text (a language written in a different script) are common failure cases. In production, low-confidence detections should be flagged or defaulted to a safe fallback language.

### Unicode Normalization

The same visible character can have multiple valid Unicode representations. For example, the character "é" can be represented as:
- A single precomposed code point: `U+00E9` (é)
- A decomposed sequence: `U+0065` (e) + `U+0301` (combining acute accent)

These look identical but tokenize differently. Without normalization, the same word may produce different token sequences depending on how the input was created, leading to inconsistent model behavior.

**Unicode normalization forms:**
- **NFC (Canonical Decomposition, followed by Canonical Composition):** preferred for most NLP use cases — composes characters into their precomposed forms
- **NFKC:** additionally normalizes compatibility characters (e.g., converts the ligature `ﬁ` to `fi`)

Applying NFC normalization before tokenization ensures consistent tokenization regardless of input source.

### Casing and Punctuation Normalization

Some translation pipelines apply light normalization:
- Collapsing repeated whitespace and control characters
- Normalizing different dash types (em dash, en dash, hyphen) to a consistent form
- Handling directional quotation marks consistently

Heavy normalization (lowercasing, removing punctuation) is generally not recommended for NMT — modern models handle casing and punctuation well, and aggressive normalization removes information the model uses to produce correct output.

### Sentence Segmentation

Translation models are typically trained on sentence-level pairs. For paragraph or document-length input, the text must first be split into sentence-sized chunks.

Sentence segmentation is not as simple as splitting on periods. Consider:
- "Dr. Smith arrived at 3 p.m. and left by 5 p.m." — three periods, one sentence
- Abbreviations, ellipses, decimal numbers, URLs
- Languages like Thai and Chinese that do not use spaces between words

Production systems use dedicated sentence boundary detection tools rather than simple regex rules:
- **spaCy sentence segmentation** — rule-based and neural options
- **NLTK Punkt tokenizer** — unsupervised, language-aware
- **Moses sentence splitter** — widely used in MT pipelines

Correct segmentation matters for quality: a segment that cuts mid-clause will produce a translation that starts or ends awkwardly, and the model may generate incomplete output for a fragment.

---

## 7.2 Tokenization at Inference

After preprocessing, the cleaned text is passed to the tokenizer to produce the numerical representation the model operates on.

### From String to Tensor

The tokenizer performs three operations in sequence:

1. **Encoding** — splits the text into subword tokens and maps each to its integer ID in the vocabulary
2. **Adding special tokens** — prepends a beginning-of-sequence token and appends an end-of-sequence token; for encoder-decoder models, the target language code is prepended to the decoder input
3. **Returning tensors** — packages the token IDs into a numerical tensor along with an attention mask

The result is two arrays: the `input_ids` (a sequence of integers representing tokens) and the `attention_mask` (a sequence of 1s and 0s indicating which positions are real tokens vs. padding).

### Attention Masks

The attention mask is a binary tensor that tells the model which positions contain real tokens and which are padding. Positions with mask value 0 are ignored during attention computation.

For a padded batch, the structure looks like this:

| Position | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Token | BOS | The | weather | is | pleasant | EOS | PAD | PAD |
| Mask | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 |

Without the attention mask, the model would attend to padding tokens and produce incorrect output, particularly when processing batches where sequences have different lengths.

### Truncation at Inference

When the tokenized input exceeds the model's maximum sequence length, the tokenizer truncates it. The default behavior is to drop tokens from the end of the sequence — which means the end of the source text is silently cut off.

In production, truncation should be detected before tokenization and handled explicitly by applying a chunking strategy to split the input into segments that each fit within the limit. Silent truncation is preferable to a hard error in some systems, but the translation output should be flagged as potentially incomplete whenever truncation occurs.

---

## 7.3 Forward Pass

The forward pass is where the model processes the tokenized input and produces output representations. The details differ between encoder-decoder and decoder-only architectures.

### Encoder-Decoder: Encode Once, Decode Many

For encoder-decoder models, the forward pass has two distinct phases:

**Encoding (runs once per request):**
The source token IDs are passed through the full encoder stack. Every encoder layer applies bidirectional self-attention and a feed-forward network. The output is a sequence of contextual vectors — one per source token — that the decoder will consult throughout generation via cross-attention.

**Decoding (runs once per generated token):**
Starting from the target language code token, the decoder generates one token at a time. At each step:
1. The decoder processes all previously generated tokens through masked self-attention
2. Cross-attention reads from the encoder output
3. The feed-forward layer transforms the result
4. A linear projection and softmax produce a probability distribution over the vocabulary
5. The next token is selected and appended to the sequence

The encoding step is the expensive one-time cost per request. Each decoding step is cheaper — especially with the KV-cache storing previous decoder states — but must be repeated for every output token.

### Decoder-Only: Autoregressive Generation Loop

For decoder-only models, there is no separate encoding phase. The full prompt (instruction + source text + target language cue) is processed as a single sequence through the decoder layers, producing a probability distribution over the vocabulary for the next token.

On the first step, the entire prompt is processed to initialize the KV-cache. On subsequent steps, only the newly generated token is processed — the KV-cache supplies the representations of all previous tokens. This makes each subsequent step significantly faster than a full recomputation.

The generation loop continues until an end-of-sequence token is produced or the maximum output length is reached.

### Numerical Precision

The precision at which the model's weights and activations are stored affects both inference speed and translation quality.

| Precision | Bits | Memory (7B model) | Speed | Quality Impact |
|---|---|---|---|---|
| FP32 | 32 | ~28 GB | Slowest | Baseline |
| FP16 | 16 | ~14 GB | Fast | Negligible |
| BF16 | 16 | ~14 GB | Fast | Negligible |
| INT8 | 8 | ~7 GB | Faster | Minor degradation |
| INT4 | 4 | ~3.5 GB | Fastest | Moderate degradation |

**FP16 vs. BF16:** Both use 16 bits, but BF16 allocates more bits to the exponent (range) at the cost of mantissa precision. This makes BF16 more numerically stable for large models — FP16 can overflow for large activation values. BF16 is the standard choice for modern translation model inference.

**INT8 and INT4:** These quantized formats trade accuracy for memory and speed. For high-quality translation, especially for low-resource language pairs where the model is already operating near its capability limits, quantization to INT4 can produce noticeable quality degradation. INT8 is generally safer.

---

## 7.4 Decoding Strategies

At each generation step, the model produces a probability distribution over the entire vocabulary. The decoding strategy determines how the next token is selected from this distribution.

### Greedy Search

The simplest strategy: always select the token with the highest probability at each step.

Greedy decoding is fast — one forward pass per token, no branching. But it is locally optimal, not globally optimal. Choosing the highest-probability token at step 1 may lead to a lower-quality sequence overall, because a slightly less probable token at step 1 could enable much better choices at steps 2, 3, and beyond.

Greedy decoding works adequately for short, straightforward translations but tends to produce repetitive or suboptimal output for complex sentences.

### Beam Search

Beam search maintains a set of the most promising partial sequences — the **beam** — and expands all of them at each step, keeping only the top candidates by cumulative log-probability.

For example, with a beam width of 3:
- At step 1, the top 3 most probable first tokens are kept as separate candidates
- At step 2, each candidate is expanded by all possible next tokens, and the top 3 combined sequences (by cumulative log-probability) are kept
- This continues until all candidates produce an end-of-sequence token

At the end of generation, the complete sequence with the highest cumulative log-probability is returned as the translation.

**Beam width trade-off:** Wider beams explore more of the search space and generally produce better translations, at the cost of proportionally more compute — each step runs the model beam-width times in parallel. Beam widths of 4–6 are typical for production translation.

**Length penalty:** Beam search tends to favor shorter sequences because each additional token multiplies the cumulative probability by a value less than or equal to 1, reducing the total score. A length penalty normalizes scores by sequence length to prevent the model from producing unnaturally short translations. A length penalty value greater than 1.0 encourages longer outputs; less than 1.0 favors shorter ones.

Beam search is the dominant decoding strategy for translation — it consistently outperforms greedy decoding and produces more deterministic, reproducible output compared to sampling methods.

### Sampling Strategies

Sampling introduces randomness into token selection — rather than always picking the most probable token, a token is sampled from the probability distribution.

**Temperature sampling** scales the logits before the softmax:
- Temperature below 1.0 → distribution becomes sharper → more deterministic output
- Temperature above 1.0 → distribution becomes flatter → more random and diverse output
- Temperature of 1.0 → unmodified distribution

**Top-k sampling** restricts sampling to only the k most probable tokens at each step, setting all others to zero probability before sampling.

**Top-p (nucleus) sampling** selects the smallest set of tokens whose cumulative probability exceeds a threshold p, then samples from that set. This adapts dynamically — when the model is confident, the nucleus is small; when uncertain, it is wider.

For translation, sampling is generally not preferred over beam search. Translation has a relatively constrained target — there are correct and incorrect renderings of the source meaning — and randomness tends to introduce errors rather than useful variation. Sampling is more appropriate for creative generation tasks where diversity is desirable.

---

## 7.5 Postprocessing and Detokenization

After generation completes, the output token IDs must be converted back to readable text and cleaned up before being returned to the user.

### Token IDs to Text

The tokenizer's decode operation converts the sequence of output token IDs back to a string. Special tokens — beginning-of-sequence, end-of-sequence, and padding — are stripped from the output during this step.

SentencePiece tokenizers handle detokenization automatically — the word boundary markers embedded in the token representations are used to correctly reattach subwords into words and restore spaces between them.

### Handling Common Output Artifacts

Even well-trained models can produce output that requires minor cleanup:

**Leading and trailing whitespace:**
The detokenized string may begin or end with a space depending on how the first and last tokens reconstruct. A trim operation handles this.

**Repeated EOS or padding tokens:**
If generation is not properly stopped, the model may append padding or EOS tokens after the translation ends. The output should be truncated at the first end-of-sequence position.

**Source language leakage:**
Occasionally, the model may include the source language code token or parts of the instruction text in the output. A postprocessing step that checks for and removes known prompt artifacts prevents these from appearing in the final translation.

**Script and encoding issues:**
For languages that use non-Latin scripts, the output should be validated as well-formed Unicode before being returned. In rare cases, byte-fallback tokenization can produce malformed output if the model generates byte tokens in an invalid sequence.

### Sentence Reassembly

When the input was split into chunks during preprocessing due to length, the translated chunks must be reassembled into a coherent output. For non-overlapping chunks, this is a concatenation with appropriate spacing. For sliding window approaches, the overlapping translated regions from each window are discarded and only the center portions are joined.

The reassembled output should be reviewed for join artifacts — sentences at chunk boundaries may occasionally produce awkward transitions due to lost context. In high-quality pipelines, a light post-editing pass or a separate coherence model can smooth these transitions.
