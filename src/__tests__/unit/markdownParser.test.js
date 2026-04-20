import { describe, it, expect } from 'vitest';
import { parseMarkdownFile, validateMarkdownStructure } from '../../utils/markdownParser.js';

describe('parseMarkdownFile', () => {
  it('extracts title from top-level heading', () => {
    const md = '# My Chapter Title\n\nSome content here.';
    const result = parseMarkdownFile(md);
    expect(result.title).toBe('My Chapter Title');
  });

  it('extracts content body between title and special sections', () => {
    const md = '# Title\n\nParagraph one.\n\nParagraph two.\n\n## Assessment\n\n### Q1: Question?\n- [ ] A\n- [x] B';
    const result = parseMarkdownFile(md);
    expect(result.contentBody).toBe('Paragraph one.\n\nParagraph two.');
  });

  it('parses assessments with questions and options', () => {
    const md = [
      '# Title',
      '',
      'Content body.',
      '',
      '## Assessment',
      '',
      '### Q1: What is 2+2?',
      '- [ ] 3',
      '- [x] 4',
      '- [ ] 5',
      '',
      '### Q2: What color is the sky?',
      '- [x] Blue',
      '- [ ] Green',
    ].join('\n');

    const result = parseMarkdownFile(md);
    expect(result.assessments).toHaveLength(2);
    expect(result.assessments[0].question).toBe('What is 2+2?');
    expect(result.assessments[0].options).toHaveLength(3);
    expect(result.assessments[0].options[1]).toEqual({ text: '4', isCorrect: true });
    expect(result.assessments[0].options[0]).toEqual({ text: '3', isCorrect: false });
    expect(result.assessments[1].question).toBe('What color is the sky?');
    expect(result.assessments[1].options[0].isCorrect).toBe(true);
  });

  it('parses exercises with title, instructions, and submission type', () => {
    const md = [
      '# Title',
      '',
      'Content.',
      '',
      '## Exercise',
      '',
      '### Exercise 1: Build a Widget',
      'Create a widget that does something useful.',
      'Make sure it handles edge cases.',
      '**Submission Type:** text',
    ].join('\n');

    const result = parseMarkdownFile(md);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].title).toBe('Build a Widget');
    expect(result.exercises[0].instructions).toBe(
      'Create a widget that does something useful.\nMake sure it handles edge cases.'
    );
    expect(result.exercises[0].submissionType).toBe('text');
  });

  it('handles markdown with no assessment or exercise blocks', () => {
    const md = '# Chapter 1: Introduction\n\nThis is just content.\n\n## Section 1.1\n\nMore content here.';
    const result = parseMarkdownFile(md);
    expect(result.title).toBe('Chapter 1: Introduction');
    expect(result.assessments).toEqual([]);
    expect(result.exercises).toEqual([]);
    expect(result.contentBody).toContain('This is just content.');
    expect(result.contentBody).toContain('## Section 1.1');
  });

  it('handles both assessment and exercise sections together', () => {
    const md = [
      '# Full Chapter',
      '',
      'Body content here.',
      '',
      '## Assessment',
      '',
      '### Q1: Question?',
      '- [ ] Wrong',
      '- [x] Right',
      '',
      '## Exercise',
      '',
      '### Exercise 1: Do Something',
      'Instructions here.',
      '**Submission Type:** text',
    ].join('\n');

    const result = parseMarkdownFile(md);
    expect(result.title).toBe('Full Chapter');
    expect(result.contentBody).toBe('Body content here.');
    expect(result.assessments).toHaveLength(1);
    expect(result.exercises).toHaveLength(1);
  });

  it('handles empty markdown string', () => {
    const result = parseMarkdownFile('');
    expect(result.title).toBe('');
    expect(result.contentBody).toBe('');
    expect(result.assessments).toEqual([]);
    expect(result.exercises).toEqual([]);
  });

  it('handles exercise section before assessment section', () => {
    const md = [
      '# Title',
      '',
      'Content.',
      '',
      '## Exercise',
      '',
      '### Exercise 1: First Exercise',
      'Do this thing.',
      '**Submission Type:** text',
      '',
      '## Assessment',
      '',
      '### Q1: A question?',
      '- [x] Yes',
      '- [ ] No',
    ].join('\n');

    const result = parseMarkdownFile(md);
    expect(result.exercises).toHaveLength(1);
    expect(result.assessments).toHaveLength(1);
    expect(result.contentBody).toBe('Content.');
  });

  it('defaults exercise submissionType to text when not specified', () => {
    const md = [
      '# Title',
      '',
      '## Exercise',
      '',
      '### Exercise 1: No Type Specified',
      'Just instructions.',
    ].join('\n');

    const result = parseMarkdownFile(md);
    expect(result.exercises[0].submissionType).toBe('text');
  });
});

describe('validateMarkdownStructure', () => {
  it('returns valid for well-formed parsed content', () => {
    const parsed = {
      title: 'Chapter Title',
      contentBody: 'Some content.',
      assessments: [
        { question: 'Q?', options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: true }] },
      ],
      exercises: [],
    };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports error for missing title', () => {
    const parsed = { title: '', contentBody: '', assessments: [], exercises: [] };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing top-level heading');
  });

  it('reports error for assessment with fewer than 2 options', () => {
    const parsed = {
      title: 'Title',
      contentBody: '',
      assessments: [
        { question: 'Q?', options: [{ text: 'Only one', isCorrect: true }] },
      ],
      exercises: [],
    };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Assessment Q1 has fewer than 2 options');
  });

  it('reports error for assessment with no correct answer', () => {
    const parsed = {
      title: 'Title',
      contentBody: '',
      assessments: [
        { question: 'Q?', options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] },
      ],
      exercises: [],
    };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Assessment Q1 has no correct answer marked');
  });

  it('reports multiple errors for multiple invalid assessments', () => {
    const parsed = {
      title: 'Title',
      contentBody: '',
      assessments: [
        { question: 'Q1?', options: [{ text: 'A', isCorrect: false }] },
        { question: 'Q2?', options: [{ text: 'X', isCorrect: false }, { text: 'Y', isCorrect: false }] },
      ],
      exercises: [],
    };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3); // Q1 <2 options, Q1 no correct, Q2 no correct
  });

  it('returns valid for content with no assessments', () => {
    const parsed = { title: 'Title', contentBody: 'Content.', assessments: [], exercises: [] };
    const result = validateMarkdownStructure(parsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
