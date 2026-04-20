import { useState } from 'react';
import { validateAssessment } from '../utils/assessmentUtils.js';
import '../styles/pages.css';

export default function QuestionForm({ question, onSave, onCancel }) {
  const isEdit = !!question;

  const [questionText, setQuestionText] = useState(
    isEdit ? question.question : ''
  );

  // Convert object-keyed options to array for editing
  const initialOptions = isEdit
    ? Object.entries(question.options).map(([id, opt]) => ({
        id,
        text: opt.text,
        isCorrect: opt.isCorrect,
      }))
    : [
        { id: 'new-1', text: '', isCorrect: true },
        { id: 'new-2', text: '', isCorrect: false },
      ];

  const [options, setOptions] = useState(initialOptions);
  const [errors, setErrors] = useState([]);

  function handleOptionTextChange(index, text) {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text } : opt))
    );
  }

  function handleCorrectChange(index) {
    setOptions((prev) =>
      prev.map((opt, i) => ({ ...opt, isCorrect: i === index }))
    );
  }

  function handleAddOption() {
    setOptions((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, text: '', isCorrect: false },
    ]);
  }

  function handleRemoveOption(index) {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // If we removed the correct option, mark the first one as correct
      if (!updated.some((o) => o.isCorrect) && updated.length > 0) {
        updated[0].isCorrect = true;
      }
      return updated;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Build options object for validation
    const optionsObj = {};
    for (const opt of options) {
      optionsObj[opt.id] = { text: opt.text, isCorrect: opt.isCorrect };
    }

    const data = { question: questionText, options: optionsObj };
    const validation = validateAssessment(data);

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);

    // Pass back with id if editing
    const saveData = { ...data };
    if (isEdit) {
      saveData.id = question.id;
      saveData.createdAt = question.createdAt;
    }
    onSave(saveData);
  }

  return (
    <div className="form-modal" style={{ maxWidth: '560px' }}>
      <h2>{isEdit ? 'Edit Question' : 'Add Question'}</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="question-text">Question</label>
          <input
            id="question-text"
            type="text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Enter question text"
          />
        </div>

        <div className="form-group">
          <label>Options <span style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: 400 }}>(select the correct answer)</span></label>
          {options.map((opt, index) => (
            <div
              key={opt.id}
              className={`question-option-row ${opt.isCorrect ? 'correct' : ''}`}
            >
              <label className="question-radio-label" title="Mark as correct answer">
                <input
                  type="radio"
                  name="correct-option"
                  checked={opt.isCorrect}
                  onChange={() => handleCorrectChange(index)}
                />
                <span className="question-radio-indicator" />
              </label>
              <input
                type="text"
                className="question-option-input"
                value={opt.text}
                onChange={(e) => handleOptionTextChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemoveOption(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleAddOption}
            style={{ marginTop: '8px' }}
          >
            + Add Option
          </button>
        </div>

        {errors.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            {errors.map((err, i) => (
              <div key={i} className="field-error">
                {err}
              </div>
            ))}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? 'Save Changes' : 'Add Question'}
          </button>
        </div>
      </form>
    </div>
  );
}
