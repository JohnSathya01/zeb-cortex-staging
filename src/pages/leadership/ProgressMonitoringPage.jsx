import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import AssessmentAnswerViewer from '../../components/AssessmentAnswerViewer.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function ProgressMonitoringPage() {
  const {
    getUsers,
    getCourses,
    getAssignments,
    getProgress,
  } = useData();

  const [rows, setRows] = useState([]);
  const [courses, setCourses] = useState([]);
  const [learners, setLearners] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [answerViewer, setAnswerViewer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCourse, setFilterCourse] = useState('');
  const [filterLearner, setFilterLearner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [users, allCourses, allAssignments] = await Promise.all([
      getUsers(),
      getCourses(),
      getAssignments(),
    ]);

    const learnerList = users.filter((u) => u.role === 'learner');
    setLearners(learnerList);
    setCourses(allCourses);

    const learnerMap = Object.fromEntries(learnerList.map((l) => [l.id, l]));
    const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c]));

    const rowPromises = allAssignments.map(async (assignment) => {
      try {
        const learner = learnerMap[assignment.learnerId];
        const course = courseMap[assignment.courseId];
        if (!learner || !course) return null;

        const progress = await getProgress(assignment.learnerId, assignment.courseId);
        const totalChapters = course.chapters.length;
        const completedChapters = progress.completedChapterIds.length;
        const progressPct = totalChapters > 0
          ? Math.round((completedChapters / totalChapters) * 100)
          : 0;

        const timelineStatus = getTimelineStatus(assignment, progressPct);

        return {
          key: `${assignment.learnerId}-${assignment.courseId}`,
          assignmentId: assignment.id,
          learnerId: assignment.learnerId,
          learnerName: learner.name,
          courseId: assignment.courseId,
          courseTitle: course.title,
          progressPct,
          completedChapters,
          totalChapters,
          timelineStatus,
          assignment,
          course,
          progress,
        };
      } catch { return null; }
    });

    setRows((await Promise.all(rowPromises)).filter(Boolean));
    setLoading(false);
  }

  function getTimelineStatus(assignment, progressPct) {
    if (assignment.status === 'completed') return 'completed';
    if (!assignment.targetCompletionDate) return 'no timeline';
    const target = new Date(assignment.targetCompletionDate);
    const now = new Date();
    if (now > target && progressPct < 100) return 'behind schedule';
    return 'on track';
  }

  function timelineStatusClass(status) {
    switch (status) {
      case 'completed':
        return 'status-badge status-completed';
      case 'on track':
        return 'status-badge status-on-track';
      case 'behind schedule':
        return 'status-badge status-behind';
      case 'no timeline':
        return 'status-badge status-no-timeline';
      default:
        return 'status-badge';
    }
  }

  async function toggleExpand(row) {
    const key = row.key;
    if (expandedKey === key) {
      setExpandedKey(null);
      setDetailData(null);
      return;
    }

    const course = row.course;
    const progress = row.progress;
    const sorted = [...course.chapters].sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder
    );

    const chapters = sorted.map((ch) => {
      const isCompleted = progress.completedChapterIds.includes(ch.id);
      const assessmentResult = progress.assessmentResults[ch.id];
      const exerciseStatuses = ch.exercises.map((ex) => ({
        title: ex.title,
        submitted: !!progress.exerciseSubmissions[ex.id],
      }));

      return {
        id: ch.id,
        title: ch.title || `Chapter ${ch.sequenceOrder}`,
        completed: isCompleted,
        assessmentScore: assessmentResult
          ? `${assessmentResult.score}/${assessmentResult.total}`
          : '—',
        hasAssessmentResult: !!assessmentResult,
        exercises: exerciseStatuses,
      };
    });

    setExpandedKey(key);
    setDetailData(chapters);
  }

  // Apply filters
  const filtered = rows.filter((r) => {
    if (filterCourse && r.courseId !== filterCourse) return false;
    if (filterLearner && r.learnerId !== filterLearner) return false;
    if (filterStatus && r.timelineStatus !== filterStatus) return false;
    return true;
  });

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <h1>Progress Monitoring</h1>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <select
          value={filterCourse}
          onChange={(e) => setFilterCourse(e.target.value)}
          aria-label="Filter by course"
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        <select
          value={filterLearner}
          onChange={(e) => setFilterLearner(e.target.value)}
          aria-label="Filter by learner"
        >
          <option value="">All Learners</option>
          {learners.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="on track">On Track</option>
          <option value="behind schedule">Behind Schedule</option>
          <option value="completed">Completed</option>
          <option value="no timeline">No Timeline</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No matching records found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Course</th>
              <th>Progress</th>
              <th>Timeline Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isExpanded = expandedKey === row.key;
              return (
                <ProgressRow
                  key={row.key}
                  row={row}
                  isExpanded={isExpanded}
                  detailData={isExpanded ? detailData : null}
                  timelineStatusClass={timelineStatusClass}
                  onToggle={() => toggleExpand(row)}
                  onViewAnswers={(chId) =>
                    setAnswerViewer({
                      learnerId: row.learnerId,
                      courseId: row.courseId,
                      chapterId: chId,
                    })
                  }
                />
              );
            })}
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

function ProgressRow({ row, isExpanded, detailData, timelineStatusClass, onToggle, onViewAnswers }) {
  return (
    <>
      <tr className="expandable-row" onClick={onToggle}>
        <td>{row.learnerName}</td>
        <td>{row.courseTitle}</td>
        <td>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${row.progressPct}%` }}
            />
          </div>
          {row.progressPct}%
        </td>
        <td>
          <span className={timelineStatusClass(row.timelineStatus)}>
            {row.timelineStatus}
          </span>
        </td>
      </tr>
      {isExpanded && detailData && (
        <tr className="detail-row">
          <td colSpan={4}>
            <div className="detail-content">
              <h4>Chapter Details — {row.learnerName} / {row.courseTitle}</h4>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Chapter</th>
                    <th>Completed</th>
                    <th>Assessment Score</th>
                    <th>Exercise Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detailData.map((ch) => (
                    <tr key={ch.id}>
                      <td>{ch.title}</td>
                      <td>{ch.completed ? 'Yes' : 'No'}</td>
                      <td>{ch.assessmentScore}</td>
                      <td>
                        {ch.exercises.length === 0
                          ? '—'
                          : ch.exercises.map((ex, i) => (
                              <span key={i}>
                                {ex.title}: {ex.submitted ? 'Yes' : 'No'}
                                {i < ch.exercises.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                      </td>
                      <td>
                        {ch.hasAssessmentResult && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewAnswers(ch.id);
                            }}
                          >
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
  );
}
