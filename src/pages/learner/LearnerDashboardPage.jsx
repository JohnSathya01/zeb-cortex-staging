import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import OverdueIndicator from '../../components/OverdueIndicator.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

function PointsBadge({ points, status }) {
  if (points === null || points === undefined) return null;
  const cls = status === 'on_track' ? 'pts-badge pts-on-track' : status === 'at_risk' ? 'pts-badge pts-at-risk' : 'pts-badge pts-critical';
  return <span className={cls}>{points} pts</span>;
}

export default function LearnerDashboardPage() {
  const { user } = useAuth();
  const { getAssignments, getCourseById, getProgress, calculateCoursePoints, getCoursePoints, loading: dataLoading } = useData();
  const navigate = useNavigate();

  const [courseCards, setCourseCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !dataLoading) loadDashboard();
  }, [user, dataLoading]);

  async function loadDashboard() {
    try {
      const assignments = await getAssignments({ learnerId: user.uid });
      const cards = [];
      for (const assignment of assignments) {
        try {
          const course = await getCourseById(assignment.courseId);
          if (!course) continue;
          const progress = await getProgress(user.uid, assignment.courseId);
          const totalChapters = course.chapters.length;
          const completedCount = progress.completedChapterIds.length;
          const progressPct = totalChapters > 0
            ? Math.round((completedCount / totalChapters) * 100)
            : 0;
          // Get existing points first (fast), then recalculate in background
          const existingPts = await getCoursePoints(user.uid, assignment.courseId);
          cards.push({ assignment, course, progressPct, completedCount, totalChapters, points: existingPts });
        } catch {
          // skip
        }
      }
      setCourseCards(cards);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
    // Background: recalculate all points silently
    try {
      const assignments = await getAssignments({ learnerId: user.uid });
      for (const assignment of assignments) {
        try {
          const course = await getCourseById(assignment.courseId);
          if (!course) continue;
          const pts = await calculateCoursePoints(
            user.uid, assignment.courseId, course.chapters.length, assignment.id, false
          );
          if (pts) {
            setCourseCards(prev => prev.map(c =>
              c.assignment.id === assignment.id ? { ...c, points: pts } : c
            ));
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  function statusLabel(status) {
    switch (status) {
      case 'not_started': return 'Not Started';
      case 'in_progress': return 'In Progress';
      case 'completed': return 'Completed';
      default: return status;
    }
  }

  function statusClass(status) {
    switch (status) {
      case 'not_started': return 'status-badge status-not-started';
      case 'in_progress': return 'status-badge status-in-progress';
      case 'completed': return 'status-badge status-completed';
      default: return 'status-badge';
    }
  }

  if (loading) return <PageLoader />;

  const atRiskCount = courseCards.filter(c => c.points && (c.points.status === 'at_risk' || c.points.status === 'critical')).length;

  return (
    <div>
      <div className="page-header">
        <h1>My Courses</h1>
      </div>

      {atRiskCount > 0 && (
        <div className="pts-alert-banner">
          <span className="pts-alert-icon">⚠</span>
          <span><strong>{atRiskCount} course{atRiskCount > 1 ? 's are' : ' is'} at risk</strong> — below the 80-point SLA. Take action to get back on track.</span>
        </div>
      )}

      {courseCards.length === 0 ? (
        <div className="empty-state">No courses assigned yet.</div>
      ) : (
        <div className="course-cards-grid">
          {courseCards.map(({ assignment, course, progressPct, completedCount, totalChapters, points }) => (
            <div
              key={assignment.id}
              className="course-card"
              onClick={() => navigate(`/learner/course/${course.id}`)}
            >
              <div className="course-card-header">
                <h3 className="course-card-title">{course.title}</h3>
                <OverdueIndicator
                  targetDate={assignment.targetCompletionDate}
                  isCompleted={assignment.status === 'completed'}
                />
              </div>
              <p className="course-card-desc">{course.description}</p>
              <div className="course-card-progress">
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="progress-text">{progressPct}% ({completedCount}/{totalChapters} chapters)</span>
              </div>
              <div className="course-card-footer">
                <span className={statusClass(assignment.status)}>
                  {statusLabel(assignment.status)}
                </span>
                {assignment.targetCompletionDate && (
                  <span className="timeline-text">
                    Due: {new Date(assignment.targetCompletionDate).toLocaleDateString()}
                  </span>
                )}
              </div>
              {points && (
                <div className="course-card-points" onClick={(e) => { e.stopPropagation(); navigate(`/learner/points/${course.id}?aid=${assignment.id}`); }}>
                  <PointsBadge points={points.total} status={points.status} />
                  <span className="pts-sla-label">
                    {points.status === 'on_track' ? '✓ Above 80-pt SLA' : `Need ${Math.max(0, 80 - points.total)} more pts`}
                  </span>
                  <span className="pts-view-link">View Details →</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
