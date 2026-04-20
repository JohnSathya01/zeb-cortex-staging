import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function ReviewerManagementPage() {
  const { getUsers, getCourses, getAssignments, assignReviewer } = useData();

  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState({});
  const [confirming, setConfirming] = useState({});

  // Filters
  const [filterCourse, setFilterCourse] = useState('');
  const [filterLearner, setFilterLearner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [u, c, a] = await Promise.all([getUsers(), getCourses(), getAssignments()]);
      setUsers(u);
      setCourses(c);
      setAssignments(a);
    } catch { /* handle */ }
    finally { setLoading(false); }
  }

  function getUserName(uid) {
    const u = users.find((u) => u.id === uid || u.uid === uid);
    return u ? u.name : 'Unknown';
  }

  function getCourseName(courseId) {
    const c = courses.find((c) => c.id === courseId);
    return c ? c.title : 'Unknown Course';
  }

  const assignedPairs = assignments.map((a) => ({
    ...a,
    learnerName: getUserName(a.learnerId),
    courseName: getCourseName(a.courseId),
    reviewerName: a.reviewerId ? getUserName(a.reviewerId) : null,
  }));

  const filteredPairs = assignedPairs.filter((pair) => {
    if (filterCourse && pair.courseId !== filterCourse) return false;
    if (filterLearner && pair.learnerId !== filterLearner) return false;
    if (filterStatus && pair.status !== filterStatus) return false;
    if (filterReviewer) {
      if (filterReviewer === '__none__') return !pair.reviewerId;
      if (pair.reviewerId !== filterReviewer) return false;
    }
    return true;
  });

  const hasFilters = filterCourse || filterLearner || filterStatus || filterReviewer;

  function clearFilters() {
    setFilterCourse('');
    setFilterLearner('');
    setFilterStatus('');
    setFilterReviewer('');
  }

  // Unique learners from assignments for the learner filter dropdown
  const learnerOptions = users.filter((u) =>
    assignments.some((a) => a.learnerId === u.id || a.learnerId === u.uid)
  );

  // Unique reviewers assigned across assignments
  const reviewerOptions = users.filter((u) =>
    assignments.some((a) => a.reviewerId === u.id || a.reviewerId === u.uid)
  );

  function handleSelectChange(assignmentId, currentReviewerId, value) {
    if (value === (currentReviewerId || '')) {
      setPending((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    } else {
      setPending((prev) => ({ ...prev, [assignmentId]: value }));
    }
    setMessage(null);
  }

  async function handleConfirm(assignmentId) {
    const reviewerUid = pending[assignmentId];
    setConfirming((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await assignReviewer(assignmentId, reviewerUid || null);
      await loadData();
      setPending((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
      setMessage(reviewerUid ? 'Reviewer assigned successfully' : 'Reviewer removed');
    } catch (err) {
      setMessage(err.message || 'Failed to update reviewer');
    } finally {
      setConfirming((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    }
  }

  function handleCancel(assignmentId) {
    setPending((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    setMessage(null);
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="page-header">
        <h1>Reviewer Management</h1>
      </div>

      <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '16px' }}>
        Assign reviewers to learner-course pairs. Any user (learner or leadership) can be a reviewer.
      </p>

      {/* Filters */}
      <div className="reviewer-filters">
        <select
          className="filter-select"
          value={filterCourse}
          onChange={(e) => setFilterCourse(e.target.value)}
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filterLearner}
          onChange={(e) => setFilterLearner(e.target.value)}
        >
          <option value="">All Learners</option>
          {learnerOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>

        <select
          className="filter-select"
          value={filterReviewer}
          onChange={(e) => setFilterReviewer(e.target.value)}
        >
          <option value="">All Reviewers</option>
          <option value="__none__">No Reviewer</option>
          {reviewerOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="filter-clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {message && (
        <div className="assignment-message">{message}</div>
      )}

      {assignedPairs.length === 0 ? (
        <div className="empty-state">No course assignments found. Assign courses to learners first.</div>
      ) : filteredPairs.length === 0 ? (
        <div className="empty-state">No results match the selected filters.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Course</th>
              <th>Status</th>
              <th>Current Reviewer</th>
              <th>Assign Reviewer</th>
            </tr>
          </thead>
          <tbody>
            {filteredPairs.map((pair) => {
              const hasPending = pair.id in pending;
              const selectValue = hasPending ? pending[pair.id] : (pair.reviewerId || '');
              return (
                <tr key={pair.id}>
                  <td>{pair.learnerName}</td>
                  <td>{pair.courseName}</td>
                  <td>
                    <span className={`status-badge status-${pair.status?.replace('_', '-')}`}>
                      {pair.status === 'not_started' ? 'Not Started' :
                       pair.status === 'in_progress' ? 'In Progress' :
                       pair.status === 'completed' ? 'Completed' : pair.status}
                    </span>
                  </td>
                  <td>
                    {pair.reviewerName ? (
                      <span style={{ fontWeight: 600 }}>{pair.reviewerName}</span>
                    ) : (
                      <span style={{ color: 'var(--gray-400)' }}>None assigned</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <select
                        className="reviewer-select"
                        value={selectValue}
                        onChange={(e) => handleSelectChange(pair.id, pair.reviewerId, e.target.value)}
                      >
                        <option value="">No Reviewer</option>
                        {users
                          .filter((u) => u.id !== pair.learnerId && u.uid !== pair.learnerId)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                      </select>
                      {hasPending && (
                        <>
                          <button
                            className="reviewer-confirm-btn"
                            title="Confirm"
                            disabled={confirming[pair.id]}
                            onClick={() => handleConfirm(pair.id)}
                          >
                            {confirming[pair.id] ? '…' : '✓'}
                          </button>
                          <button
                            className="reviewer-cancel-btn"
                            title="Cancel"
                            disabled={confirming[pair.id]}
                            onClick={() => handleCancel(pair.id)}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
