import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function AnalyticsDashboardPage() {
  const { getUsers, getCourses, getAssignments, getProgress } = useData();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => { loadAnalytics(); }, []);

  async function loadAnalytics() {
    setLoading(true);
    const [users, courses, assignments] = await Promise.all([
      getUsers(), getCourses(), getAssignments(),
    ]);

    const learners = users.filter((u) => u.role === 'learner');

    // Fetch all progress in parallel
    const progressList = await Promise.all(
      assignments.map((a) => getProgress(a.learnerId, a.courseId).catch(() => null))
    );

    // Build per-course analytics
    const courseStats = courses.map((course) => {
      const courseAssignments = assignments.filter((a) => a.courseId === course.id);
      const total = courseAssignments.length;
      const completed = courseAssignments.filter((a) => a.status === 'completed').length;
      const inProgress = courseAssignments.filter((a) => a.status === 'in_progress').length;
      const notStarted = courseAssignments.filter((a) => a.status === 'not_started').length;
      const overdue = courseAssignments.filter((a) => {
        if (!a.targetCompletionDate || a.status === 'completed') return false;
        return new Date() > new Date(a.targetCompletionDate);
      }).length;

      // Avg assessment score across all progress for this course
      const scores = [];
      courseAssignments.forEach((a, i) => {
        const prog = progressList[assignments.indexOf(a)];
        if (!prog) return;
        Object.values(prog.assessmentResults || {}).forEach((r) => {
          if (r.total > 0) scores.push((r.score / r.total) * 100);
        });
      });
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;

      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { course, total, completed, inProgress, notStarted, overdue, avgScore, completionRate };
    });

    // Overall stats
    const totalAssignments = assignments.length;
    const totalCompleted = assignments.filter((a) => a.status === 'completed').length;
    const totalOverdue = courseStats.reduce((s, c) => s + c.overdue, 0);
    const allScores = progressList.flatMap((p) =>
      p ? Object.values(p.assessmentResults || {})
           .filter((r) => r.total > 0)
           .map((r) => (r.score / r.total) * 100) : []
    );
    const overallAvgScore = allScores.length > 0
      ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
      : null;
    const overallCompletion = totalAssignments > 0
      ? Math.round((totalCompleted / totalAssignments) * 100) : 0;

    setStats({ learners, courseStats, totalAssignments, totalCompleted, totalOverdue, overallAvgScore, overallCompletion });
    setLoading(false);
  }

  if (loading) return <PageLoader />;

  const { learners, courseStats, totalAssignments, totalCompleted, totalOverdue, overallAvgScore, overallCompletion } = stats;

  return (
    <div>
      <div className="page-header">
        <h1>Analytics Dashboard</h1>
        <button className="btn btn-secondary" onClick={loadAnalytics}>Refresh</button>
      </div>

      {/* Overall stat cards */}
      <div className="analytics-overview">
        <div className="analytics-stat-card">
          <div className="analytics-stat-value">{learners.length}</div>
          <div className="analytics-stat-label">Total Learners</div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-value">{totalAssignments}</div>
          <div className="analytics-stat-label">Total Assignments</div>
        </div>
        <div className="analytics-stat-card accent">
          <div className="analytics-stat-value">{overallCompletion}%</div>
          <div className="analytics-stat-label">Overall Completion</div>
          <div className="analytics-mini-bar">
            <div className="analytics-mini-bar-fill" style={{ width: `${overallCompletion}%` }} />
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-value">{overallAvgScore !== null ? `${overallAvgScore}%` : '—'}</div>
          <div className="analytics-stat-label">Avg Assessment Score</div>
        </div>
        <div className="analytics-stat-card warn">
          <div className="analytics-stat-value">{totalOverdue}</div>
          <div className="analytics-stat-label">Overdue Assignments</div>
        </div>
      </div>

      {/* Per-course breakdown */}
      <h2 className="analytics-section-title">Course Breakdown</h2>
      <div className="analytics-course-grid">
        {courseStats.map(({ course, total, completed, inProgress, notStarted, overdue, avgScore, completionRate }) => (
          <div key={course.id} className="analytics-course-card">
            <div className="analytics-course-header">
              <div className="analytics-course-title">{course.title}</div>
              <div className="analytics-course-id">{course.id}</div>
            </div>

            {/* Completion bar */}
            <div className="analytics-bar-row">
              <span>Completion</span>
              <span className="analytics-bar-pct">{completionRate}%</span>
            </div>
            <div className="analytics-bar-track">
              <div className="analytics-bar-fill" style={{ width: `${completionRate}%` }} />
            </div>

            {/* Score bar */}
            {avgScore !== null && (
              <>
                <div className="analytics-bar-row">
                  <span>Avg Score</span>
                  <span className="analytics-bar-pct">{avgScore}%</span>
                </div>
                <div className="analytics-bar-track">
                  <div className="analytics-bar-fill score" style={{ width: `${avgScore}%` }} />
                </div>
              </>
            )}

            {/* Status pills */}
            <div className="analytics-pills">
              <span className="analytics-pill total">{total} assigned</span>
              <span className="analytics-pill completed">{completed} done</span>
              <span className="analytics-pill progress">{inProgress} active</span>
              <span className="analytics-pill not-started">{notStarted} not started</span>
              {overdue > 0 && <span className="analytics-pill overdue">{overdue} overdue</span>}
            </div>
          </div>
        ))}

        {courseStats.length === 0 && (
          <div className="empty-state">No course data available yet.</div>
        )}
      </div>

      {/* Specialisation breakdown */}
      <h2 className="analytics-section-title">Learners by Specialisation</h2>
      <div className="analytics-spec-grid">
        {Object.entries(
          learners.reduce((acc, l) => {
            const s = l.specialisation || 'Unassigned';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {})
        ).map(([spec, count]) => (
          <div key={spec} className="analytics-spec-card">
            <div className="analytics-spec-count">{count}</div>
            <div className="analytics-spec-name">{spec}</div>
            <div className="analytics-mini-bar" style={{ marginTop: '8px' }}>
              <div className="analytics-mini-bar-fill" style={{ width: `${(count / learners.length) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
