import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import { sendCourseAssignedEmail, sendReviewerAssignedEmail, sendReviewerNewAssignmentEmail } from '../../services/emailService.js';
import '../../styles/pages.css';

export default function CourseAssignmentPage() {
  const { user } = useAuth();
  const {
    getCourses,
    getUsers,
    getAssignments,
    createAssignmentRecord,
    deleteAssignment,
    assignReviewer,
    logAudit,
  } = useData();

  const [courses, setCourses] = useState([]);
  const [learners, setLearners] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [message, setMessage] = useState(null);
  // { [assignmentId]: pendingReviewerUid }
  const [pending, setPending] = useState({});
  const [confirming, setConfirming] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [c, u, a] = await Promise.all([
      getCourses(),
      getUsers(),
      getAssignments(),
    ]);
    setCourses(c);
    setAllUsers(u);
    setLearners(u.filter((u) => u.role === 'learner'));
    setAssignments(a);
  }

  function getAssignment(learnerId, courseId) {
    return assignments.find(
      (a) => a.learnerId === learnerId && a.courseId === courseId
    );
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

  const [emailStatus, setEmailStatus] = useState({}); // { [key]: 'sending'|'sent'|'error' }

  async function notifyEmail(key, fn, auditDetail) {
    setEmailStatus((prev) => ({ ...prev, [key]: 'sending' }));
    try {
      await fn();
      setEmailStatus((prev) => ({ ...prev, [key]: 'sent' }));
      logAudit('send_email', auditDetail);
      setTimeout(() => setEmailStatus((prev) => { const n = { ...prev }; delete n[key]; return n; }), 3000);
    } catch {
      setEmailStatus((prev) => ({ ...prev, [key]: 'error' }));
      setTimeout(() => setEmailStatus((prev) => { const n = { ...prev }; delete n[key]; return n; }), 3000);
    }
  }

  const [deadlineModal, setDeadlineModal] = useState(null); // { learnerId }
  const [deadlineDate, setDeadlineDate] = useState('');

  function openDeadlineModal(learnerId) {
    setDeadlineModal({ learnerId });
    setDeadlineDate('');
    setMessage(null);
  }

  function closeDeadlineModal() {
    setDeadlineModal(null);
    setDeadlineDate('');
  }

  async function handleAssignWithDeadline() {
    if (!deadlineModal || !selectedCourseId) return;
    try {
      await createAssignmentRecord(
        deadlineModal.learnerId,
        selectedCourseId,
        deadlineDate || null
      );
      await loadData();
      closeDeadlineModal();

      // Auto-send course assigned email
      const learner = learners.find((l) => l.id === deadlineModal.learnerId);
      const course  = courses.find((c) => c.id === selectedCourseId);
      if (learner?.email) {
        sendCourseAssignedEmail({
          toEmail: learner.email, toName: learner.name,
          courseId: selectedCourseId, courseName: course?.title,
          from: { email: user?.email, name: user?.name },
        }).then(() => {
          logAudit('send_email', `Auto: course assigned email sent to ${learner.name} <${learner.email}> for "${course?.title}"`);
        }).catch(() => {});
      }
    } catch (err) {
      setMessage(err.error || 'Course already assigned to this learner');
      closeDeadlineModal();
    }
  }

  async function handleUnassign(assignmentId) {
    setMessage(null);
    await deleteAssignment(assignmentId);
    await loadData();
  }

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

      // Auto-send emails when a reviewer is assigned (not removed)
      if (reviewerUid) {
        const assignment = assignments.find((a) => a.id === assignmentId);
        const learner   = learners.find((l) => l.id === assignment?.learnerId);
        const reviewer  = allUsers.find((u) => u.id === reviewerUid);
        const course    = courses.find((c) => c.id === assignment?.courseId);
        const from      = { email: user?.email, name: user?.name };

        // Fire both emails in background — don't block the UI
        Promise.all([
          learner?.email && sendReviewerAssignedEmail({
            toEmail: learner.email, toName: learner.name,
            reviewerName: reviewer?.name,
            courseId: assignment.courseId, courseName: course?.title,
            from,
          }),
          reviewer?.email && sendReviewerNewAssignmentEmail({
            toEmail: reviewer.email, reviewerName: reviewer.name,
            learnerName: learner?.name,
            courseId: assignment.courseId, courseName: course?.title,
            from,
          }),
        ]).then(() => {
          logAudit('send_email', `Auto: reviewer assignment emails — learner: ${learner?.name}, reviewer: ${reviewer?.name}, course: "${course?.title}"`);
        }).catch(() => {
          // Email failure is non-blocking
        });
      }
    } catch (err) {
      setMessage(err.message || 'Failed to assign reviewer');
    } finally {
      setConfirming((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    }
  }

  function handleCancel(assignmentId) {
    setPending((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    setMessage(null);
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div>
      <div className="page-header">
        <h1>Course Assignment</h1>
      </div>

      {message && (
        <div className="assignment-message">{message}</div>
      )}

      <div className="assignment-layout">
        {/* Course list */}
        <div className="assignment-panel">
          <h2 className="panel-title">Courses</h2>
          {courses.length === 0 ? (
            <div className="empty-state">No courses available.</div>
          ) : (
            <ul className="assignment-list">
              {courses.map((course) => (
                <li
                  key={course.id}
                  className={`assignment-list-item${selectedCourseId === course.id ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setMessage(null);
                    setPending({});
                  }}
                >
                  <span className="item-title">{course.title}</span>
                  <span className="item-meta">{course.chapters.length} chapters</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Learner list with assignment status */}
        <div className="assignment-panel">
          <h2 className="panel-title">
            Learners
            {selectedCourse && (
              <span className="panel-subtitle"> — {selectedCourse.title}</span>
            )}
          </h2>
          {!selectedCourseId ? (
            <div className="empty-state">Select a course to manage assignments.</div>
          ) : learners.length === 0 ? (
            <div className="empty-state">No learners found.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {learners.map((learner) => {
                  const assignment = getAssignment(learner.id, selectedCourseId);
                  const hasPending = assignment && (assignment.id in pending);
                  const selectValue = hasPending
                    ? pending[assignment.id]
                    : (assignment?.reviewerId || '');
                  return (
                    <tr key={learner.id}>
                      <td>{learner.name}</td>
                      <td>
                        {assignment ? (
                          <span className={statusClass(assignment.status)}>
                            {statusLabel(assignment.status)}
                          </span>
                        ) : (
                          <span className="status-badge status-unassigned">Unassigned</span>
                        )}
                      </td>
                      <td>
                        {assignment ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              className="reviewer-select"
                              value={selectValue}
                              onChange={(e) =>
                                handleSelectChange(assignment.id, assignment.reviewerId, e.target.value)
                              }
                            >
                              <option value="">No Reviewer</option>
                              {allUsers
                                .filter((u) => {
                                  if (u.id === learner.id || u.uid === learner.id) return false;
                                  // Exclude users who are learners in the same course
                                  const isLearnerInSameCourse = assignments.some(
                                    (a) => a.learnerId === u.id && a.courseId === selectedCourseId
                                  );
                                  return !isLearnerInSameCourse;
                                })
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                            {hasPending && (
                              <>
                                <button
                                  className="reviewer-confirm-btn"
                                  title="Confirm"
                                  disabled={confirming[assignment.id]}
                                  onClick={() => handleConfirm(assignment.id)}
                                >
                                  {confirming[assignment.id] ? '…' : '✓'}
                                </button>
                                <button
                                  className="reviewer-cancel-btn"
                                  title="Cancel"
                                  disabled={confirming[assignment.id]}
                                  onClick={() => handleCancel(assignment.id)}
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        {assignment ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleUnassign(assignment.id)}
                              >
                                Unassign
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={emailStatus[`course-${assignment.id}`] === 'sending'}
                                title="Notify learner about this course"
                                style={{ color: emailStatus[`course-${assignment.id}`] === 'sent' ? '#16a34a' : emailStatus[`course-${assignment.id}`] === 'error' ? '#dc2626' : undefined }}
                                onClick={() => notifyEmail(
                                  `course-${assignment.id}`,
                                  () => sendCourseAssignedEmail({
                                    toEmail: learner.email,
                                    toName: learner.name,
                                    courseId: selectedCourseId,
                                    courseName: selectedCourse?.title,
                                    from: { email: user?.email, name: user?.name },
                                  }),
                                  `Course assignment email sent to ${learner.name} <${learner.email}> for "${selectedCourse?.title}" by ${user?.name}`
                                )}
                              >
                                {emailStatus[`course-${assignment.id}`] === 'sending' ? '...' : emailStatus[`course-${assignment.id}`] === 'sent' ? '✓ Sent' : emailStatus[`course-${assignment.id}`] === 'error' ? '✕ Failed' : '✉ Notify'}
                              </button>
                            </div>
                            {assignment.targetCompletionDate && (
                              <span className="overdue-badge" style={{ fontSize: '11px' }}>
                                Due {new Date(assignment.targetCompletionDate).toLocaleDateString()}
                              </span>
                            )}
                            {assignment.reviewerId && (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={emailStatus[`reviewer-${assignment.id}`] === 'sending'}
                                title="Notify learner about their reviewer"
                                style={{ color: emailStatus[`reviewer-${assignment.id}`] === 'sent' ? '#16a34a' : emailStatus[`reviewer-${assignment.id}`] === 'error' ? '#dc2626' : undefined }}
                                onClick={() => {
                                  const reviewer = allUsers.find((u) => u.id === assignment.reviewerId);
                                  notifyEmail(
                                    `reviewer-${assignment.id}`,
                                    () => Promise.all([
                                      sendReviewerAssignedEmail({
                                        toEmail: learner.email,
                                        toName: learner.name,
                                        reviewerName: reviewer?.name,
                                        courseId: selectedCourseId,
                                        courseName: selectedCourse?.title,
                                        from: { email: user?.email, name: user?.name },
                                      }),
                                      reviewer?.email && sendReviewerNewAssignmentEmail({
                                        toEmail: reviewer.email,
                                        reviewerName: reviewer.name,
                                        learnerName: learner.name,
                                        courseId: selectedCourseId,
                                        courseName: selectedCourse?.title,
                                        from: { email: user?.email, name: user?.name },
                                      }),
                                    ]),
                                    `Reviewer assignment emails sent — learner: ${learner.name} <${learner.email}>, reviewer: ${reviewer?.name} <${reviewer?.email}> for "${selectedCourse?.title}" by ${user?.name}`
                                  );
                                }}
                              >
                                {emailStatus[`reviewer-${assignment.id}`] === 'sending' ? '...' : emailStatus[`reviewer-${assignment.id}`] === 'sent' ? '✓ Sent' : emailStatus[`reviewer-${assignment.id}`] === 'error' ? '✕ Failed' : '✉ Reviewer Assigned'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openDeadlineModal(learner.id)}
                          >
                            Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* Deadline Modal */}
      {deadlineModal && (
        <div className="confirm-overlay" onClick={closeDeadlineModal}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px' }}>Set Deadline (optional)</h3>
            <div className="form-group">
              <label htmlFor="deadline-date">Target Completion Date</label>
              <input
                id="deadline-date"
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '4px' }}>
                Leave blank to assign without a deadline.
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeDeadlineModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssignWithDeadline}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
