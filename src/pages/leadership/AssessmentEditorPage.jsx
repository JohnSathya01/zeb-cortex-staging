import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import QuestionForm from '../../components/QuestionForm.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const WORKER_URL = import.meta.env.VITE_MAILER_URL;
const GEN_PHRASES = ['Generating…', 'Crafting questions…', 'Thinking…', 'Building MCQs…', 'Designing assessments…'];

export default function AssessmentEditorPage() {
  const { courseId, chapterId } = useParams();
  const { getAssessments, saveAssessment, deleteAssessment } = useData();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPhrase, setAiPhrase] = useState(GEN_PHRASES[0]);
  const [aiGenerated, setAiGenerated] = useState([]);
  const [aiError, setAiError] = useState(null);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    loadQuestions();
  }, [courseId, chapterId]);

  useEffect(() => {
    if (!aiLoading) return;
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % GEN_PHRASES.length; setAiPhrase(GEN_PHRASES[i]); }, 800);
    return () => clearInterval(t);
  }, [aiLoading]);

  async function loadQuestions() {
    try {
      const data = await getAssessments(courseId, chapterId);
      setQuestions(data);
    } catch { /* handle */ } finally { setLoading(false); }
  }

  async function handleAIGenerate() {
    if (!aiTopic.trim() || aiLoading) return;
    setAiLoading(true);
    setAiGenerated([]);
    setAiError(null);
    setAiPhrase(GEN_PHRASES[0]);
    try {
      const res = await fetch(`${WORKER_URL}/ai/generate-assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic, count: aiCount }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Generation failed');
      setAiGenerated(data.assessments || []);
      if (!data.assessments?.length) setAiError('AI returned no questions. Try a more specific topic.');
    } catch (err) {
      setAiError(err.message || 'Generation failed. Try again.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAddGenerated(q, idx) {
    setAddingId(idx);
    try {
      // Convert to QuestionForm format: options as object {opt1: {text, isCorrect}, ...}
      const optionsObj = {};
      q.options.forEach((opt, i) => { optionsObj[`opt${i + 1}`] = { text: opt.text, isCorrect: opt.isCorrect }; });
      await saveAssessment(courseId, chapterId, { question: q.question, options: optionsObj });
      setAiGenerated((prev) => prev.filter((_, i) => i !== idx));
      await loadQuestions();
    } catch { /* handle */ } finally {
      setAddingId(null);
    }
  }

  function handleAddClick() { setEditingQuestion(null); setShowForm(true); }
  function handleEditClick(question) { setEditingQuestion(question); setShowForm(true); }
  async function handleSave(questionData) {
    await saveAssessment(courseId, chapterId, questionData);
    setShowForm(false); setEditingQuestion(null);
    await loadQuestions();
  }
  function handleCancel() { setShowForm(false); setEditingQuestion(null); }
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
          <Link to="/leadership/courses" className="back-link">← Back to Courses</Link>
          <h1>Assessment Editor — {chapterId}</h1>
        </div>
        <button className="btn btn-primary" onClick={handleAddClick}>Add Question</button>
      </div>

      {/* ── AI Generation Panel ────────────────────────────────────────────── */}
      <div className="ai-gen-section">
        <button className="ai-gen-toggle" onClick={() => { setAiOpen(!aiOpen); setAiGenerated([]); setAiError(null); }}>
          <span className="ai-gen-toggle-icon">✦</span>
          Generate with AI
          <span className="ai-gen-toggle-arrow">{aiOpen ? '▲' : '▼'}</span>
        </button>

        {aiOpen && (
          <div className="ai-gen-body">
            <div className="ai-gen-controls">
              <input
                className="ai-gen-input"
                type="text"
                placeholder="Describe the topic… e.g. GPU memory architecture and VRAM"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
              />
              <select
                className="ai-gen-count"
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
              >
                {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} question{n > 1 ? 's' : ''}</option>)}
              </select>
              <button
                className="ai-gen-btn"
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiTopic.trim()}
              >
                {aiLoading ? (
                  <><span className="ai-gen-spinner" />{aiPhrase}</>
                ) : 'Generate'}
              </button>
            </div>

            {aiError && <div className="ai-gen-error">{aiError}</div>}

            {aiGenerated.length > 0 && (
              <div className="ai-gen-results">
                {aiGenerated.map((q, idx) => (
                  <div key={idx} className="ai-gen-card">
                    <div className="ai-gen-card-q">{q.question}</div>
                    <ul className="ai-gen-options">
                      {q.options.map((opt, oi) => (
                        <li key={oi} className={opt.isCorrect ? 'ai-gen-opt-correct' : ''}>
                          {opt.isCorrect ? '✓' : '○'} {opt.text}
                        </li>
                      ))}
                    </ul>
                    <button
                      className="ai-gen-add-btn"
                      onClick={() => handleAddGenerated(q, idx)}
                      disabled={addingId === idx}
                    >
                      {addingId === idx ? 'Adding…' : '+ Add to Chapter'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="empty-state">
          <p>No assessment questions for this chapter yet.</p>
          <button className="btn btn-primary" onClick={handleAddClick}>Add Question</button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>#</th><th>Question</th><th>Options</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {questions.map((q, index) => (
              <tr key={q.id}>
                <td>{index + 1}</td>
                <td>{q.question}</td>
                <td>{Object.keys(q.options).length}</td>
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleEditClick(q)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(q)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="form-overlay" onClick={handleCancel}>
          <div onClick={(e) => e.stopPropagation()}>
            <QuestionForm question={editingQuestion} onSave={handleSave} onCancel={handleCancel} />
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to delete this question?</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
