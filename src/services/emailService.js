import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// Template IDs — create these in your EmailJS dashboard
const TEMPLATES = {
  welcome: 'template_welcome',
  courseAssigned: 'template_course_assigned',
  reviewerAssigned: 'template_reviewer_assigned',
  chatMessage: 'template_chat_message',
};

async function send(templateId, params) {
  if (!SERVICE_ID || !PUBLIC_KEY) {
    throw new Error('EmailJS not configured (missing VITE_EMAILJS_SERVICE_ID or VITE_EMAILJS_PUBLIC_KEY)');
  }
  return emailjs.send(SERVICE_ID, templateId, params, { publicKey: PUBLIC_KEY });
}

export async function sendWelcomeEmail({ toEmail, toName }) {
  return send(TEMPLATES.welcome, {
    to_email: toEmail,
    to_name: toName || 'there',
    app_url: 'https://cortex-zeb.web.app',
  });
}

export async function sendCourseAssignedEmail({ toEmail, toName, courseId, courseName }) {
  return send(TEMPLATES.courseAssigned, {
    to_email: toEmail,
    to_name: toName || 'there',
    course_name: courseName || courseId,
    course_url: `https://cortex-zeb.web.app/learner/course/${courseId}`,
    app_url: 'https://cortex-zeb.web.app',
  });
}

export async function sendReviewerAssignedEmail({ toEmail, toName, reviewerName, courseId, courseName }) {
  return send(TEMPLATES.reviewerAssigned, {
    to_email: toEmail,
    to_name: toName || 'there',
    reviewer_name: reviewerName || 'your reviewer',
    course_name: courseName || courseId,
    course_url: `https://cortex-zeb.web.app/learner/course/${courseId}`,
    app_url: 'https://cortex-zeb.web.app',
  });
}

export async function sendChatNotificationEmail({ toEmail, toName, fromName, messagePreview, appUrl }) {
  return send(TEMPLATES.chatMessage, {
    to_email: toEmail,
    to_name: toName || 'there',
    from_name: fromName || 'Someone',
    message_preview: messagePreview?.slice(0, 120) || '',
    app_url: appUrl || 'https://cortex-zeb.web.app',
  });
}
