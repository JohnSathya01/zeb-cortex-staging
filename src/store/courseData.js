import chapter01Raw from '../../Courses/neural-machine-translation/chapter-01-introduction-to-nmt.md?raw';
import chapter02Raw from '../../Courses/neural-machine-translation/chapter-02-tokens-and-tokenization.md?raw';
import chapter03Raw from '../../Courses/neural-machine-translation/chapter-03-translation-model-architectures.md?raw';
import chapter04Raw from '../../Courses/neural-machine-translation/chapter-04-encoder-decoder-architecture.md?raw';
import chapter05Raw from '../../Courses/neural-machine-translation/chapter-05-decoder-only-architecture.md?raw';
import chapter06Raw from '../../Courses/neural-machine-translation/chapter-06-tokenizers-model-comparison.md?raw';
import chapter07Raw from '../../Courses/neural-machine-translation/chapter-07-inference-pipeline.md?raw';
import chapter08Raw from '../../Courses/neural-machine-translation/chapter-08-concurrency-throughput-latency.md?raw';
import chapter09Raw from '../../Courses/neural-machine-translation/chapter-09-parallelism-strategies.md?raw';
import chapter10Raw from '../../Courses/neural-machine-translation/chapter-10-quantization-and-model-compression.md?raw';
import chapter11Raw from '../../Courses/neural-machine-translation/chapter-11-inference-engines.md?raw';
import chapter12Raw from '../../Courses/neural-machine-translation/chapter-12-evaluation-and-quality-metrics.md?raw';
import chapter13Raw from '../../Courses/neural-machine-translation/chapter-13-hardware-and-deployment.md?raw';

// Course 2: Test 2
import c2ch01Raw from '../../Courses/Course-2-test/chapter-01-introduction-to-nmt.md?raw';
import c2ch02Raw from '../../Courses/Course-2-test/chapter-02-tokens-and-tokenization.md?raw';
import c2ch03Raw from '../../Courses/Course-2-test/chapter-03-translation-model-architectures.md?raw';
import c2ch04Raw from '../../Courses/Course-2-test/chapter-04-encoder-decoder-architecture.md?raw';
import c2ch05Raw from '../../Courses/Course-2-test/chapter-05-decoder-only-architecture.md?raw';
import c2ch06Raw from '../../Courses/Course-2-test/chapter-06-tokenizers-model-comparison.md?raw';
import c2ch07Raw from '../../Courses/Course-2-test/chapter-07-inference-pipeline.md?raw';
import c2ch08Raw from '../../Courses/Course-2-test/chapter-08-concurrency-throughput-latency.md?raw';
import c2ch09Raw from '../../Courses/Course-2-test/chapter-09-parallelism-strategies.md?raw';
import c2ch10Raw from '../../Courses/Course-2-test/chapter-10-quantization-and-model-compression.md?raw';
import c2ch11Raw from '../../Courses/Course-2-test/chapter-11-inference-engines.md?raw';
import c2ch12Raw from '../../Courses/Course-2-test/chapter-12-evaluation-and-quality-metrics.md?raw';
import c2ch13Raw from '../../Courses/Course-2-test/chapter-13-hardware-and-deployment.md?raw';

import { parseMarkdownFile } from '../utils/markdownParser.js';
import {
  createCourse,
  createChapter,
  createAssessment,
  createExercise,
} from '../models/index.js';

const allChapterRaws = [
  chapter01Raw, chapter02Raw, chapter03Raw, chapter04Raw,
  chapter05Raw, chapter06Raw, chapter07Raw, chapter08Raw,
  chapter09Raw, chapter10Raw, chapter11Raw, chapter12Raw,
  chapter13Raw,
];

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

const chapterExercises = {
  0: [{ title: 'Compare Translation Approaches', instructions: 'Write a short comparison (3-5 sentences) of Rule-Based, Statistical, and Neural Machine Translation. Highlight one key strength and one key weakness of each approach.', submissionType: 'text' }],
  2: [{ title: 'Transformer Architecture Analysis', instructions: 'Explain in your own words why the attention mechanism is more effective than recurrence for handling long sentences in translation. Provide at least one concrete example.', submissionType: 'text' }],
  4: [{ title: 'Decoder-Only vs Encoder-Decoder', instructions: 'Compare decoder-only and encoder-decoder architectures for translation. When would you choose one over the other? Give a specific use case for each.', submissionType: 'text' }],
  6: [{ title: 'Inference Pipeline Design', instructions: 'Design a high-level inference pipeline for a multilingual translation service. Describe each stage from input to output and explain your choices.', submissionType: 'text' }],
  8: [{ title: 'Parallelism Strategy Selection', instructions: 'You need to deploy a 30B parameter translation model on a cluster of 8 GPUs. Which parallelism strategy (or combination) would you use and why?', submissionType: 'text' }],
  10: [{ title: 'Inference Engine Comparison', instructions: 'Compare vLLM and TensorRT-LLM for a production translation service. Consider ease of setup, performance, and hardware requirements.', submissionType: 'text' }],
  12: [{ title: 'Deployment Planning', instructions: 'Plan a GPU deployment for serving MADLAD-400 (10B variant) with a target latency of 200ms. Estimate memory requirements and choose appropriate hardware.', submissionType: 'text' }],
};

function buildCourse() {
  // Use deterministic IDs so they match across sessions and with the seed script
  const courseId = 'nmt-course-001';
  const course = {
    id: courseId,
    title: 'Neural Machine Translation',
    description: 'A comprehensive 13-chapter course covering the foundations of neural machine translation — from tokenization and transformer architectures to inference engines, quantization, and production deployment.',
    chapters: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const chapters = allChapterRaws.map((raw, index) => {
    const parsed = parseMarkdownFile(raw);
    const chapterId = `chapter-${String(index + 1).padStart(2, '0')}`;

    const assessments = (chapterAssessments[index] || []).map((a, qi) => ({
      id: `assessment-ch${index + 1}-q${qi + 1}`,
      chapterId,
      question: a.question,
      options: a.options.map((opt, oi) => ({
        id: `opt-ch${index + 1}-q${qi + 1}-${oi}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    }));

    const exercises = (chapterExercises[index] || []).map((e) => ({
      id: `exercise-ch${index + 1}`,
      chapterId,
      title: e.title,
      instructions: e.instructions,
      submissionType: e.submissionType,
    }));

    return {
      id: chapterId,
      courseId,
      sequenceOrder: index + 1,
      title: parsed.title,
      contentBody: parsed.contentBody,
      assessments,
      exercises,
    };
  });

  course.chapters = chapters;
  return course;
}

// Build once at import time and cache
let _courses = null;

function ensureCourses() {
  if (!_courses) {
    _courses = [buildCourse(), buildCourse2()];
  }
  return _courses;
}

function buildCourse2() {
  const courseId = 'nmt-course-002';
  const course = {
    id: courseId,
    title: 'test 2',
    description: 'A comprehensive 13-chapter course covering the foundations of neural machine translation — from tokenization and transformer architectures to inference engines, quantization, and production deployment.',
    chapters: [],
    createdAt: '2026-04-14T00:00:00.000Z',
  };

  const c2Raws = [
    c2ch01Raw, c2ch02Raw, c2ch03Raw, c2ch04Raw,
    c2ch05Raw, c2ch06Raw, c2ch07Raw, c2ch08Raw,
    c2ch09Raw, c2ch10Raw, c2ch11Raw, c2ch12Raw,
    c2ch13Raw,
  ];

  const chapters = c2Raws.map((raw, index) => {
    const parsed = parseMarkdownFile(raw);
    const chapterId = `c2-chapter-${String(index + 1).padStart(2, '0')}`;

    const assessments = (chapterAssessments[index] || []).map((a, qi) => ({
      id: `c2-assessment-ch${index + 1}-q${qi + 1}`,
      chapterId,
      question: a.question,
      options: a.options.map((opt, oi) => ({
        id: `c2-opt-ch${index + 1}-q${qi + 1}-${oi}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    }));

    const exercises = (chapterExercises[index] || []).map((e) => ({
      id: `c2-exercise-ch${index + 1}`,
      chapterId,
      title: e.title,
      instructions: e.instructions,
      submissionType: e.submissionType,
    }));

    return {
      id: chapterId,
      courseId,
      sequenceOrder: index + 1,
      title: parsed.title,
      contentBody: parsed.contentBody,
      assessments,
      exercises,
    };
  });

  course.chapters = chapters;
  return course;
}

export function getCourses() {
  return [...ensureCourses()];
}

export function getCourseById(id) {
  const courses = ensureCourses();
  const course = courses.find((c) => c.id === id);
  return course ? { ...course } : null;
}

export function createCourseRecord(data) {
  const courses = ensureCourses();
  const course = createCourse(data);
  courses.push(course);
  return { ...course };
}

export function updateCourse(id, data) {
  const courses = ensureCourses();
  const idx = courses.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  courses[idx] = { ...courses[idx], ...data, id };
  return { ...courses[idx] };
}

export function deleteCourse(id) {
  const courses = ensureCourses();
  const idx = courses.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  courses.splice(idx, 1);
  return true;
}

export function addChaptersToCourse(courseId, chapters) {
  const courses = ensureCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) return null;
  const course = courses[idx];
  const startOrder = course.chapters.length + 1;
  const newChapters = chapters.map((ch, i) =>
    createChapter({ ...ch, courseId, sequenceOrder: startOrder + i })
  );
  course.chapters = [...course.chapters, ...newChapters];
  return { ...course };
}

export function reorderChapters(courseId, orderedIds) {
  const courses = ensureCourses();
  const idx = courses.findIndex((c) => c.id === courseId);
  if (idx === -1) return null;
  const course = courses[idx];
  const chapterMap = new Map(course.chapters.map((ch) => [ch.id, ch]));
  course.chapters = orderedIds.map((id, i) => ({
    ...chapterMap.get(id),
    sequenceOrder: i + 1,
  }));
  return { ...course };
}
