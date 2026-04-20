# Chapter 12: Evaluation & Quality Metrics

---

Building a translation system is only half the work. The other half is knowing whether it is performing well. Translation quality is not binary — there is a spectrum from fluent and faithful to broken and misleading — and measuring where a system sits on that spectrum requires careful choice of evaluation methods.

There are two broad categories of evaluation: **automatic metrics**, which compare model output to reference translations using algorithms, and **human evaluation**, where trained annotators assess quality directly. Each has strengths and limitations, and production translation systems typically use both.

---

## 12.1 Automatic Metrics

Automatic metrics are fast, cheap, and reproducible. They can be computed at scale across thousands of sentence pairs in seconds, making them indispensable for model development, regression testing, and continuous quality monitoring. Their limitation is that no automatic metric perfectly correlates with human judgment — each captures a different aspect of quality and has blind spots.

### BLEU

BLEU (Bilingual Evaluation Understudy) is the oldest and most widely used automatic translation metric. Introduced in 2002, it remains a standard benchmark in research and production alike — not because it is the best metric, but because it is universal, fast, and easy to compare across systems and papers.

**What BLEU measures:**
BLEU counts how many n-grams (contiguous sequences of n words) in the model's output also appear in the reference translation. It computes precision at four n-gram levels (unigrams, bigrams, trigrams, 4-grams) and combines them geometrically. A **brevity penalty** is applied to prevent the model from gaming the score by producing very short outputs that happen to match a few reference n-grams.

BLEU scores range from 0 to 100 (when expressed as a percentage). As a rough guide:

| BLEU Score | Quality Interpretation |
|---|---|
| < 10 | Barely usable — almost no overlap with reference |
| 10 – 20 | Understandable but significant errors |
| 20 – 30 | Acceptable for gisting, not publication quality |
| 30 – 50 | Good quality for most use cases |
| 50 – 60 | High quality, close to professional translation |
| > 60 | Very high quality — often exceeds single human reference |

**Limitations of BLEU:**
- It measures surface overlap, not meaning. A translation can use different but equally valid words and score poorly even if the meaning is perfectly preserved.
- It is sensitive to tokenization — different tokenization choices produce different BLEU scores for the same translation, making cross-system comparison unreliable without standardized tokenization (sacrebleu addresses this).
- It correlates poorly with human judgment on morphologically rich languages and low-resource pairs, where valid translations may diverge significantly from the reference in surface form.
- A single reference translation is often insufficient — human translators make different but equally valid lexical and structural choices.

Despite these limitations, BLEU is still reported universally because it allows comparison with the vast body of existing literature and is well understood by the community.

### MetricX

MetricX is Google's neural translation metric, trained directly on human quality judgments from large-scale annotation efforts. Rather than counting n-gram overlaps, MetricX uses a neural model to assess translation quality the way a human annotator would.

**How it differs from BLEU:**
MetricX is trained to predict human quality scores — specifically MQM error scores (covered in section 12.2). It has learned, from thousands of human annotations, what makes a translation good or bad. This gives it much better correlation with human judgment than n-gram metrics, particularly for:
- Paraphrases and synonyms that BLEU penalizes but humans accept
- Subtle meaning errors that BLEU misses but humans catch
- Fluency issues that affect readability without changing n-gram overlap

**Reference-based and reference-free variants:**
MetricX comes in two forms. The reference-based variant compares the model output to a human reference translation, like BLEU. The reference-free variant (MetricX-QE) scores the translation directly against the source — without any reference — making it usable when reference translations are not available.

MetricX scores are expressed as error scores where lower is better (0 = no errors, 25 = worst quality), which is the inverse of BLEU's higher-is-better convention.

### COMETKiwi

COMETKiwi is a quality estimation metric — it evaluates translation quality without requiring a reference translation. It takes the source sentence and the model's translation as inputs and produces a quality score based on what it has learned from human judgments.

**Why reference-free evaluation matters:**
For low-resource language pairs, high-quality reference translations may not exist or may be expensive to obtain. Evaluating model quality in these settings with reference-based metrics like BLEU produces unreliable scores — not because the model is bad, but because the reference itself may be poor or the surface-level match is low even for a correct translation.

COMETKiwi sidesteps this problem entirely. It assesses quality by comparing source and translation semantically, without a reference. This makes it particularly valuable for:
- Low-resource language pairs where references are unavailable
- Production monitoring where computing references at scale is impractical
- Catching quality regressions without a human annotation pipeline

COMETKiwi scores range from 0 to 1, where higher is better. Scores above 0.85 generally indicate high-quality translation; below 0.75 suggests meaningful quality issues.

### Metric Summary

| Metric | Type | Requires Reference | Best For |
|---|---|---|---|
| BLEU | N-gram overlap | Yes | Benchmarking, cross-system comparison |
| MetricX | Neural (learned) | Yes (or No for QE variant) | High-correlation quality assessment |
| COMETKiwi | Neural quality estimation | No | Low-resource pairs, production monitoring |

---

## 12.2 Human Evaluation

Automatic metrics are proxies for quality. Human evaluation is the ground truth. For high-stakes translation — legal, medical, or where errors have real consequences — human judgment is the ultimate arbiter of quality.

### MQM — Multidimensional Quality Metrics

MQM is the professional standard for structured human translation quality assessment. Rather than assigning a single quality score, MQM asks annotators to identify and categorize specific errors in the translation.

**Error categories:**
MQM organizes errors into two top-level dimensions:

- **Accuracy:** Does the translation faithfully convey the meaning of the source?
  - Mistranslation — the meaning is changed or incorrect
  - Omission — part of the source meaning is missing
  - Addition — information not in the source has been added
  - Untranslated — source text left in the original language without translation

- **Fluency:** Does the translation read naturally in the target language?
  - Grammar errors — incorrect morphology, agreement, or syntax
  - Spelling and punctuation errors
  - Register — wrong level of formality for the context
  - Inconsistency — contradictory terminology within the same document

**Error severity:**
Each identified error is assigned a severity level:

| Severity | Definition | Score Impact |
|---|---|---|
| Minor | Noticeable but does not affect meaning or usability | -1 |
| Major | Affects meaning or significantly impairs readability | -5 |
| Critical | Changes meaning in a harmful way, or makes the translation unusable | -25 |

The final MQM score for a translation is computed by summing the penalty points for all errors, normalized by the number of source words. Lower scores (closer to zero) indicate higher quality.

MQM is used by Google, Microsoft, and major localization providers as the standard for professional translation quality audits. It is more expensive than simple fluency/adequacy ratings but provides actionable, structured feedback that can directly inform model improvements.

### Fluency vs. Adequacy

For simpler human evaluation tasks where full MQM annotation is not feasible, the classic two-axis framework remains useful:

**Adequacy** asks: does the translation convey the same meaning as the source? Annotators rate on a scale (typically 1–5) how much of the source meaning is preserved, regardless of whether the target language output sounds natural.

**Fluency** asks: does the translation read like natural, well-formed text in the target language? Annotators rate on a scale how fluent the output is, without access to the source — judging only whether the target text sounds like something a native speaker would write.

These two dimensions can diverge significantly:
- A very literal translation may score high on adequacy but low on fluency — the meaning is there but it sounds unnatural
- A free translation may score high on fluency but low on adequacy — it reads well but has drifted from the original meaning

Good NMT systems aim for high scores on both axes. Fluency/adequacy ratings are faster and cheaper to collect than MQM annotations, making them suitable for large-scale human evaluation studies.

---

## 12.3 Low-Resource Language Challenges

Evaluating translation quality for low-resource language pairs presents challenges that do not exist for high-resource pairs.

### The Reference Quality Problem

Automatic metrics like BLEU and MetricX compare model output against a reference translation. The implicit assumption is that the reference is a high-quality, accurate translation. For low-resource languages, this assumption often fails.

Reference translations for low-resource pairs may be:
- Produced by non-expert translators with limited training
- Sourced from noisy web-crawled parallel corpora
- Translated from a pivot language (e.g., source → English → target) rather than directly

A model that produces a better translation than the reference will score poorly against it. BLEU and reference-based neural metrics cannot distinguish between a model that is worse than the reference and a model that is better but different.

### When Automatic Metrics Mislead

For some language pairs — particularly those with rich morphology, free word order, or limited reference data — automatic metric scores can be actively misleading:

- A morphologically correct translation may use a different but valid inflected form than the reference → penalized by BLEU, not by a human
- A valid paraphrase in the target language that does not overlap with the reference n-grams → low BLEU despite correct meaning
- A fluent but inaccurate translation may score higher on BLEU than a precise but less fluent one → BLEU rewards surface match over meaning

### Preferring Reference-Free Evaluation for Low-Resource Pairs

For low-resource language pairs where reference quality is suspect, reference-free metrics like COMETKiwi provide more reliable quality signals. Because COMETKiwi evaluates the semantic relationship between source and translation directly — without comparing to a reference — it is not affected by reference quality issues.

A practical evaluation strategy for systems serving both high-resource and low-resource language pairs:

| Language Pair Type | Primary Metric | Secondary Metric |
|---|---|---|
| High-resource (en↔fr, en↔de) | BLEU + MetricX | Human spot-check |
| Medium-resource | MetricX | COMETKiwi |
| Low-resource | COMETKiwi | Human evaluation |

### The Role of Human Evaluation for Low-Resource Languages

For the lowest-resource language pairs, where automatic metrics are unreliable and reference data is scarce, human evaluation by native speakers is the only trustworthy quality signal. Even a small-scale human evaluation — 100–200 sentence pairs rated by a bilingual annotator — provides more actionable quality information than automatic metrics computed against questionable references.

Building relationships with native speaker evaluators for key low-resource languages is a valuable investment for any multilingual translation system that serves those communities.
