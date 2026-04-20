import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import QuestionForm from '../../components/QuestionForm.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function AssessmentEditorPage() {
  const { courseId, chapterId } = useParams();
  const { getAssessments, saveAssessment, deleteAssessment } = useData();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadQuestions();
  }, [courseId, chapterId]);

  async function loadQuestions() {
    try {
      const data = await getAssessments(courseId, chapterId);
      setQuestions(data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  function handleAddClick() {
    setEditingQuestion(null);
    setShowForm(true);
  }

  function handleEditClick(question) {
    setEditingQuestion(question);
    setShowForm(true);
  }

  async function handleSave(questionData) {
    await saveAssessment(courseId, chapterId, questionData);
    setShowForm(false);
    setEditingQuestion(null);
    await loadQuestions();
  }

  function handleCancel() {
    setShowForm(false);
    setEditingQuestion(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    await deleteAssessment(courseId, chapterId, deleteTarget.id);
    setDeleteTarget(null);
    await loadQuestions();
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/leadership/courses" className="back-link">
            ← Back to Courses
          </Link>
          <h1>Assessment Editor — {chapterId}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleAddClick}>
          Add Question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="empty-state">
          <p>No assessment questions for this chapter yet.</p>
          <button className="btn btn-primary" onClick={handleAddClick}>
            Add Question
          </button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Options</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, index) => (
              <tr key={q.id}>
                <td>{index + 1}</td>
                <td>{q.question}</td>
                <td>{Object.keys(q.options).length}</td>
                <td>
                  <div className="actions-cell">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEditClick(q)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget(q)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Question Form Modal */}
      {showForm && (
        <div className="form-overlay" onClick={handleCancel}>
          <div onClick={(e) => e.stopPropagation()}>
            <QuestionForm
              question={editingQuestion}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>
              Are you sure you want to delete this question?
            </p>
            <div className="form-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
