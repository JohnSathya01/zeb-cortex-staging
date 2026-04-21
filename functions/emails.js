const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
  },
});

const FROM = `Cortex <${process.env.AWS_SES_FROM_EMAIL || 'john.sathya@zeb.co'}>`;
const APP_URL = 'https://cortex-zeb.web.app';

// ─── Shared layout ────────────────────────────────────────────────────────────
function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0}
  .wrap{max-width:560px;margin:40px auto;background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2a2d3e}
  .header{background:#12151f;padding:28px 36px;border-bottom:1px solid #2a2d3e;display:flex;align-items:center;gap:12px}
  .logo-mark{width:32px;height:32px;background:#c4e04e;clip-path:polygon(0 85%,50% 0,100% 85%);display:inline-block;flex-shrink:0}
  .logo-text{font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px}
  .logo-text span{color:#c4e04e}
  .body{padding:32px 36px}
  .body h1{margin:0 0 8px;font-size:22px;font-weight:700;color:#fff}
  .body p{margin:0 0 16px;font-size:15px;line-height:1.6;color:#94a3b8}
  .highlight{background:#12151f;border-left:3px solid #c4e04e;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#e2e8f0}
  .btn{display:inline-block;margin:8px 0 0;padding:12px 28px;background:#c4e04e;color:#0f1117;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;letter-spacing:0.3px}
  .footer{padding:20px 36px;border-top:1px solid #2a2d3e;font-size:12px;color:#4a5068;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo-mark"></div>
    <div class="logo-text">Cortex<span>.</span></div>
  </div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    This is an automated message from Cortex by Zeb. Please do not reply to this email.<br/>
    <a href="${APP_URL}" style="color:#c4e04e;text-decoration:none;">cortex-zeb.web.app</a>
  </div>
</div>
</body>
</html>`;
}

// ─── Send helper ──────────────────────────────────────────────────────────────
async function send({ to, subject, html }) {
  if (!to) throw new Error('No recipient email');
  const cmd = new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });
  return ses.send(cmd);
}

// ─── Email templates ──────────────────────────────────────────────────────────

async function sendWelcomeEmail({ to, name }) {
  const html = layout('Welcome to Cortex', `
    <h1>Welcome to Cortex, ${name || 'there'}!</h1>
    <p>Your account has been created. Cortex is your learning hub — track your progress, complete exercises, and connect with your reviewer.</p>
    <div class="highlight">You've been added to the platform. Log in to see your assigned courses and get started.</div>
    <a class="btn" href="${APP_URL}">Open Cortex</a>
  `);
  return send({ to, subject: 'Welcome to Cortex', html });
}

async function sendCourseAssignedEmail({ to, name, courseId }) {
  const html = layout('New Course Assigned', `
    <h1>You have a new course</h1>
    <p>Hi ${name || 'there'}, a new course has been assigned to you on Cortex.</p>
    <div class="highlight">
      <strong>Course ID:</strong> ${courseId}<br/>
      Log in to view your course content, complete chapters, and track your progress.
    </div>
    <a class="btn" href="${APP_URL}/learner/course/${courseId}">View Course</a>
  `);
  return send({ to, subject: 'New course assigned on Cortex', html });
}

async function sendReviewerAssignedEmail({ to, name, reviewerName, courseId }) {
  const html = layout('Reviewer Assigned', `
    <h1>Your reviewer is ready</h1>
    <p>Hi ${name || 'there'}, <strong style="color:#c4e04e">${reviewerName || 'A reviewer'}</strong> has been assigned to support you on Cortex.</p>
    <p>Your reviewer can see your progress and is available via the chat interface inside your course.</p>
    <a class="btn" href="${APP_URL}/learner/course/${courseId}">Open Course</a>
  `);
  return send({ to, subject: 'Your reviewer has been assigned on Cortex', html });
}

async function sendReviewerNewAssignmentEmail({ to, reviewerName, learnerName, courseId }) {
  const html = layout('New Learner Assigned', `
    <h1>New learner assigned</h1>
    <p>Hi ${reviewerName || 'there'}, you've been assigned as a reviewer for <strong style="color:#c4e04e">${learnerName || 'a learner'}</strong> on Cortex.</p>
    <p>You can view their progress and communicate with them via the chat feature in the assignment.</p>
    <a class="btn" href="${APP_URL}/reviewer">Open Reviewer Dashboard</a>
  `);
  return send({ to, subject: `New learner assigned: ${learnerName || 'Unknown'}`, html });
}

async function sendChatMessageEmail({ to, recipientName, senderName, messagePreview, assignmentId }) {
  const preview = messagePreview ? messagePreview.slice(0, 120) + (messagePreview.length > 120 ? '…' : '') : '';
  const html = layout('New Message', `
    <h1>New message from ${senderName || 'someone'}</h1>
    <p>Hi ${recipientName || 'there'}, you have a new message in your Cortex assignment chat.</p>
    ${preview ? `<div class="highlight">"${preview}"</div>` : ''}
    <a class="btn" href="${APP_URL}">View Message</a>
    <p style="margin-top:16px;font-size:13px;color:#4a5068;">Reply directly in the Cortex chat — do not reply to this email.</p>
  `);
  return send({ to, subject: `New message from ${senderName || 'Cortex'}`, html });
}

module.exports = {
  sendWelcomeEmail,
  sendCourseAssignedEmail,
  sendReviewerAssignedEmail,
  sendReviewerNewAssignmentEmail,
  sendChatMessageEmail,
};
