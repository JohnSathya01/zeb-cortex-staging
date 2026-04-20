/**
 * Markdown parser for Zeb Cortex course content.
 *
 * Parses markdown files using the convention-based block format:
 *   # Chapter Title
 *   (content body)
 *   ## Assessment
 *   ### Q1: Question text?
 *   - [ ] Option A
 *   - [x] Option B (correct)
 *   ## Exercise
 *   ### Exercise 1: Title
 *   Instructions...
 *   **Submission Type:** text
 */

/**
 * Parses a raw markdown string into a structured chapter object.
 *
 * @param {string} markdownString - Raw markdown content
 * @returns {{
 *   title: string,
 *   contentBody: string,
 *   assessments: Array<{ question: string, options: Array<{ text: string, isCorrect: boolean }> }>,
 *   exercises: Array<{ title: string, instructions: string, submissionType: string }>
 * }}
 */
export function parseMarkdownFile(markdownString) {
  const lines = markdownString.split('\n');

  let title = '';
  let titleLineIndex = -1;
  let assessmentSectionStart = -1;
  let exerciseSectionStart = -1;

  // Find the top-level heading (first # line)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^#\s+/.test(trimmed) && !(/^##/.test(trimmed))) {
      title = trimmed.replace(/^#\s+/, '').trim();
      titleLineIndex = i;
      break;
    }
  }

  // Find ## Assessment and ## Exercise section starts
  for (let i = titleLineIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+Assessment\s*$/i.test(trimmed) && assessmentSectionStart === -1) {
      assessmentSectionStart = i;
    } else if (/^##\s+Exercise\s*$/i.test(trimmed) && exerciseSectionStart === -1) {
      exerciseSectionStart = i;
    }
  }

  // Extract content body: between title and first special section
  const contentBodyEnd = getContentBodyEnd(assessmentSectionStart, exerciseSectionStart, lines.length);
  const contentBodyLines = titleLineIndex >= 0
    ? lines.slice(titleLineIndex + 1, contentBodyEnd)
    : [];
  const contentBody = trimContentBody(contentBodyLines.join('\n'));

  // Parse assessments
  const assessments = assessmentSectionStart >= 0
    ? parseAssessments(lines, assessmentSectionStart, exerciseSectionStart > assessmentSectionStart ? exerciseSectionStart : lines.length)
    : [];

  // Parse exercises
  const exercises = exerciseSectionStart >= 0
    ? parseExercises(lines, exerciseSectionStart, assessmentSectionStart > exerciseSectionStart ? assessmentSectionStart : lines.length)
    : [];

  return { title, contentBody, assessments, exercises };
}


/**
 * Determines where the content body ends (first special section or end of file).
 */
function getContentBodyEnd(assessmentStart, exerciseStart, totalLines) {
  const candidates = [assessmentStart, exerciseStart].filter((i) => i >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : totalLines;
}

/**
 * Trims leading/trailing blank lines from content body while preserving internal structure.
 */
function trimContentBody(text) {
  return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Parses the ## Assessment section into an array of assessment objects.
 *
 * Expected format:
 *   ### Q1: Question text?
 *   - [ ] Option A
 *   - [x] Option B (correct)
 */
function parseAssessments(lines, sectionStart, sectionEnd) {
  const assessments = [];
  let currentQuestion = null;

  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const trimmed = lines[i].trim();

    // New question heading: ### Q1: Question text?
    if (/^###\s+/.test(trimmed)) {
      if (currentQuestion) {
        assessments.push(currentQuestion);
      }
      const questionText = trimmed.replace(/^###\s+/, '').trim();
      // Strip the "Q1: " or "Qn: " prefix if present
      const cleanedQuestion = questionText.replace(/^Q\d+:\s*/, '').trim();
      currentQuestion = {
        question: cleanedQuestion,
        options: [],
      };
      continue;
    }

    // Option line: - [ ] text or - [x] text
    const optionMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (optionMatch && currentQuestion) {
      const isCorrect = optionMatch[1].toLowerCase() === 'x';
      const text = optionMatch[2].trim();
      currentQuestion.options.push({ text, isCorrect });
    }
  }

  // Push the last question
  if (currentQuestion) {
    assessments.push(currentQuestion);
  }

  return assessments;
}

/**
 * Parses the ## Exercise section into an array of exercise objects.
 *
 * Expected format:
 *   ### Exercise 1: Exercise Title
 *   Instructions text...
 *   **Submission Type:** text
 */
function parseExercises(lines, sectionStart, sectionEnd) {
  const exercises = [];
  let currentExercise = null;
  let instructionLines = [];

  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const trimmed = lines[i].trim();

    // New exercise heading: ### Exercise N: Title
    if (/^###\s+/.test(trimmed)) {
      if (currentExercise) {
        currentExercise.instructions = trimContentBody(instructionLines.join('\n'));
        exercises.push(currentExercise);
      }
      const headingText = trimmed.replace(/^###\s+/, '').trim();
      // Strip "Exercise N: " prefix if present
      const exerciseTitle = headingText.replace(/^Exercise\s+\d+:\s*/i, '').trim();
      currentExercise = {
        title: exerciseTitle,
        instructions: '',
        submissionType: 'text', // default
      };
      instructionLines = [];
      continue;
    }

    // Submission type line: **Submission Type:** value
    const submissionMatch = trimmed.match(/^\*\*Submission\s+Type:\*\*\s*(.+)$/i);
    if (submissionMatch && currentExercise) {
      currentExercise.submissionType = submissionMatch[1].trim();
      continue;
    }

    // Accumulate instruction lines
    if (currentExercise) {
      instructionLines.push(lines[i]);
    }
  }

  // Push the last exercise
  if (currentExercise) {
    currentExercise.instructions = trimContentBody(instructionLines.join('\n'));
    exercises.push(currentExercise);
  }

  return exercises;
}


/**
 * Validates the structure of a parsed markdown chapter object.
 *
 * Checks:
 * - At least one heading (title is non-empty)
 * - Each assessment has at least 2 options
 * - Each assessment has at least one correct answer
 *
 * @param {{ title: string, contentBody: string, assessments: Array, exercises: Array }} parsed
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMarkdownStructure(parsed) {
  const errors = [];

  // Check for at least one heading (title)
  if (!parsed.title || parsed.title.trim() === '') {
    errors.push('Missing top-level heading');
  }

  // Validate each assessment
  parsed.assessments.forEach((assessment, index) => {
    const qLabel = `Assessment Q${index + 1}`;

    if (assessment.options.length < 2) {
      errors.push(`${qLabel} has fewer than 2 options`);
    }

    const hasCorrect = assessment.options.some((opt) => opt.isCorrect);
    if (!hasCorrect) {
      errors.push(`${qLabel} has no correct answer marked`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
