import React from 'react';
import '../styles/components.css';

export default function AssessmentCard({ assessment, selectedAnswer, onSelect, submitted, disabled }) {
  if (!assessment) return null;

  const getOptionClass = (option) => {
    let cls = 'assessment-option';
    if (selectedAnswer === option.id) cls += ' selected';
    if (submitted) {
      if (option.isCorrect) cls += ' correct';
      else if (selectedAnswer === option.id && !option.isCorrect) cls += ' incorrect';
    }
    return cls;
  };

  return (
    <div className="assessment-card">
      <p className="assessment-question">{assessment.question}</p>
      <div className="assessment-options">
        {assessment.options.map((option) => (
          <label key={option.id} className={getOptionClass(option)}>
            <input
              type="radio"
              name={`assessment-${assessment.id}`}
              value={option.id}
              checked={selectedAnswer === option.id}
              onChange={() => onSelect(assessment.id, option.id)}
              disabled={disabled || submitted}
              className="assessment-radio"
            />
            <span className="radio-indicator" />
            <span className="option-text">{option.text}</span>
            {submitted && option.isCorrect && <span className="feedback-icon">✓</span>}
            {submitted && selectedAnswer === option.id && !option.isCorrect && (
              <span className="feedback-icon incorrect-icon">✗</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
