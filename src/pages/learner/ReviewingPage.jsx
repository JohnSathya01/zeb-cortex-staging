import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import AssessmentAnswerViewer from '../../components/AssessmentAnswerViewer.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

function PointsPill({ pts }) {
  if (!pts) return <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>;
  const color = pts.status === 'on_track' ? '#22c55e' : pts.status === 'at_risk' ? '#f59e0b' : '#ef4444';
  const label = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[pts.status] || '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: color + '18', color, border: `1px solid ${color}40` }}>
      {pts.total} pts · {label}
    </span>
  );
}

export default function ReviewingPage() {
  const { user } = useAuth();
  const { getAssignments, getUsers, getCourses, getProgressAsReviewer, calculateCoursePoints, loading: dataLoading } = useData();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [answerViewer, setAnswerViewer] = useState(null);

  useEffect(() => {
    if (user && !dataLoading) loadData();
  }, [user, dataLoading]);

  async function loadData() {
    try {
      const [assignments, users, courses] = await Promise.all([
        getAssignments(), getUsers(), getCourses(),
      ]);

      const myReviewing = assignments.filter((a) => a.reviewerId === user.uid);
      const userMap = Object.fromEntries(users.map((u) => [u.id || u.uid, u]));
      const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));

      const built = [];
      for (const assignment of myReviewing) {
        try {
          const learner = userMap[assignment.learnerId];
          const course = courseMap[assignment.courseId];
          if (!learner || !course) continue;

          const progress = await getProgressAsReviewer(assignment.learnerId, assignment.courseId);
          const totalChapters = course.chapters?.length ?? 0;
          const completedChapters = progress.completedChapterIds.length;
          const progressPct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

          // Calculate points for this learner (uses cached value if recent)
          let pts = null;
          try { pts = await calculateCoursePoints(assignment.learnerId, assignment.courseId, totalChapters, assignment.id, false); } catch { /* ignore */ }

          built.push({
            key: `${assignment.learnerId}-${assignment.courseId}`,
            assignment,
            learnerName: learner.name,
            courseTitle: course.title,
            progressPct,
            completedChapters,
            totalChapters,
            status: assignment.status,
            course,
            progress,
            pts,
          });
        } catch {
          // skip this assignment if data fetch fails
        }
      }
      setRows(built);
    } catch { /* handle */ }
    finally { setLoading(false); }
  }

  async function toggleExpand(row) {
    if (expandedKey === row.key) { setExpandedKey(null); setDetailData(null); return; }

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
        assessmentScore: assessmentResult ? `${assessmentResult.score}/${assessmentResult.total}` : '—',
        hasAssessmentResult: !!assessmentResult,
        exercises: exerciseStatuses,
      };
    });
    setExpandedKey(row.key);
    setDetailData(chapters);
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
                  <td><PointsPill pts={row.pts} /></td>
                </tr>
                {expandedKey === row.key && detailData && (
                  <tr className="detail-row">
                    <td colSpan={4}>
                      <div className="detail-content">
                        <h4>Chapter Details — {row.learnerName}</h4>
                        <table className="detail-table">
                          <thead><tr><th>Chapter</th><th>Completed</th><th>Assessment</th><th>Exercises</th><th>Actions</th></tr></thead>
                          <tbody>
                            {detailData.map((ch) => (
                              <tr key={ch.id}>
                                <td>{ch.title}</td>
                                <td>{ch.completed ? 'Yes' : 'No'}</td>
                                <td>{ch.assessmentScore}</td>
                                <td>{ch.exercises.length === 0 ? '—' : ch.exercises.map((ex, i) => <span key={i}>{ex.title}: {ex.submitted ? 'Yes' : 'No'}{i < ch.exercises.length - 1 ? ', ' : ''}</span>)}</td>
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
    </div>
  );
}
