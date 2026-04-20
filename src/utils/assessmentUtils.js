/**
 * Validates an assessment question data object.
 * @param {object} data - Assessment data with question, options
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssessment(data) {
  const errors = [];

  if (!data.question || data.question.trim() === '') {
    errors.push('Question text is required');
  }

  const options = Object.values(data.options || {});
  if (options.length < 2) {
    errors.push('At least 2 options are required');
  }

  for (const [i, opt] of options.entries()) {
    if (!opt.text || opt.text.trim() === '') {
      errors.push(`Option ${i + 1} text is required`);
    }
  }

  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    errors.push('Exactly one option must be marked as correct');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds an answer review array from assessment questions and a learner's result.
 * @param {Array} assessmentQuestions - Array of questions with object-keyed options
 * @param {object} assessmentResult - Result with answers map of questionId → optionId
 * @returns {Array} Array of review objects
 */
export function buildAnswerReview(assessmentQuestions, assessmentResult) {
  const answers = assessmentResult?.answers || {};
  const reviews = [];

  for (const question of assessmentQuestions) {
    const selectedOptionId = answers[question.id] || null;
    const correctOption = Object.entries(question.options)
      .find(([, opt]) => opt.isCorrect);
    const correctOptionId = correctOption ? correctOption[0] : null;

    reviews.push({
      questionId: question.id,
      questionText: question.question,
      selectedOptionId,
      selectedOptionText: selectedOptionId
        ? (question.options[selectedOptionId]?.text ?? '(deleted option)')
        : '(no answer)',
      correctOptionId,
      correctOptionText: correctOption ? correctOption[1].text : '(unknown)',
      isCorrect: selectedOptionId !== null && selectedOptionId === correctOptionId,
    });
  }

  return reviews;
}
