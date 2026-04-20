import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import TimelinePicker from '../../components/TimelinePicker.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const { getCourseById, getProgress, getAssignments, setTimeline, updateTimeline } = useData();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [progress, setProgress] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && courseId) loadCourse();
  }, [user, courseId]);

  async function loadCourse() {
    try {
      const [c, p, assignments] = await Promise.all([
        getCourseById(courseId),
        getProgress(user.uid, courseId),
        getAssignments({ learnerId: user.uid, courseId }),
      ]);
      setCourse(c);
      setProgress(p);
      setAssignment(assignments[0] || null);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  async function handleTimelineChange(date) {
    if (!assignment) return;
    try {
      if (assignment.targetCompletionDate) {
        await updateTimeline(assignment.id, date);
      } else {
        await setTimeline(assignment.id, date);
      }
      setAssignment({ ...assignment, targetCompletionDate: date });
    } catch {
      // handle error
    }
  }

  function getChapterStatus(chapter, completedIds, sortedChapters) {
    if (completedIds.includes(chapter.id)) return 'completed';
    const firstIncomplete = sortedChapters.find((ch) => !completedIds.includes(ch.id));
    if (firstIncomplete && firstIncomplete.id === chapter.id) return 'current';
    return 'locked';
  }

  if (loading) return <PageLoader />;
  if (!course) return <div className="empty-state">Course not found.</div>;

  const completedIds = progress ? progress.completedChapterIds : [];
  const sortedChapters = [...course.chapters].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const showTimelinePrompt = assignment && !assignment.targetCompletionDate;
  const timelineSet = assignment && !!assignment.targetCompletionDate;

  return (
    <div>
      <div className="page-header">
        <h1>{course.title}</h1>
      </div>

      {course.description && (
        <p className="course-card-desc" style={{ marginBottom: 20 }}>{course.description}</p>
      )}

      {showTimelinePrompt && (
        <div className="timeline-prompt">
          <p>You must set a target completion date before you can start the course.</p>
          <TimelinePicker value="" onChange={handleTimelineChange} />
        </div>
      )}

      {timelineSet && (
        <div style={{ marginBottom: 20 }}>
          <TimelinePicker
            value={assignment.targetCompletionDate}
            onChange={handleTimelineChange}
          />
        </div>
      )}

      <ul className="chapter-list">
        {sortedChapters.map((chapter) => {
          const status = timelineSet
            ? getChapterStatus(chapter, completedIds, sortedChapters)
            : 'locked';
          const isAccessible = timelineSet && (status === 'completed' || status === 'current');

          return (
            <li
              key={chapter.id}
              className={`chapter-item ${isAccessible ? 'accessible' : 'locked'}`}
              onClick={() => {
                if (isAccessible) {
                  navigate(`/learner/course/${courseId}/chapter/${chapter.id}`);
                }
              }}
            >
              <div className={`chapter-seq ${status}`}>
                {chapter.sequenceOrder}
              </div>
              <div className="chapter-info">
                <p className="chapter-title">{chapter.title}</p>
                <p className="chapter-status-text">
                  {status === 'completed' && '✓ Completed'}
                  {status === 'current' && 'In Progress'}
                  {status === 'locked' && 'Locked'}
                </p>
              </div>
              {status === 'locked' && (
                <span className="chapter-lock-icon">🔒</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
