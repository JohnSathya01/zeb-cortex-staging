import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import { sendRiskAlertEmail, sendEscalationEmail } from '../../services/emailService.js';
import AssessmentAnswerViewer from '../../components/AssessmentAnswerViewer.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

function PointsCell({ pts }) {
  if (!pts) return <span style={{ color: '#9ca3af', fontSize: '12px' }}>--</span>;
  const color = pts.status === 'on_track' ? '#22c55e' : pts.status === 'at_risk' ? '#f59e0b' : '#ef4444';
  const label = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[pts.status] || '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '18px', fontWeight: 800, color }}>{pts.total}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#6b7280' }}>
        <span title="Timeline">T {pts.timeline ?? 0}</span>
        <span style={{ color: '#d1d5db' }}>|</span>
        <span title="AI Engagement">AI {pts.ai ?? 0}</span>
        <span style={{ color: '#d1d5db' }}>|</span>
        <span title="Reviewer Feedback">F {pts.reviewer ?? 0}</span>
      </div>
    </div>
  );
}

function getWeekId() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNo = Math.round(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function FeedbackModal({ row, mode, onClose, onSaved, getAIFeedbackScores, submitWeeklyFeedback, submitFinalFeedback, getReviewerFeedback }) {
  const weekId = getWeekId();
  const [feedbackTexts, setFeedbackTexts] = useState({ attitude: '', communication: '', business: '', technology: '' });
  const [scores, setScores] = useState(null);
  const [aiScores, setAiScores] = useState(null);
  const [phase, setPhase] = useState('write'); // write -> review -> locked
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { checkExisting(); }, []);

  async function checkExisting() {
    setLoading(true);
    try {
      const existing = await getReviewerFeedback(row.assignment.id);
      const fb = mode === 'final' ? existing.final : existing.weekly?.[weekId];
      if (fb) {
        setScores({ attitude: fb.attitude, communication: fb.communication, business: fb.business, technology: fb.technology });
        setAiScores(fb.aiSuggested || null);
        setPhase(fb.overridden ? 'locked' : 'review');
      }
    } catch { /* use defaults */ }
    setLoading(false);
  }

  async function handleAnalyze() {
    const combined = Object.values(feedbackTexts).filter(t => t.trim()).join(' ');
    if (!combined.trim()) { setError('Please write feedback in at least one area.'); return; }
    setAnalyzing(true);
    setError(null);
    const feedbackText = `Attitude: ${feedbackTexts.attitude || 'N/A'}\nCommunication: ${feedbackTexts.communication || 'N/A'}\nBusiness: ${feedbackTexts.business || 'N/A'}\nTechnology: ${feedbackTexts.technology || 'N/A'}`;
    try {
      const ai = await getAIFeedbackScores(row.assignment.id, row.assignment.learnerId, row.assignment.courseId, feedbackText);
      setAiScores(ai);
      setScores({ ...ai });
      setPhase('review');
    } catch {
      setError('Failed to analyze feedback. Please try again.');
    }
    setAnalyzing(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...scores, aiSuggested: aiScores, feedbackTexts };
      if (mode === 'final') {
        await submitFinalFeedback(row.assignment.id, payload);
      } else {
        await submitWeeklyFeedback(row.assignment.id, weekId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to save feedback');
    }
    setSaving(false);
  }

  const total = scores ? Math.round(((scores.attitude + scores.communication + scores.business + scores.technology) / 4) * 3) : 0;
  const aspects = [
    { key: 'attitude', label: 'Attitude' },
    { key: 'communication', label: 'Communication' },
    { key: 'business', label: 'Business' },
    { key: 'technology', label: 'Technology' },
  ];

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ marginBottom: '16px' }}>{mode === 'final' ? 'Final Feedback' : 'Weekly Feedback'} -- {row.learnerName}</h2>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
        ) : phase === 'write' ? (
          <>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              Write your feedback for each aspect. AI will analyze and assign scores.
            </p>
            {[
              { key: 'attitude', label: 'Attitude', placeholder: 'Consistency, timeliness, willingness to learn...' },
              { key: 'communication', label: 'Communication', placeholder: 'Interaction quality, responsiveness, clarity...' },
              { key: 'business', label: 'Business', placeholder: 'Domain understanding, assessment performance...' },
              { key: 'technology', label: 'Technology', placeholder: 'Technical skills, AI tool usage, exercise quality...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>{label}</label>
                <textarea
                  value={feedbackTexts[key]}
                  onChange={(e) => setFeedbackTexts(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--gray-300)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }}
                />
              </div>
            ))}
            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? 'Analyzing...' : 'Analyze with AI'}
              </button>
            </div>
          </>
        ) : (
          <>
            {phase === 'locked' && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                Scores have been adjusted and are now locked.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {aspects.map(({ key, label }) => (
                <div key={key} style={{ background: 'var(--gray-50)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-600)' }}>{label}</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gray-900)' }}>{scores[key]}</span>
                  </div>
                  <input
                    type="range" min="0" max="10" value={scores[key]}
                    disabled={phase === 'locked'}
                    onChange={(e) => setScores(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#7c3aed' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
                    <span>0</span>
                    {aiScores && <span>AI suggested: {aiScores[key]}</span>}
                    <span>10</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--gray-200)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-600)' }}>Reviewer Score</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: total >= 20 ? '#22c55e' : total >= 10 ? '#f59e0b' : '#ef4444' }}>{total}<span style={{ fontSize: '13px', fontWeight: 400, color: '#9ca3af' }}> / 30</span></span>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {phase !== 'locked' && (
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Submit Feedback'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EscalateModal({ row, user, onClose }) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('idle');

  async function handleEscalate() {
    setStatus('sending');
    try {
      await sendEscalationEmail({
        learnerId: row.assignment.learnerId,
        courseId: row.assignment.courseId,
        reviewerEmail: user.email,
        reviewerName: user.displayName || user.email,
        note,
      });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <h2>Escalate -- {row.learnerName}</h2>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '12px' }}>
          This will send an escalation email to leadership (john.sathya@zeb.co and Sivasaran.Sekaran@zeb.co) with you in CC.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note explaining the concern..."
          rows={4}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--gray-300)', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {status === 'sent' ? (
            <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600, alignSelf: 'center' }}>Escalation Sent</span>
          ) : (
            <button className="btn btn-primary" onClick={handleEscalate} disabled={status === 'sending'}
              style={{ background: '#ef4444', borderColor: '#ef4444' }}>
              {status === 'sending' ? 'Sending...' : status === 'error' ? 'Failed - Retry' : 'Escalate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewingPage() {
  const { user } = useAuth();
  const { getAssignments, getUsers, getCourses, getProgressAsReviewer, calculateCoursePoints,
    getReviewerFeedback, submitWeeklyFeedback, submitFinalFeedback, getAIFeedbackScores,
    loading: dataLoading } = useData();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [feedbackHistory, setFeedbackHistory] = useState(null);
  const [answerViewer, setAnswerViewer] = useState(null);
  const [alertStatus, setAlertStatus] = useState({});
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [escalateModal, setEscalateModal] = useState(null);

  useEffect(() => {
    if (user && !dataLoading) loadData();
  }, [user, dataLoading]);

  async function loadData() {
    try {
      const [assignments, users, courses] = await Promise.all([
        getAssignments(), getUsers(), getCourses(),
      ]);

      // Show learners where current user is reviewer, OR all if leadership
      const isLeadership = user.role === 'leadership';
      const myReviewing = isLeadership
        ? assignments.filter((a) => a.reviewerId)
        : assignments.filter((a) => a.reviewerId === user.uid);
      const userMap = Object.fromEntries(users.map((u) => [u.id || u.uid, u]));
      const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));

      // Build rows in parallel (progress + basic data)
      const rowPromises = myReviewing.map(async (assignment) => {
        try {
          const learner = userMap[assignment.learnerId];
          const course = courseMap[assignment.courseId];
          if (!learner || !course) return null;

          const progress = await getProgressAsReviewer(assignment.learnerId, assignment.courseId);
          const totalChapters = course.chapters?.length ?? 0;
          const completedChapters = progress.completedChapterIds.length;
          const progressPct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

          return {
            key: `${assignment.learnerId}-${assignment.courseId}`,
            assignment, learnerName: learner.name, courseTitle: course.title,
            progressPct, completedChapters, totalChapters,
            status: assignment.status, course, progress, pts: null,
          };
        } catch { return null; }
      });
      const results = (await Promise.all(rowPromises)).filter(Boolean);
      setRows(results);
      setLoading(false);

      // Load points in background (non-blocking)
      for (const row of results) {
        calculateCoursePoints(row.assignment.learnerId, row.assignment.courseId, row.totalChapters, row.assignment.id, false)
          .then((pts) => {
            if (pts) setRows(prev => prev.map(r => r.key === row.key ? { ...r, pts } : r));
          })
          .catch(() => {});
      }
      return;
    } catch { /* handle */ }
    finally { setLoading(false); }
  }

  async function toggleExpand(row) {
    if (expandedKey === row.key) { setExpandedKey(null); setDetailData(null); setFeedbackHistory(null); return; }

    const sorted = [...row.course.chapters].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const chapters = sorted.map((ch) => {
      const isCompleted = row.progress.completedChapterIds.includes(ch.id);
      const assessmentResult = row.progress.assessmentResults[ch.id];
      const exerciseStatuses = ch.exercises.map((ex) => ({
        title: ex.title,
        submitted: !!row.progress.exerciseSubmissions[ex.id],
      }));
      return {
        id: ch.id,
        title: ch.title || `Chapter ${ch.sequenceOrder}`,
        completed: isCompleted,
        assessmentScore: assessmentResult ? `${assessmentResult.score}/${assessmentResult.total}` : '--',
        hasAssessmentResult: !!assessmentResult,
        exercises: exerciseStatuses,
      };
    });
    setExpandedKey(row.key);
    setDetailData(chapters);
    setFeedbackHistory(null);
    // Load feedback history in background
    getReviewerFeedback(row.assignment.id).then(fb => setFeedbackHistory(fb)).catch(() => {});
  }

  async function handleSendRiskAlert(row) {
    const key = row.key;
    setAlertStatus(prev => ({ ...prev, [key]: 'sending' }));
    try {
      await sendRiskAlertEmail({ userId: row.assignment.learnerId, courseId: row.assignment.courseId, from: { email: user.email, name: user.displayName || user.email } });
      setAlertStatus(prev => ({ ...prev, [key]: 'sent' }));
    } catch {
      setAlertStatus(prev => ({ ...prev, [key]: 'error' }));
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header"><h1>Learner Progress</h1></div>
      <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '24px' }}>
        Learners you are reviewing and their course progress.
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">You are not assigned as a reviewer for any learner.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Course</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Points</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <>
                <tr key={row.key} className="expandable-row" onClick={() => toggleExpand(row)}>
                  <td>{row.learnerName}</td>
                  <td>{row.courseTitle}</td>
                  <td>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${row.progressPct}%` }} />
                    </div>
                    {row.progressPct}%
                  </td>
                  <td>
                    <span className={`status-badge status-${row.status?.replace('_', '-')}`}>
                      {row.status === 'not_started' ? 'Not Started' : row.status === 'in_progress' ? 'In Progress' : 'Completed'}
                    </span>
                  </td>
                  <td><PointsCell pts={row.pts} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                        onClick={() => setFeedbackModal({ row, mode: row.status === 'completed' ? 'final' : 'weekly' })}
                      >
                        {row.status === 'completed' ? 'Final Feedback' : 'Give Feedback'}
                      </button>
                      {row.pts && (row.pts.status === 'at_risk' || row.pts.status === 'critical') && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={alertStatus[row.key] === 'sending'}
                            style={{ color: alertStatus[row.key] === 'sent' ? '#16a34a' : '#ef4444', borderColor: '#ef444440', fontSize: '12px', whiteSpace: 'nowrap' }}
                            onClick={() => handleSendRiskAlert(row)}
                          >
                            {alertStatus[row.key] === 'sending' ? '...' : alertStatus[row.key] === 'sent' ? 'Sent' : 'Risk Alert'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#dc2626', borderColor: '#dc262640', fontSize: '12px', whiteSpace: 'nowrap' }}
                            onClick={() => setEscalateModal(row)}
                          >
                            Escalate
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedKey === row.key && detailData && (
                  <tr className="detail-row">
                    <td colSpan={6}>
                      <div className="detail-content">
                        {/* Feedback History */}
                        <h4 style={{ marginBottom: '12px' }}>Feedback History -- {row.learnerName}</h4>
                        {!feedbackHistory ? (
                          <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading feedback...</p>
                        ) : (() => {
                          const weeklyEntries = Object.entries(feedbackHistory.weekly || {}).sort((a, b) => b[0].localeCompare(a[0]));
                          const hasFinal = !!feedbackHistory.final;
                          const hasAny = weeklyEntries.length > 0 || hasFinal;
                          if (!hasAny) return <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '16px' }}>No feedback submitted yet.</p>;
                          return (
                            <div style={{ marginBottom: '20px' }}>
                              <table className="detail-table" style={{ marginBottom: '8px' }}>
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th>Date</th>
                                    <th>Attitude</th>
                                    <th>Communication</th>
                                    <th>Business</th>
                                    <th>Technology</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {hasFinal && (
                                    <tr style={{ background: '#f0fdf4' }}>
                                      <td><strong>Final</strong></td>
                                      <td>{new Date(feedbackHistory.final.submittedAt).toLocaleDateString()}</td>
                                      <td>{feedbackHistory.final.attitude}/10</td>
                                      <td>{feedbackHistory.final.communication}/10</td>
                                      <td>{feedbackHistory.final.business}/10</td>
                                      <td>{feedbackHistory.final.technology}/10</td>
                                      <td><strong>{Math.round(((feedbackHistory.final.attitude + feedbackHistory.final.communication + feedbackHistory.final.business + feedbackHistory.final.technology) / 4) * 3)}/30</strong></td>
                                    </tr>
                                  )}
                                  {weeklyEntries.map(([weekId, fb]) => (
                                    <tr key={weekId}>
                                      <td>{weekId}</td>
                                      <td>{new Date(fb.submittedAt).toLocaleDateString()}</td>
                                      <td>{fb.attitude}/10</td>
                                      <td>{fb.communication}/10</td>
                                      <td>{fb.business}/10</td>
                                      <td>{fb.technology}/10</td>
                                      <td>{Math.round(((fb.attitude + fb.communication + fb.business + fb.technology) / 4) * 3)}/30</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}

                        {/* Chapter Details */}
                        <h4 style={{ marginBottom: '8px' }}>Chapter Details</h4>
                        <table className="detail-table">
                          <thead><tr><th>Chapter</th><th>Completed</th><th>Assessment</th><th>Exercises</th><th>Actions</th></tr></thead>
                          <tbody>
                            {detailData.map((ch) => (
                              <tr key={ch.id}>
                                <td>{ch.title}</td>
                                <td>{ch.completed ? 'Yes' : 'No'}</td>
                                <td>{ch.assessmentScore}</td>
                                <td>{ch.exercises.length === 0 ? '--' : ch.exercises.map((ex, i) => <span key={i}>{ex.title}: {ex.submitted ? 'Yes' : 'No'}{i < ch.exercises.length - 1 ? ', ' : ''}</span>)}</td>
                                <td>
                                  {ch.hasAssessmentResult && (
                                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setAnswerViewer({ learnerId: row.assignment.learnerId, courseId: row.assignment.courseId, chapterId: ch.id }); }}>
                                      View Answers
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}

      {answerViewer && (
        <AssessmentAnswerViewer
          learnerId={answerViewer.learnerId}
          courseId={answerViewer.courseId}
          chapterId={answerViewer.chapterId}
          onClose={() => setAnswerViewer(null)}
        />
      )}

      {feedbackModal && (
        <FeedbackModal
          row={feedbackModal.row}
          mode={feedbackModal.mode}
          onClose={() => setFeedbackModal(null)}
          onSaved={loadData}
          getAIFeedbackScores={getAIFeedbackScores}
          submitWeeklyFeedback={submitWeeklyFeedback}
          submitFinalFeedback={submitFinalFeedback}
          getReviewerFeedback={getReviewerFeedback}
        />
      )}

      {escalateModal && (
        <EscalateModal
          row={escalateModal}
          user={user}
          onClose={() => setEscalateModal(null)}
        />
      )}
    </div>
  );
}
