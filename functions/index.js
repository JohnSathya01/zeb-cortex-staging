const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const emails = require('./emails');

initializeApp();

// ─── Helper: get user profile from RTDB ───────────────────────────────────────
async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const db = getDatabase();
    const snap = await db.ref(`users/${uid}`).get();
    return snap.exists() ? snap.val() : null;
  } catch {
    return null;
  }
}

// ─── 1. Welcome email when a new user is created ─────────────────────────────
exports.onUserCreated = onValueCreated(
  { ref: '/users/{uid}', region: 'us-central1' },
  async (event) => {
    const user = event.data.val();
    if (!user?.email) return null;
    try {
      await emails.sendWelcomeEmail({ to: user.email, name: user.name });
      console.log(`Welcome email sent to ${user.email}`);
    } catch (err) {
      console.error('Failed to send welcome email:', err.message);
    }
    return null;
  }
);

// ─── 2. Course assigned email when a new assignment is created ────────────────
exports.onAssignmentCreated = onValueCreated(
  { ref: '/assignments/{assignmentId}', region: 'us-central1' },
  async (event) => {
    const assignment = event.data.val();
    if (!assignment?.learnerId || !assignment?.courseId) return null;

    const learner = await getUserProfile(assignment.learnerId);
    if (!learner?.email) return null;

    try {
      await emails.sendCourseAssignedEmail({
        to: learner.email,
        name: learner.name,
        courseId: assignment.courseId,
      });
      console.log(`Course assigned email sent to ${learner.email}`);
    } catch (err) {
      console.error('Failed to send course assigned email:', err.message);
    }
    return null;
  }
);

// ─── 3. Reviewer assigned email when reviewerId is set on an assignment ───────
exports.onReviewerAssigned = onValueWritten(
  { ref: '/assignments/{assignmentId}/reviewerId', region: 'us-central1' },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();

    // Only fire when reviewerId changes from null/empty to a real value
    if (!after || after === before) return null;

    try {
      const db = getDatabase();
      const assignmentSnap = await db.ref(`assignments/${event.params.assignmentId}`).get();
      const assignment = assignmentSnap.val();
      if (!assignment) return null;

      const [learner, reviewer] = await Promise.all([
        getUserProfile(assignment.learnerId),
        getUserProfile(after),
      ]);

      const emailJobs = [];

      // Notify learner
      if (learner?.email) {
        emailJobs.push(
          emails.sendReviewerAssignedEmail({
            to: learner.email,
            name: learner.name,
            reviewerName: reviewer?.name,
            courseId: assignment.courseId,
          })
        );
      }

      // Notify reviewer
      if (reviewer?.email) {
        emailJobs.push(
          emails.sendReviewerNewAssignmentEmail({
            to: reviewer.email,
            reviewerName: reviewer.name,
            learnerName: learner?.name,
            courseId: assignment.courseId,
          })
        );
      }

      await Promise.all(emailJobs);
      console.log(`Reviewer assigned emails sent for assignment ${event.params.assignmentId}`);
    } catch (err) {
      console.error('Failed to send reviewer assigned emails:', err.message);
    }
    return null;
  }
);

// ─── 4. Chat message notification ────────────────────────────────────────────
exports.onChatMessage = onValueCreated(
  { ref: '/chats/{assignmentId}/{messageId}', region: 'us-central1' },
  async (event) => {
    const msg = event.data.val();
    if (!msg?.senderId || !msg?.text) return null;

    try {
      const db = getDatabase();
      const assignmentSnap = await db.ref(`assignments/${event.params.assignmentId}`).get();
      const assignment = assignmentSnap.val();
      if (!assignment) return null;

      // Determine recipient: the person who did NOT send the message
      const recipientId =
        msg.senderId === assignment.learnerId
          ? assignment.reviewerId
          : assignment.learnerId;

      if (!recipientId) return null;

      const [sender, recipient] = await Promise.all([
        getUserProfile(msg.senderId),
        getUserProfile(recipientId),
      ]);

      if (!recipient?.email) return null;

      await emails.sendChatMessageEmail({
        to: recipient.email,
        recipientName: recipient.name,
        senderName: sender?.name || 'Someone',
        messagePreview: msg.text,
        assignmentId: event.params.assignmentId,
      });
      console.log(`Chat notification sent to ${recipient.email}`);
    } catch (err) {
      console.error('Failed to send chat notification:', err.message);
    }
    return null;
  }
);
