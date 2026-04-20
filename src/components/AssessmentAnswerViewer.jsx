import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext.jsx';
import { buildAnswerReview } from '../utils/assessmentUtils.js';
import '../styles/pages.css';

export default function AssessmentAnswerViewer({ learnerId, courseId, chapterId, onClose }) {
  const { getProgress, getAssessments } = useData();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    loadData();
  }, [learnerId, courseId, chapterId]);

  async function loadData() {
    try {
      const [progress, questions] = await Promise.all([
        getProgress(learnerId, courseId),
        getAssessments(courseId, chapterId),
      ]);

      if (questions.length === 0) {
        setEmpty(true);
        setLoading(false);
        return;
      }

      const result = progress.assessmentResults[chapterId] || { answers: {} };
      const reviewData = buildAnswerReview(questions, result);
      setReviews(reviewData);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-overlay" onClick={onClose}>
      <div
        className="form-modal"
        style={{ maxWidth: '640px', maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Assessment Answers</h2>

        {loading && <div className="empty-state">Loading...</div>}

        {!loading && empty && (
          <div className="empty-state">
            No assessment questions found for this chapter.
          </div>
        )}

        {!loading && !empty && reviews.map((review) => (
          <div
            key={review.questionId}
            style={{
              padding: '14px 0',
              borderBottom: '1px solid var(--gray-200)',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>
              {review.questionText}
            </p>
            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>
                <span style={{ color: 'var(--gray-500)' }}>Learner's answer: </span>
                <span>{review.selectedOptionText}</span>
                {' '}
                <span style={{ fontWeight: 700 }}>
                  {review.isCorrect
                    ? '✓'
                    : '✗'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--gray-500)' }}>Correct answer: </span>
                <span>{review.correctOptionText}</span>
              </div>
            </div>
          </div>
        ))}

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
