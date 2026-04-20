import React, { useState } from 'react';
import '../styles/components.css';

export default function ExerciseCard({ exercise, submission, onSubmit, disabled }) {
  const [text, setText] = useState('');

  if (!exercise) return null;

  const isSubmitted = !!submission;

  const handleSubmit = () => {
    if (text.trim() && onSubmit) {
      onSubmit(exercise.id, text);
      setText('');
    }
  };

  return (
    <div className="exercise-card">
      <h4 className="exercise-title">{exercise.title}</h4>
      <p className="exercise-instructions">{exercise.instructions}</p>

      {isSubmitted ? (
        <div className="exercise-submitted">
          <div className="exercise-confirmation">✓ Exercise submitted</div>
          <div className="exercise-submission-text">{submission.text}</div>
          <div className="exercise-timestamp">
            Submitted: {new Date(submission.submittedAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="exercise-form">
          <textarea
            className="exercise-textarea"
            placeholder="Enter your response..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            rows={5}
          />
          <button
            className="exercise-submit-btn"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
