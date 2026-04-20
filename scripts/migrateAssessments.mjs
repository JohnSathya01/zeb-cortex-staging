#!/usr/bin/env node

/**
 * Migration script: Seeds Firebase RTDB with assessment data from courseData.js.
 * Converts options from array format to object format keyed by option ID.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrateAssessments.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'fs';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var is required');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
});

const db = getDatabase(app);

// Hardcoded assessment data (same as courseData.js chapterAssessments)
const chapterAssessments = [
  // Ch 1: Introduction to NMT
  [
    { question: 'Which approach to machine translation became dominant around 2016?', options: [
      { text: 'Rule-Based Machine Translation', isCorrect: false },
      { text: 'Statistical Machine Translation', isCorrect: false },
      { text: 'Neural Machine Translation', isCorrect: true },
      { text: 'Dictionary-Based Translation', isCorrect: false },
    ]},
    { question: 'What is a key advantage of NMT over Statistical Machine Translation?', options: [
      { text: 'It uses handcrafted linguistic rules', isCorrect: false },
      { text: 'It produces more fluent and natural output', isCorrect: true },
      { text: 'It requires less training data', isCorrect: false },
    ]},
    { question: 'What does an NMT model build from the source sentence before generating a translation?', options: [
      { text: 'A bilingual dictionary', isCorrect: false },
      { text: 'A continuous representation of meaning', isCorrect: true },
      { text: 'A set of grammar rules', isCorrect: false },
    ]},
  ],
  // Ch 2: Tokens & Tokenization
  [
    { question: 'What is the purpose of tokenization in NMT?', options: [
      { text: 'To translate text directly', isCorrect: false },
      { text: 'To split text into meaningful units the model can process', isCorrect: true },
      { text: 'To compress the model size', isCorrect: false },
    ]},
    { question: 'Which tokenization strategy is used by virtually all modern NMT models?', options: [
      { text: 'Word-level tokenization', isCorrect: false },
      { text: 'Character-level tokenization', isCorrect: false },
      { text: 'Subword-level tokenization', isCorrect: true },
    ]},
    { question: 'What problem does subword tokenization help solve?', options: [
      { text: 'Slow training speed', isCorrect: false },
      { text: 'Out-of-vocabulary words', isCorrect: true },
      { text: 'Grammar errors in output', isCorrect: false },
    ]},
  ],
  // Ch 3: Translation Model Architectures
  [
    { question: 'What foundational architecture do all modern NMT models build upon?', options: [
      { text: 'Recurrent Neural Network', isCorrect: false },
      { text: 'Transformer', isCorrect: true },
      { text: 'Convolutional Neural Network', isCorrect: false },
    ]},
    { question: 'Why were RNNs insufficient for translation tasks?', options: [
      { text: 'They could not process text at all', isCorrect: false },
      { text: 'Sequential processing cannot be parallelized and long-range dependencies degrade', isCorrect: true },
      { text: 'They required too much labeled data', isCorrect: false },
    ]},
    { question: 'What mechanism did the Transformer introduce to replace recurrence?', options: [
      { text: 'Convolution', isCorrect: false },
      { text: 'Attention', isCorrect: true },
      { text: 'Pooling', isCorrect: false },
    ]},
  ],
  // Ch 4: Encoder-Decoder Architecture
  [
    { question: 'In an encoder-decoder model, what does the encoder produce?', options: [
      { text: 'The final translated text', isCorrect: false },
      { text: 'A bidirectional representation of the source tokens', isCorrect: true },
      { text: 'A list of vocabulary words', isCorrect: false },
    ]},
    { question: 'What is cross-attention in the decoder?', options: [
      { text: 'Attention between decoder tokens and encoder states', isCorrect: true },
      { text: 'Attention between two different models', isCorrect: false },
      { text: 'A type of data augmentation', isCorrect: false },
    ]},
    { question: 'How many languages does MADLAD-400 support?', options: [
      { text: 'About 50', isCorrect: false },
      { text: 'About 100', isCorrect: false },
      { text: 'Over 400', isCorrect: true },
    ]},
  ],
  // Ch 5: Decoder-Only Architecture
  [
    { question: 'In a decoder-only model, how is translation framed?', options: [
      { text: 'As a classification task', isCorrect: false },
      { text: 'As a conditional generation task', isCorrect: true },
      { text: 'As a search problem', isCorrect: false },
    ]},
    { question: 'What is the KV-cache used for?', options: [
      { text: 'Storing training data', isCorrect: false },
      { text: 'Caching key-value pairs to speed up autoregressive generation', isCorrect: true },
      { text: 'Compressing model weights', isCorrect: false },
    ]},
    { question: 'What attention mechanism does TranslateGemma use for efficiency?', options: [
      { text: 'Full self-attention', isCorrect: false },
      { text: 'Grouped Query Attention (GQA)', isCorrect: true },
      { text: 'Linear attention', isCorrect: false },
    ]},
  ],
  // Ch 6: Tokenizers Comparison
  [
    { question: 'What tokenizer algorithm does MADLAD-400 use?', options: [
      { text: 'WordPiece', isCorrect: false },
      { text: 'SentencePiece with Unigram', isCorrect: true },
      { text: 'Character-level', isCorrect: false },
    ]},
    { question: 'What is token fertility?', options: [
      { text: 'The number of languages a tokenizer supports', isCorrect: false },
      { text: 'The average number of tokens a word produces when tokenized', isCorrect: true },
      { text: 'The speed of tokenization', isCorrect: false },
    ]},
    { question: 'What vocabulary size do both MADLAD-400 and TranslateGemma use?', options: [
      { text: '32,000 tokens', isCorrect: false },
      { text: '256,000 tokens', isCorrect: true },
      { text: '1 million tokens', isCorrect: false },
    ]},
  ],
  // Ch 7: Inference Pipeline
  [
    { question: 'What is the first step in the inference pipeline?', options: [
      { text: 'Decoding', isCorrect: false },
      { text: 'Input preprocessing (language detection, normalization)', isCorrect: true },
      { text: 'Quantization', isCorrect: false },
    ]},
    { question: 'What is beam search?', options: [
      { text: 'A training algorithm', isCorrect: false },
      { text: 'A decoding strategy that explores multiple candidate sequences', isCorrect: true },
      { text: 'A type of tokenization', isCorrect: false },
    ]},
    { question: 'What does detokenization do?', options: [
      { text: 'Splits text into tokens', isCorrect: false },
      { text: 'Converts token IDs back into a readable string', isCorrect: true },
      { text: 'Removes stop words', isCorrect: false },
    ]},
  ],
  // Ch 8: Concurrency, Throughput & Latency
  [
    { question: 'What does latency measure in translation inference?', options: [
      { text: 'Number of GPUs used', isCorrect: false },
      { text: 'Time from request to response', isCorrect: true },
      { text: 'Model accuracy', isCorrect: false },
    ]},
    { question: 'What is the effect of batching on throughput?', options: [
      { text: 'It decreases throughput', isCorrect: false },
      { text: 'It improves throughput but may raise latency', isCorrect: true },
      { text: 'It has no effect', isCorrect: false },
    ]},
    { question: 'What is continuous batching?', options: [
      { text: 'Processing all requests at once', isCorrect: false },
      { text: 'Dynamically adding new requests to an in-flight batch', isCorrect: true },
      { text: 'A type of data parallelism', isCorrect: false },
    ]},
  ],
  // Ch 9: Parallelism Strategies
  [
    { question: 'What does tensor parallelism split across GPUs?', options: [
      { text: 'Training data batches', isCorrect: false },
      { text: 'Weight matrices', isCorrect: true },
      { text: 'Input sequences', isCorrect: false },
    ]},
    { question: 'What is pipeline parallelism?', options: [
      { text: 'Running multiple models simultaneously', isCorrect: false },
      { text: 'Assigning different layers to different GPUs', isCorrect: true },
      { text: 'Splitting the vocabulary across GPUs', isCorrect: false },
    ]},
    { question: 'What is 3D parallelism?', options: [
      { text: 'Using 3D GPUs', isCorrect: false },
      { text: 'Combining data, tensor, and pipeline parallelism', isCorrect: true },
      { text: 'A visualization technique', isCorrect: false },
    ]},
  ],
  // Ch 10: Quantization & Model Compression
  [
    { question: 'What is the primary benefit of quantization?', options: [
      { text: 'Improved translation quality', isCorrect: false },
      { text: 'Reduced memory footprint and faster inference', isCorrect: true },
      { text: 'Better tokenization', isCorrect: false },
    ]},
    { question: 'What does INT8 quantization do?', options: [
      { text: 'Increases model precision', isCorrect: false },
      { text: 'Represents weights using 8-bit integers instead of 32-bit floats', isCorrect: true },
      { text: 'Doubles the model size', isCorrect: false },
    ]},
    { question: 'What is the difference between PTQ and QAT?', options: [
      { text: 'PTQ is applied after training; QAT incorporates quantization during training', isCorrect: true },
      { text: 'They are the same thing', isCorrect: false },
      { text: 'QAT is faster than PTQ', isCorrect: false },
    ]},
  ],
  // Ch 11: Inference Engines
  [
    { question: 'What is PagedAttention in vLLM?', options: [
      { text: 'A training technique', isCorrect: false },
      { text: 'OS-style paging for KV-cache memory management', isCorrect: true },
      { text: 'A type of attention head', isCorrect: false },
    ]},
    { question: 'What is a key advantage of TensorRT-LLM?', options: [
      { text: 'Works on any hardware', isCorrect: false },
      { text: 'Maximum NVIDIA Tensor Core utilization', isCorrect: true },
      { text: 'Simplest setup process', isCorrect: false },
    ]},
    { question: 'What does an inference engine bridge?', options: [
      { text: 'Training data and test data', isCorrect: false },
      { text: 'Model weights and production serving', isCorrect: true },
      { text: 'Source and target languages', isCorrect: false },
    ]},
  ],
  // Ch 12: Evaluation & Quality Metrics
  [
    { question: 'What does the BLEU metric measure?', options: [
      { text: 'Translation speed', isCorrect: false },
      { text: 'N-gram overlap between translation and reference', isCorrect: true },
      { text: 'Model size', isCorrect: false },
    ]},
    { question: 'What is COMET?', options: [
      { text: 'A tokenization algorithm', isCorrect: false },
      { text: 'A neural reference-based evaluation metric', isCorrect: true },
      { text: 'A type of transformer layer', isCorrect: false },
    ]},
    { question: 'What does MQM stand for in human evaluation?', options: [
      { text: 'Machine Quality Measurement', isCorrect: false },
      { text: 'Multidimensional Quality Metrics', isCorrect: true },
      { text: 'Model Quantization Method', isCorrect: false },
    ]},
  ],
  // Ch 13: Hardware & Deployment
  [
    { question: 'What three components consume GPU memory during inference?', options: [
      { text: 'CPU, RAM, and disk', isCorrect: false },
      { text: 'Model weights, KV-cache, and activations', isCorrect: true },
      { text: 'Training data, gradients, and optimizer states', isCorrect: false },
    ]},
    { question: 'What is the advantage of NVLink over PCIe for multi-GPU setups?', options: [
      { text: 'Lower cost', isCorrect: false },
      { text: 'Higher bandwidth for inter-GPU communication', isCorrect: true },
      { text: 'Better power efficiency', isCorrect: false },
    ]},
    { question: 'Which metric measures time to first token?', options: [
      { text: 'TPOT', isCorrect: false },
      { text: 'TTFT', isCorrect: true },
      { text: 'BLEU', isCorrect: false },
    ]},
  ],
];

const courseId = 'nmt-course-001';

async function migrate() {
  console.log('🔄 Starting assessment migration...\n');

  const now = new Date().toISOString();
  let totalQuestions = 0;

  for (let chapterIndex = 0; chapterIndex < chapterAssessments.length; chapterIndex++) {
    const assessments = chapterAssessments[chapterIndex];
    if (assessments.length === 0) continue;

    const chapterId = `chapter-${String(chapterIndex + 1).padStart(2, '0')}`;
    const chapterData = {};

    for (let qi = 0; qi < assessments.length; qi++) {
      const a = assessments[qi];
      const questionId = `assessment-ch${chapterIndex + 1}-q${qi + 1}`;

      // Convert options from array to object keyed by option ID
      const options = {};
      for (let oi = 0; oi < a.options.length; oi++) {
        const optId = `opt-ch${chapterIndex + 1}-q${qi + 1}-${oi}`;
        options[optId] = {
          text: a.options[oi].text,
          isCorrect: a.options[oi].isCorrect,
        };
      }

      chapterData[questionId] = {
        id: questionId,
        question: a.question,
        options,
        createdAt: now,
        updatedAt: now,
      };

      totalQuestions++;
    }

    await db.ref(`assessments/${courseId}/${chapterId}`).set(chapterData);
    console.log(`  ✓ ${chapterId}: ${assessments.length} questions`);
  }

  console.log(`\n✅ Migration complete! ${totalQuestions} questions across ${chapterAssessments.length} chapters.`);
  process.exit(0);
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
