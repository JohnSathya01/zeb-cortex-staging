// Sends email by POSTing to the Cloudflare Worker (cortex-mailer).
// The worker holds AWS credentials — nothing sensitive in the frontend.

const WORKER_URL = import.meta.env.VITE_MAILER_URL;

async function send(type, payload) {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Welcome — always from Cortex identity (worker default)
// Pass tempPassword so the email can show login credentials
export const sendWelcomeEmail = ({ toEmail, toName, tempPassword }) =>
  send('welcome', { toEmail, toName, tempPassword });

// Course assigned — from the leadership user who clicked
export const sendCourseAssignedEmail = ({ toEmail, toName, courseId, courseName, from }) =>
  send('course_assigned', { toEmail, toName, courseId, courseName, fromEmail: from?.email, fromName: from?.name });

// Reviewer assigned — notify learner, from leadership user
export const sendReviewerAssignedEmail = ({ toEmail, toName, reviewerName, courseId, courseName, from }) =>
  send('reviewer_assigned', { toEmail, toName, reviewerName, courseId, courseName, fromEmail: from?.email, fromName: from?.name });

// Reviewer new assignment — notify the reviewer, from leadership user
export const sendReviewerNewAssignmentEmail = ({ toEmail, reviewerName, learnerName, courseId, courseName, from }) =>
  send('reviewer_new_assignment', { toEmail, reviewerName, learnerName, courseId, courseName, fromEmail: from?.email, fromName: from?.name });

// Chat message notification
export const sendChatMessageEmail = ({ toEmail, toName, fromName, messagePreview, from }) =>
  send('chat_message', { toEmail, toName, fromName, messagePreview, fromEmail: from?.email, fromName: from?.name });

// Feedback submitted — notify learner about reviewer feedback
export const sendFeedbackNotificationEmail = async ({ learnerId, courseId, assignmentId, type, scores }) => {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/email/feedback-submitted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ learnerId, courseId, assignmentId, type, scores }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// Escalation — reviewer escalates a learner to leadership
export const sendEscalationEmail = async ({ learnerId, courseId, reviewerEmail, reviewerName, note }) => {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/email/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ learnerId, courseId, reviewerEmail, reviewerName, note }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// Course completed — notify reviewer for final feedback
export const sendCourseCompletedEmail = async ({ learnerId, courseId, reviewerId }) => {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/email/course-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ learnerId, courseId, reviewerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// Risk alert — triggered by reviewer for at-risk learners
export const sendRiskAlertEmail = async ({ userId, courseId, from }) => {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/email/risk-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, courseId, fromEmail: from?.email, fromName: from?.name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
