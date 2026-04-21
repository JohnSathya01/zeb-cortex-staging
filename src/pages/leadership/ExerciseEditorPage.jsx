import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function ExerciseEditorPage() {
  const { courseId, chapterId } = useParams();
  const { getCourseById, getExerciseRules, saveExerciseRule } = useData();

  const [chapter, setChapter] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [rules, setRules] = useState({});
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [courseId, chapterId]);

  async function load() {
    setLoading(true);
    const course = await getCourseById(courseId);
    const ch = course?.chapters.find((c) => c.id === chapterId);
    setChapter(ch);
    setExercises(ch?.exercises || []);
    const r = await getExerciseRules(courseId, chapterId);
    setRules(r);
    // Init drafts from existing rules
    const d = {};
    (ch?.exercises || []).forEach((ex) => {
      d[ex.id] = r[ex.id]
        ? { pattern: r[ex.id].pattern, flags: r[ex.id].flags || 'i', hint: r[ex.id].hint || '', explanation: r[ex.id].explanation || '' }
        : { pattern: '', flags: 'i', hint: '', explanation: '' };
    });
    setDrafts(d);
    setLoading(false);
  }

  function updateDraft(exId, field, value) {
    setDrafts((prev) => ({ ...prev, [exId]: { ...prev[exId], [field]: value } }));
    setSaved((prev) => ({ ...prev, [exId]: false }));
  }

  async function handleSave(exId) {
    setSaving((prev) => ({ ...prev, [exId]: true }));
    try {
      await saveExerciseRule(courseId, chapterId, exId, drafts[exId]);
      setSaved((prev) => ({ ...prev, [exId]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [exId]: false })), 2000);
    } finally {
      setSaving((prev) => ({ ...prev, [exId]: false }));
    }
  }

  function testRegex(exId) {
    const d = drafts[exId];
    if (!d?.pattern) return null;
    try {
      new RegExp(d.pattern, d.flags);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/leadership/courses" className="back-link" style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
            ← Back to Courses
          </Link>
          <h1>Exercise Editor</h1>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
            {chapter?.title} · <span style={{ fontFamily: 'monospace' }}>{chapterId}</span>
          </div>
        </div>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">No exercises defined in this chapter's markdown.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {exercises.map((ex) => {
            const draft = drafts[ex.id] || {};
            const regexCheck = draft.pattern ? testRegex(ex.id) : null;
            return (
              <div key={ex.id} className="analytics-course-card" style={{ gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)' }}>{ex.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontFamily: 'monospace', marginTop: '2px' }}>{ex.id}</div>
                  {ex.instructions && (
                    <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '6px', lineHeight: 1.5 }}>{ex.instructions}</div>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Regex Pattern <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(leave blank for open-ended)</span></label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={draft.pattern || ''}
                      onChange={(e) => updateDraft(ex.id, 'pattern', e.target.value)}
                      placeholder="e.g. ^hello|^hi"
                      style={{ fontFamily: 'monospace', flex: 1 }}
                    />
                    <input
                      type="text"
                      value={draft.flags || 'i'}
                      onChange={(e) => updateDraft(ex.id, 'flags', e.target.value)}
                      placeholder="flags"
                      style={{ fontFamily: 'monospace', width: '64px' }}
                    />
                  </div>
                  {regexCheck && (
                    <div style={{ fontSize: '12px', marginTop: '4px', color: regexCheck.valid ? '#16a34a' : '#dc2626' }}>
                      {regexCheck.valid ? '✓ Valid regex' : `✕ ${regexCheck.error}`}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Hint <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(shown on wrong answer)</span></label>
                  <input
                    type="text"
                    value={draft.hint || ''}
                    onChange={(e) => updateDraft(ex.id, 'hint', e.target.value)}
                    placeholder="e.g. Try starting with a greeting word…"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Explanation <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(shown on correct answer)</span></label>
                  <input
                    type="text"
                    value={draft.explanation || ''}
                    onChange={(e) => updateDraft(ex.id, 'explanation', e.target.value)}
                    placeholder="e.g. Great! Your answer correctly begins with a greeting."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSave(ex.id)}
                    disabled={saving[ex.id]}
                  >
                    {saving[ex.id] ? 'Saving…' : saved[ex.id] ? '✓ Saved' : 'Save Rule'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
