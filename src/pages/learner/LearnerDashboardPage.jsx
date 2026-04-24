import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import OverdueIndicator from '../../components/OverdueIndicator.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

function PointsBadge({ total, status }) {
  if (total === null || total === undefined) return null;
  const cls = status === 'on_track' ? 'pts-badge pts-on-track' : status === 'at_risk' ? 'pts-badge pts-at-risk' : 'pts-badge pts-critical';
  return <span className={cls}>{total} pts</span>;
}

export default function LearnerDashboardPage() {
  const { user } = useAuth();
  const { getAssignments, getCourseById, getProgress, calculateCoursePoints, loading: dataLoading } = useData();
  const navigate = useNavigate();

  const [courseCards, setCourseCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !dataLoading) loadDashboard();
  }, [user, dataLoading]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const assignments = await getAssignments({ learnerId: user.uid });
      const cards = [];
      const cardPromises = assignments.map(async (assignment) => {
        try {
          const course = await getCourseById(assignment.courseId);
          if (!course) return null;
          const progress = await getProgress(user.uid, assignment.courseId);
          const totalChapters = course.chapters.length;
          const completedCount = progress.completedChapterIds.length;
          const progressPct = totalChapters > 0
            ? Math.round((completedCount / totalChapters) * 100)
            : 0;
          return { assignment, course, progressPct, completedCount, totalChapters, points: null };
        } catch { return null; }
      });
      const built = (await Promise.all(cardPromises)).filter(Boolean);
      setCourseCards(built);

      // Load points in background
      for (const card of built) {
        calculateCoursePoints(user.uid, card.assignment.courseId, card.totalChapters, card.assignment.id, true)
          .then((pts) => {
            if (pts) setCourseCards(prev => prev.map(c => c.assignment.id === card.assignment.id ? { ...c, points: pts } : c));
          })
          .catch(() => {});
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(s) {
    return s === 'not_started' ? 'Not Started' : s === 'in_progress' ? 'In Progress' : s === 'completed' ? 'Completed' : s;
  }
  function statusClass(s) {
    return `status-badge status-${s?.replace('_', '-') || 'unknown'}`;
  }

  if (loading) return <PageLoader />;

  const atRiskCount = courseCards.filter(c => c.points && (c.points.status === 'at_risk' || c.points.status === 'critical')).length;

  return (
    <div>
      <div className="page-header"><h1>My Courses</h1></div>

      {atRiskCount > 0 && (
        <div className="pts-alert-banner">
          <span className="pts-alert-icon">!</span>
          <span>
            <strong>{atRiskCount} course{atRiskCount > 1 ? 's are' : ' is'} at risk</strong>
            {' '}— below the 80-point SLA. Click a course card to see details.
          </span>
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
                  <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="progress-text">{progressPct}% ({completedCount}/{totalChapters} chapters)</span>
              </div>
              <div className="course-card-footer">
                <span className={statusClass(assignment.status)}>{statusLabel(assignment.status)}</span>
                {assignment.targetCompletionDate && (
                  <span className="timeline-text">Due: {new Date(assignment.targetCompletionDate).toLocaleDateString()}</span>
                )}
              </div>

              {/* Points section — always visible, click to go to points page */}
              <div
                className={`course-card-points${points?.status === 'critical' ? ' course-card-points--critical' : points?.status === 'at_risk' ? ' course-card-points--risk' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/learner/points/${course.id}?aid=${assignment.id}`);
                }}
              >
                {points ? (
                  <>
                    <PointsBadge total={points.total} status={points.status} />
                    <span className="pts-sla-label">
                      {points.status === 'on_track'
                        ? 'Above 80-pt SLA'
                        : `Need ${Math.max(0, 80 - points.total)} more pts for SLA`}
                    </span>
                  </>
                ) : (
                  <span className="pts-sla-label" style={{ color: 'var(--gray-400)' }}>Points not yet available</span>
                )}
                <span className="pts-view-link">View Points &rsaquo;</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
