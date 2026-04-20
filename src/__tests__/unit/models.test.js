import { describe, it, expect } from 'vitest';
import {
  generateId,
  createUser,
  createCourse,
  createChapter,
  createAssessment,
  createExercise,
  createAssignment,
  createProgressRecord,
} from '../../models/index.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

describe('createUser', () => {
  it('creates a user with all required fields', () => {
    const user = createUser({ name: 'Alice', email: 'alice@example.com', password: 'pass123', role: 'learner' });
    expect(user).toMatchObject({ name: 'Alice', email: 'alice@example.com', password: 'pass123', role: 'learner' });
    expect(user.id).toBeDefined();
  });
});

describe('createCourse', () => {
  it('creates a course with defaults', () => {
    const course = createCourse({ title: 'ML 101', description: 'Intro to ML' });
    expect(course).toMatchObject({ title: 'ML 101', description: 'Intro to ML', chapters: [] });
    expect(course.id).toBeDefined();
    expect(course.createdAt).toBeDefined();
  });
});

describe('createChapter', () => {
  it('creates a chapter with defaults', () => {
    const ch = createChapter({ courseId: 'c1', sequenceOrder: 1, title: 'Ch1', contentBody: '# Hello' });
    expect(ch).toMatchObject({ courseId: 'c1', sequenceOrder: 1, title: 'Ch1', contentBody: '# Hello', assessments: [], exercises: [] });
    expect(ch.id).toBeDefined();
  });
});

describe('createAssessment', () => {
  it('creates an assessment with options that have generated ids', () => {
    const a = createAssessment({
      chapterId: 'ch1',
      question: 'What is 1+1?',
      options: [
        { text: '2', isCorrect: true },
        { text: '3', isCorrect: false },
      ],
    });
    expect(a.question).toBe('What is 1+1?');
    expect(a.options).toHaveLength(2);
    expect(a.options[0].id).toBeDefined();
    expect(a.options[0].isCorrect).toBe(true);
  });
});

describe('createExercise', () => {
  it('creates an exercise with default submissionType', () => {
    const e = createExercise({ chapterId: 'ch1', title: 'Ex1', instructions: 'Do something' });
    expect(e).toMatchObject({ chapterId: 'ch1', title: 'Ex1', instructions: 'Do something', submissionType: 'text' });
    expect(e.id).toBeDefined();
  });
});

describe('createAssignment', () => {
  it('creates an assignment with defaults', () => {
    const a = createAssignment({ learnerId: 'l1', courseId: 'c1' });
    expect(a).toMatchObject({ learnerId: 'l1', courseId: 'c1', status: 'not_started', targetCompletionDate: null });
    expect(a.id).toBeDefined();
    expect(a.assignedAt).toBeDefined();
  });
});

describe('createProgressRecord', () => {
  it('creates a progress record with defaults', () => {
    const p = createProgressRecord({ learnerId: 'l1', courseId: 'c1' });
    expect(p).toEqual({
      learnerId: 'l1',
      courseId: 'c1',
      completedChapterIds: [],
      assessmentResults: {},
      exerciseSubmissions: {},
    });
  });
});
