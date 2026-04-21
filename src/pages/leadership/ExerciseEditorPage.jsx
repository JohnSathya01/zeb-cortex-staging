import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const EMPTY = { title: '', prompt: '', pattern: '', flags: 'i', hint: '', explanation: '' };

export default function ExerciseEditorPage() {
  const { courseId, chapterId } = useParams();
  const { getCourseById, getExercises, saveExercise, deleteExercise } = useData();

  const [chapter, setChapter] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // null = add new
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { load(); }, [courseId, chapterId]);

  async function load() {
    setLoading(true);
    const course = await getCourseById(courseId);
    setChapter(course?.chapters.find((c) => c.id === chapterId) || null);
    const exs = await getExercises(courseId, chapterId);
    setExercises(exs);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(ex) {
    setEditing(ex);
    setForm({
      title: ex.title || '',
      prompt: ex.prompt || '',
      pattern: ex.pattern || '',
      flags: ex.flags || 'i',
      hint: ex.hint || '',
      explanation: ex.explanation || '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function regexValid() {
    if (!form.pattern) return null;
    try { new RegExp(form.pattern, form.flags); return true; }
    catch { return false; }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.prompt.trim()) return;
    setSaving(true);
    try {
      await saveExercise(courseId, chapterId, {
        ...(editing ? { id: editing.id } : {}),
        ...form,
        order: editing?.order ?? exercises.length,
      });
      await load();
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteExercise(courseId, chapterId, deleteTarget.id);
    setDeleteTarget(null);
    await load();
  }

  if (loading) return <PageLoader />;

  const rv = regexValid();

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/leadership/courses" className="back-link" style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            ← Back to Courses
          </Link>
          <h1>Exercise Editor</h1>
          {chapter && (
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
              {chapter.title} · <span style={{ fontFamily: 'monospace' }}>{chapterId}</span>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Exercise</button>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">
          No exercises yet. Click <strong>+ Add Exercise</strong> to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {exercises.map((ex, i) => (
            <div key={ex.id} className="analytics-course-card" style={{ gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '2px 7px', borderRadius: '99px' }}>#{i + 1}</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)' }}>{ex.title}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.5 }}>{ex.prompt}</div>
                  {ex.pattern && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <code style={{ fontSize: '12px', background: '#1e1e1e', color: '#c4e04e', padding: '2px 8px', borderRadius: '4px' }}>
                        /{ex.pattern}/{ex.flags}
                      </code>
                      {ex.hint && <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Hint: {ex.hint}</span>}
                    </div>
                  )}
                  {!ex.pattern && (
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px', display: 'block' }}>Open-ended (no regex)</span>
                  )}
                </div>
                <div className="actions-cell" style={{ flexShrink: 0, marginLeft: '16px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(ex)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(ex)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="form-overlay" onClick={closeForm}>
          <div className="form-modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Edit Exercise' : 'Add Exercise'}</h2>
            <form onSubmit={handleSave} noValidate>

              <div className="form-group">
                <label htmlFor="ex-title">Title</label>
                <input id="ex-title" type="text" placeholder="e.g. Write a greeting"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>

              <div className="form-group">
                <label htmlFor="ex-prompt">Question / Prompt <span style={{ color: 'var(--red-500)' }}>*</span></label>
                <textarea id="ex-prompt" rows={3} placeholder="e.g. Write a Python print statement that outputs 'Hello, World!'"
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  style={{ resize: 'vertical' }} />
              </div>

              <div className="form-group">
                <label>Regex Pattern <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(leave blank for open-ended)</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" placeholder={'e.g. print\\s*\\(Hello'} style={{ fontFamily: 'monospace', flex: 1 }}
                    value={form.pattern}
                    onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
                  <input type="text" placeholder="flags" style={{ fontFamily: 'monospace', width: '64px' }}
                    value={form.flags}
                    onChange={(e) => setForm({ ...form, flags: e.target.value })} />
                </div>
                {form.pattern && (
                  <div style={{ fontSize: '12px', marginTop: '4px', color: rv ? '#16a34a' : '#dc2626' }}>
                    {rv ? '✓ Valid regex' : '✕ Invalid regex'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="ex-hint">Hint <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(shown on wrong answer)</span></label>
                <input id="ex-hint" type="text" placeholder="e.g. Remember to use print() with parentheses"
                  value={form.hint}
                  onChange={(e) => setForm({ ...form, hint: e.target.value })} />
              </div>

              <div className="form-group">
                <label htmlFor="ex-explanation">Explanation <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(shown on correct answer)</span></label>
                <input id="ex-explanation" type="text" placeholder="e.g. Great! print() outputs text to the console."
                  value={form.explanation}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.prompt.trim() || (form.pattern && rv === false)}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Exercise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Delete exercise <strong>{deleteTarget.title || deleteTarget.prompt?.slice(0, 40)}</strong>?</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
