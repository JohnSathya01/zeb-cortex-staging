import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import OverdueIndicator from '../../components/OverdueIndicator.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function LearnerDashboardPage() {
  const { user } = useAuth();
  const { getAssignments, getCourseById, getProgress } = useData();
  const navigate = useNavigate();

  const [courseCards, setCourseCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user]);

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
          cards.push({ assignment, course, progressPct, completedCount, totalChapters });
        } catch {
          // skip this assignment if course not found
        }
      }
      setCourseCards(cards);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
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

  return (
    <div>
      <div className="page-header">
        <h1>My Courses</h1>
      </div>

      {courseCards.length === 0 ? (
        <div className="empty-state">No courses assigned yet.</div>
      ) : (
        <div className="course-cards-grid">
          {courseCards.map(({ assignment, course, progressPct, completedCount, totalChapters }) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
