/**
 * Cortex Worker — Email + Firebase Auth + AI Review
 *
 * POST /          { type, ...emailParams }   → send email via AWS SES
 * POST /auth/create  { email, password, displayName } → create Firebase Auth user
 * POST /auth/delete  { uid }                → delete Firebase Auth user
 * POST /ai/review    { exercisePrompt, learnerAnswer } → AI feedback via Workers AI
 *
 * Secrets (Cloudflare secrets, never in source):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY
 *   FIREBASE_API_KEY, FIREBASE_PROJECT_ID
 *
 * Bindings (wrangler.toml):
 *   AI  — Workers AI (free tier, no token needed)
 */

const ALLOWED_ORIGINS = [
  'https://cortex-zeb.web.app',
  'https://cortex-zeb.firebaseapp.com',
  'http://localhost:5173', // local dev
];

export default {
  async fetch(request, env) {
    _leadershipEmailsCache = null; // reset per-request
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }), corsOrigin);
    }

    if (request.method !== 'POST') {
      return corsResponse(new Response('Method Not Allowed', { status: 405 }), corsOrigin);
    }

    const url = new URL(request.url);

    // ── Firebase Auth routes ──────────────────────────────────────────────────
    if (url.pathname === '/auth/create') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      try {
        const uid = await createFirebaseUser(body, env);
        return corsResponse(Response.json({ ok: true, uid }), corsOrigin);
      } catch (err) {
        console.error('auth/create error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    if (url.pathname === '/auth/delete') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      try {
        await deleteFirebaseUser(body.uid, env);
        return corsResponse(Response.json({ ok: true }), corsOrigin);
      } catch (err) {
        console.error('auth/delete error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Ask Cortex — general AI Q&A for leadership ────────────────────────────
    if (url.pathname === '/ai/ask') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { question, history = [] } = body;
      if (!question?.trim()) return corsResponse(Response.json({ ok: false, error: 'No question provided' }, { status: 400 }), corsOrigin);
      try {
        const answer = await askCortex({ question, history }, env);
        return corsResponse(Response.json({ ok: true, answer }), corsOrigin);
      } catch (err) {
        console.error('ai/ask error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── AI Generate Assessments ────────────────────────────────────────────────
    if (url.pathname === '/ai/generate-assessments') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { topic, count = 3 } = body;
      if (!topic?.trim()) return corsResponse(Response.json({ ok: false, error: 'No topic provided' }, { status: 400 }), corsOrigin);
      try {
        const assessments = await generateAssessments({ topic, count }, env);
        return corsResponse(Response.json({ ok: true, assessments }), corsOrigin);
      } catch (err) {
        console.error('ai/generate-assessments error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── AI Generate Exercises ──────────────────────────────────────────────────
    if (url.pathname === '/ai/generate-exercises') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { topic, count = 2 } = body;
      if (!topic?.trim()) return corsResponse(Response.json({ ok: false, error: 'No topic provided' }, { status: 400 }), corsOrigin);
      try {
        const exercises = await generateExercises({ topic, count }, env);
        return corsResponse(Response.json({ ok: true, exercises }), corsOrigin);
      } catch (err) {
        console.error('ai/generate-exercises error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Course Points — Calculate & Save ──────────────────────────────────────
    if (url.pathname === '/points/calculate') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { userId, courseId, totalChapters, assignmentId, sendEmail: doEmail = false } = body;
      if (!userId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing userId or courseId' }, { status: 400 }), corsOrigin);
      try {
        const result = await calcCoursePoints({ userId, courseId, totalChapters, assignmentId, doEmail }, env);
        return corsResponse(Response.json({ ok: true, ...result }), corsOrigin);
      } catch (err) {
        console.error('points/calculate error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Course Points — Get ────────────────────────────────────────────────────
    if (url.pathname === '/points/get') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { userId, courseId } = body;
      if (!userId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing userId or courseId' }, { status: 400 }), corsOrigin);
      try {
        const token = await getGoogleAccessToken(env);
        const projectId = env.FIREBASE_PROJECT_ID;
        const res = await fetch(`https://${projectId}-default-rtdb.firebaseio.com/coursePoints/${userId}/${courseId}.json?access_token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data && typeof data === 'object' && data.error) throw new Error(data.error);
        return corsResponse(Response.json({ ok: true, points: data || null }), corsOrigin);
      } catch (err) {
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Course Points — At-Risk (leadership) ──────────────────────────────────
    if (url.pathname === '/points/at-risk') {
      try {
        const token = await getGoogleAccessToken(env);
        const projectId = env.FIREBASE_PROJECT_ID;
        const dbUrl = (path) => `https://${projectId}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
        const r = async (path) => {
          const res = await fetch(dbUrl(path));
          const data = await res.json();
          if (data && typeof data === 'object' && data.error) throw new Error(data.error);
          return data;
        };

        const [allPoints, allAssignments, allUsers] = await Promise.all([
          r('coursePoints'),
          r('assignments'),
          r('users'),
        ]);

        const atRisk = [];
        for (const [uid, courses] of Object.entries(allPoints || {})) {
          for (const [cid, pts] of Object.entries(courses || {})) {
            if (pts.status === 'at_risk' || pts.status === 'critical') {
              const user = (allUsers || {})[uid] || {};
              // Find assignment
              const asgEntry = Object.entries(allAssignments || {}).find(([, a]) => a.learnerId === uid && a.courseId === cid);
              const assignment = asgEntry ? asgEntry[1] : {};
              atRisk.push({
                userId: uid,
                courseId: cid,
                learnerName: user.name || uid,
                learnerEmail: user.email || '',
                points: pts.total,
                status: pts.status,
                timeline: pts.timeline,
                ai: pts.ai,
                reviewer: pts.reviewer,
                lastCalculated: pts.lastCalculated,
                targetCompletionDate: assignment.targetCompletionDate || null,
                reviewerId: assignment.reviewerId || null,
              });
            }
          }
        }
        atRisk.sort((a, b) => a.points - b.points);
        return corsResponse(Response.json({ ok: true, atRisk }), corsOrigin);
      } catch (err) {
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Progress read (admin) — for reviewer access ───────────────────────────
    if (url.pathname === '/progress') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { learnerId, courseId } = body;
      if (!learnerId || !courseId) {
        return corsResponse(Response.json({ ok: false, error: 'Missing learnerId or courseId' }, { status: 400 }), corsOrigin);
      }
      try {
        const token = await getGoogleAccessToken(env);
        const projectId = env.FIREBASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}-default-rtdb.firebaseio.com/progress/${learnerId}/${courseId}.json?access_token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (data && typeof data === 'object' && data.error) throw new Error(data.error);
        return corsResponse(Response.json({ ok: true, data: data || null }), corsOrigin);
      } catch (err) {
        console.error('progress error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── AI Review route ───────────────────────────────────────────────────────
    if (url.pathname === '/ai/review') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { exercisePrompt, learnerAnswer } = body;
      if (!learnerAnswer?.trim()) {
        return corsResponse(Response.json({ ok: false, error: 'No answer provided' }, { status: 400 }), corsOrigin);
      }
      try {
        const feedback = await reviewWithAI({ exercisePrompt, learnerAnswer }, env);
        return corsResponse(Response.json({ ok: true, feedback }), corsOrigin);
      } catch (err) {
        console.error('ai/review error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── AI Feedback Scores ──────────────────────────────────────────────────────
    if (url.pathname === '/ai/feedback-scores') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { assignmentId, learnerId, courseId, feedbackText } = body;
      if (!learnerId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing learnerId or courseId' }, { status: 400 }), corsOrigin);
      try {
        const scores = await suggestFeedbackScores({ assignmentId, learnerId, courseId, feedbackText }, env);
        return corsResponse(Response.json({ ok: true, scores }), corsOrigin);
      } catch (err) {
        console.error('ai/feedback-scores error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Escalation Email ──────────────────────────────────────────────────────
    if (url.pathname === '/email/escalate') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { learnerId, courseId, reviewerEmail, reviewerName, note } = body;
      if (!learnerId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing learnerId or courseId' }, { status: 400 }), corsOrigin);
      try {
        const token = await getGoogleAccessToken(env);
        const pid = env.FIREBASE_PROJECT_ID;
        const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
        const rd = async (path) => { const res = await fetch(dbUrl(path)); const d = await res.json(); if (d && typeof d === 'object' && d.error) throw new Error(d.error); return d; };

        const [learner, pts] = await Promise.all([rd(`users/${learnerId}`), rd(`coursePoints/${learnerId}/${courseId}`)]);
        const learnerName = learner?.name || learnerId;
        const total = pts?.total ?? 0;
        const status = pts?.status || 'unknown';
        const statusLabel = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[status] || status;
        const statusColor = { on_track: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' }[status] || '#9ca3af';
        const app = env.APP_URL || 'https://cortex-zeb.web.app';

        const subject = `[Escalation] ${learnerName} - ${courseId} (${total} pts, ${statusLabel})`;
        const html = layout(`
          ${h1('Learner Escalation')}
          ${p(`<strong style="color:#fff">${reviewerName || 'A reviewer'}</strong> has escalated <strong style="color:#fff">${learnerName}</strong> for course <strong style="color:#fff">${courseId}</strong>.`)}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
            <tr><td style="background:#12151f;border-radius:10px;padding:16px;text-align:center;border-left:4px solid ${statusColor}">
              <div style="font-size:40px;font-weight:800;color:${statusColor};line-height:1">${total}</div>
              <div style="font-size:12px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:1px;margin-top:4px">${statusLabel}</div>
            </td></tr>
          </table>
          ${note ? box(`<strong style="color:#fff">Reviewer's Note:</strong><br/><br/>${note}`) : ''}
          ${cta('View Learner Progress', `${app}/reviewer`)}
        `);

        const from = reviewerEmail ? `${reviewerName || reviewerEmail} <${reviewerEmail}>` : `${env.FROM_NAME} <${env.FROM_EMAIL}>`;
        const leadershipEmails = await getLeadershipCcList(env, []);
        const to = leadershipEmails.length > 0 ? leadershipEmails.join(', ') : env.CC_EMAIL;
        const ccList = [];
        if (reviewerEmail && !leadershipEmails.includes(reviewerEmail.toLowerCase())) ccList.push(reviewerEmail);
        const cc = ccList.length > 0 ? ccList.join(', ') : null;
        const messageId = await sendSES({ from, to, cc, subject, html }, env);
        return corsResponse(Response.json({ ok: true, messageId }), corsOrigin);
      } catch (err) {
        console.error('escalate error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Course Completed Email ─────────────────────────────────────────────────
    if (url.pathname === '/email/course-completed') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { learnerId, courseId, reviewerId } = body;
      if (!learnerId || !courseId || !reviewerId) return corsResponse(Response.json({ ok: false, error: 'Missing fields' }, { status: 400 }), corsOrigin);
      try {
        const token = await getGoogleAccessToken(env);
        const pid = env.FIREBASE_PROJECT_ID;
        const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
        const rd = async (path) => { const res = await fetch(dbUrl(path)); const d = await res.json(); if (d && typeof d === 'object' && d.error) throw new Error(d.error); return d; };

        const [learner, reviewer] = await Promise.all([rd(`users/${learnerId}`), rd(`users/${reviewerId}`)]);
        if (!reviewer?.email) return corsResponse(Response.json({ ok: false, error: 'Reviewer has no email' }, { status: 400 }), corsOrigin);

        const learnerName = learner?.name || learnerId;
        const app = env.APP_URL || 'https://cortex-zeb.web.app';
        const subject = `Cortex: ${learnerName} completed ${courseId} - Final feedback needed`;
        const html = layout(`
          ${h1('Course Completed')}
          ${p(`Hi ${reviewer.name || 'there'}, <strong style="color:#fff">${learnerName}</strong> has completed all chapters in <strong style="color:#fff">${courseId}</strong>.`)}
          ${box(`Please schedule a meeting with ${learnerName} and submit your <strong style="color:#c4e04e">final feedback</strong> on the four aspects: Attitude, Communication, Business, and Technology.`)}
          ${cta('Submit Final Feedback', `${app}/reviewer`)}
        `);

        const ccList = await getLeadershipCcList(env, [reviewer.email]);
        const cc = ccList.length > 0 ? ccList.join(', ') : null;
        const messageId = await sendSES({ from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, to: reviewer.email, cc, subject, html }, env);
        return corsResponse(Response.json({ ok: true, messageId }), corsOrigin);
      } catch (err) {
        console.error('course-completed error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Feedback Submitted Email ─────────────────────────────────────────────
    if (url.pathname === '/email/feedback-submitted') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { learnerId, courseId, assignmentId, type, scores } = body;
      if (!learnerId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing fields' }, { status: 400 }), corsOrigin);
      try {
        const token = await getGoogleAccessToken(env);
        const pid = env.FIREBASE_PROJECT_ID;
        const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
        const rd = async (path) => { const res = await fetch(dbUrl(path)); const d = await res.json(); if (d && typeof d === 'object' && d.error) throw new Error(d.error); return d; };

        const [learner, assignment] = await Promise.all([rd(`users/${learnerId}`), assignmentId ? rd(`assignments/${assignmentId}`) : null]);
        if (!learner?.email) return corsResponse(Response.json({ ok: false, error: 'Learner has no email' }, { status: 400 }), corsOrigin);

        const reviewerName = assignment?.reviewerId ? ((await rd(`users/${assignment.reviewerId}`))?.name || 'Your reviewer') : 'Your reviewer';
        const total = scores ? Math.round(((scores.attitude + scores.communication + scores.business + scores.technology) / 4) * 3) : 0;
        const typeLabel = type === 'final' ? 'Final Course Review' : 'Weekly Review';
        const app = env.APP_URL || 'https://cortex-zeb.web.app';

        const subject = `Cortex: ${typeLabel} Feedback Received - ${courseId}`;
        const html = layout(`
          ${h1(`${typeLabel} Feedback`)}
          ${p(`Hi ${learner.name || 'there'}, <strong style="color:#fff">${reviewerName}</strong> has submitted ${type === 'final' ? 'final' : 'weekly'} feedback for your course <strong style="color:#fff">${courseId}</strong>.`)}
          ${box(`<table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Attitude</td><td style="text-align:right;font-weight:700;color:#e2e8f0;font-size:13px">${scores?.attitude ?? 0}/10</td></tr>
            <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Communication</td><td style="text-align:right;font-weight:700;color:#e2e8f0;font-size:13px">${scores?.communication ?? 0}/10</td></tr>
            <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Business</td><td style="text-align:right;font-weight:700;color:#e2e8f0;font-size:13px">${scores?.business ?? 0}/10</td></tr>
            <tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">Technology</td><td style="text-align:right;font-weight:700;color:#e2e8f0;font-size:13px">${scores?.technology ?? 0}/10</td></tr>
            <tr><td colspan="2" style="border-top:1px solid #2a2d3e;padding-top:8px"></td></tr>
            <tr><td style="font-weight:700;color:#e2e8f0;font-size:14px">Reviewer Score</td><td style="text-align:right;font-weight:800;color:#c4e04e;font-size:14px">${total}/30</td></tr>
          </table>`)}
          ${cta('View My Points', `${app}/learner/my-points`)}
        `);

        const ccList = await getLeadershipCcList(env, [learner.email]);
        const cc = ccList.length > 0 ? ccList.join(', ') : null;
        const messageId = await sendSES({ from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, to: learner.email, cc, subject, html }, env);
        return corsResponse(Response.json({ ok: true, messageId }), corsOrigin);
      } catch (err) {
        console.error('feedback-submitted email error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Risk Alert Email ───────────────────────────────────────────────────────
    if (url.pathname === '/email/risk-alert') {
      let body;
      try { body = await request.json(); } catch { return corsResponse(new Response('Invalid JSON', { status: 400 }), corsOrigin); }
      const { userId, courseId, fromEmail, fromName } = body;
      if (!userId || !courseId) return corsResponse(Response.json({ ok: false, error: 'Missing userId or courseId' }, { status: 400 }), corsOrigin);
      try {
        const token = await getGoogleAccessToken(env);
        const pid = env.FIREBASE_PROJECT_ID;
        const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
        const rd = async (path) => { const res = await fetch(dbUrl(path)); const d = await res.json(); if (d && typeof d === 'object' && d.error) throw new Error(d.error); return d; };

        const [learner, pts, allAssignments] = await Promise.all([
          rd(`users/${userId}`), rd(`coursePoints/${userId}/${courseId}`), rd('assignments'),
        ]);
        if (!learner?.email) return corsResponse(Response.json({ ok: false, error: 'Learner has no email' }, { status: 400 }), corsOrigin);
        if (!pts) return corsResponse(Response.json({ ok: false, error: 'No points data' }, { status: 400 }), corsOrigin);

        const { subject, html } = buildPointsAlertEmail({
          toName: learner.name || 'Learner', courseName: courseId,
          points: pts.total, prevPoints: null, status: pts.status, prevStatus: null,
          timeline: pts.timeline, ai: pts.ai, reviewer: pts.reviewer,
          timelineDetail: pts.timelineDetail || {}, app: env.APP_URL || 'https://cortex-zeb.web.app',
        });

        // Sender: use the reviewer who triggered the alert
        const from = fromEmail
          ? `${fromName || fromEmail} <${fromEmail}>`
          : `${env.FROM_NAME} <${env.FROM_EMAIL}>`;

        const ccList = await getLeadershipCcList(env, [learner.email]);
        // Always CC the sender (reviewer) so they get a copy
        if (fromEmail && fromEmail.toLowerCase() !== learner.email.toLowerCase() && !ccList.includes(fromEmail.toLowerCase())) ccList.push(fromEmail);
        const asgEntry = Object.entries(allAssignments || {}).find(([, a]) => a.learnerId === userId && a.courseId === courseId);
        if (asgEntry) {
          const revId = asgEntry[1].reviewerId;
          if (revId) { const rev = await rd(`users/${revId}`); if (rev?.email && rev.email.toLowerCase() !== learner.email.toLowerCase() && !ccList.includes(rev.email)) ccList.push(rev.email); }
        }

        const cc = ccList.length > 0 ? ccList.join(', ') : null;
        const messageId = await sendSES({ from, to: learner.email, cc, subject: `[Risk Alert] ${subject}`, html }, env);
        return corsResponse(Response.json({ ok: true, messageId }), corsOrigin);
      } catch (err) {
        console.error('risk-alert error:', err.message);
        return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
      }
    }

    // ── Email route (default POST /) ──────────────────────────────────────────
    let payload;
    try {
      payload = await request.json();
    } catch {
      return corsResponse(new Response('Invalid JSON body', { status: 400 }), corsOrigin);
    }

    const { type, toEmail, toName, fromEmail, fromName, ...rest } = payload;

    if (!type || !toEmail) {
      return corsResponse(new Response('Missing required fields: type, toEmail', { status: 400 }), corsOrigin);
    }

    // Build the from address — welcome always from Cortex identity, others from the acting user
    const isWelcome = type === 'welcome';
    const from = isWelcome
      ? `${env.FROM_NAME} <${env.FROM_EMAIL}>`
      : fromEmail
        ? `${fromName || fromEmail} <${fromEmail}>`
        : `${env.FROM_NAME} <${env.FROM_EMAIL}>`;

    // CC all leadership users
    const leadershipCc = await getLeadershipCcList(env, [toEmail]);
    const cc = leadershipCc.length > 0 ? leadershipCc.join(', ') : null;

    const app = env.APP_URL || 'https://cortex-zeb.web.app';

    let subject, html;
    try {
      ({ subject, html } = buildEmail(type, { toName, app, ...rest }));
    } catch (err) {
      return corsResponse(new Response(`Unknown email type: ${type}`, { status: 400 }), corsOrigin);
    }

    try {
      const messageId = await sendSES({ from, to: toEmail, cc, subject, html }, env);
      return corsResponse(Response.json({ ok: true, messageId }), corsOrigin);
    } catch (err) {
      console.error('SES error:', err.message);
      return corsResponse(Response.json({ ok: false, error: err.message }, { status: 502 }), corsOrigin);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyNotifications(env));
  },
};

/** Count weekdays (Mon-Fri) between two dates, inclusive of start, exclusive of end */
function countWeekdays(startDate, endDate) {
  let count = 0;
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Fetch all leadership user emails for CC. Results cached per-request via closure. */
let _leadershipEmailsCache = null;
async function getLeadershipCcList(env, excludeEmails = []) {
  if (!_leadershipEmailsCache) {
    try {
      const token = await getGoogleAccessToken(env);
      const pid = env.FIREBASE_PROJECT_ID;
      const res = await fetch(`https://${pid}-default-rtdb.firebaseio.com/users.json?access_token=${encodeURIComponent(token)}`);
      const users = await res.json();
      if (users && typeof users === 'object' && !users.error) {
        _leadershipEmailsCache = Object.values(users)
          .filter(u => u.role === 'leadership' && u.email)
          .map(u => u.email.toLowerCase());
      } else {
        _leadershipEmailsCache = [];
      }
    } catch {
      _leadershipEmailsCache = [];
    }
  }
  const excluded = new Set(excludeEmails.map(e => e.toLowerCase()));
  return _leadershipEmailsCache.filter(e => !excluded.has(e));
}

function corsResponse(response, origin) {
  const r = new Response(response.body, response);
  r.headers.set('Access-Control-Allow-Origin', origin);
  r.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return r;
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildEmail(type, params) {
  switch (type) {
    case 'welcome':
      return {
        subject: 'Welcome to Cortex',
        html: tmplWelcome(params),
      };
    case 'course_assigned':
      return {
        subject: `New course assigned: ${params.courseName || params.courseId}`,
        html: tmplCourseAssigned(params),
      };
    case 'reviewer_assigned':
      return {
        subject: 'Your reviewer has been assigned on Cortex',
        html: tmplReviewerAssigned(params),
      };
    case 'reviewer_new_assignment':
      return {
        subject: `New learner assigned: ${params.learnerName}`,
        html: tmplReviewerNewAssignment(params),
      };
    case 'chat_message':
      return {
        subject: `New message from ${params.fromName} on Cortex`,
        html: tmplChatMessage(params),
      };
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

function layout(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2a2d3e;max-width:560px;width:100%">
      <tr>
        <td style="background:#12151f;padding:24px 32px;border-bottom:1px solid #2a2d3e">
          <table cellpadding="0" cellspacing="0"><tr>
            <td width="12" style="background:#c4e04e;width:12px;height:22px;clip-path:polygon(0 100%,50% 0,100% 100%)">&nbsp;</td>
            <td style="padding-left:10px;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px">Cortex<span style="color:#c4e04e">.</span></td>
          </tr></table>
        </td>
      </tr>
      <tr><td style="padding:32px">${bodyHtml}</td></tr>
      <tr>
        <td style="padding:20px 32px;border-top:1px solid #2a2d3e;font-size:12px;color:#4a5068;line-height:1.6">
          Automated message from Cortex by Zeb. Do not reply to this email.<br/>
          <a href="https://cortex-zeb.web.app" style="color:#c4e04e;text-decoration:none">cortex-zeb.web.app</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const h1  = t => `<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fff;line-height:1.3">${t}</h1>`;
const p   = t => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#94a3b8">${t}</p>`;
const box = t => `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:#12151f;border-left:3px solid #c4e04e;border-radius:4px;padding:12px 16px;font-size:14px;color:#e2e8f0;line-height:1.7">${t}</td></tr></table>`;
const cta = (label, url) => `<table cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td style="background:#c4e04e;border-radius:8px;padding:12px 28px"><a href="${url}" style="color:#0f1117;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.3px">${label}</a></td></tr></table>`;
const hi  = t => `<strong style="color:#c4e04e">${t}</strong>`;

function tmplWelcome({ toName, app, tempPassword, toEmail }) {
  const credBlock = (toEmail || tempPassword)
    ? box(`${hi('Your login credentials')}<br/><br/>
${toEmail    ? `${hi('Email:')} ${toEmail}<br/>`       : ''}
${tempPassword ? `${hi('Temporary password:')} <code style="background:#1e2235;padding:2px 6px;border-radius:4px;font-family:monospace;color:#c4e04e">${tempPassword}</code><br/><br/>
<span style="color:#f59e0b;font-size:13px">You will be asked to set a new password when you first log in.</span>` : ''}`)
    : '';
  return layout(`
    ${h1(`Welcome to Cortex${toName ? `, ${toName}` : ''}!`)}
    ${p('Your account is ready. Cortex is your AI learning platform at Zeb — complete courses, track your progress, and connect with your reviewer.')}
    ${credBlock}
    ${cta('Log in to Cortex', app)}
  `);
}

function tmplCourseAssigned({ toName, courseName, courseId, app }) {
  return layout(`
    ${h1('New course assigned')}
    ${p(`Hi ${toName || 'there'}, a course has been assigned to you on Cortex.`)}
    ${box(`${hi('Course:')} ${courseName || courseId}`)}
    ${cta('View Course', `${app}/learner/course/${courseId}`)}
  `);
}

function tmplReviewerAssigned({ toName, reviewerName, courseName, courseId, app }) {
  return layout(`
    ${h1('Your reviewer is ready')}
    ${p(`Hi ${toName || 'there'}, ${hi(reviewerName || 'a reviewer')} has been assigned to support you on Cortex.`)}
    ${box(`${hi('Course:')} ${courseName || courseId}<br/>${hi('Reviewer:')} ${reviewerName || '—'}`)}
    ${p('Your reviewer can see your progress and is available via the chat inside your course.')}
    ${cta('Open Course', `${app}/learner/course/${courseId}`)}
  `);
}

function tmplReviewerNewAssignment({ reviewerName, learnerName, courseName, courseId, app }) {
  return layout(`
    ${h1('New learner assigned')}
    ${p(`Hi ${reviewerName || 'there'}, you've been assigned as reviewer for ${hi(learnerName || 'a learner')} on Cortex.`)}
    ${box(`${hi('Learner:')} ${learnerName}<br/>${hi('Course:')} ${courseName || courseId}`)}
    ${cta('Open Reviewer Dashboard', `${app}/reviewer`)}
  `);
}

function tmplChatMessage({ toName, fromName, messagePreview, app }) {
  const excerpt = messagePreview
    ? `"${messagePreview.slice(0, 160)}${messagePreview.length > 160 ? '…' : ''}"`
    : '';
  return layout(`
    ${h1(`New message from ${fromName || 'someone'}`)}
    ${p(`Hi ${toName || 'there'}, you have a new message in your Cortex chat.`)}
    ${excerpt ? box(`<em style="color:#94a3b8">${excerpt}</em>`) : ''}
    ${p('<span style="font-size:13px;color:#4a5068">Reply inside Cortex — do not reply to this email.</span>')}
    ${cta('View Message', app)}
  `);
}

// ─── AWS SES via SendRawEmail + Signature V4 ──────────────────────────────────

async function sendSES({ from, to, cc, subject, html }, env) {
  const region = env.SES_REGION || 'us-east-1';
  const plainText = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const boundary = `boundary_${Date.now()}`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const mime = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const encoded = btoa(unescape(encodeURIComponent(mime)));
  const body = `Action=SendRawEmail&RawMessage.Data=${encodeURIComponent(encoded)}`;
  const url = `https://email.${region}.amazonaws.com/`;

  const sigHeaders = await sigV4(body, url, region, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY);

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sigHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);

  const match = text.match(/<MessageId>([^<]+)<\/MessageId>/);
  return match ? match[1] : 'ok';
}

// ─── AWS Signature V4 (WebCrypto — available in Cloudflare Workers) ───────────

async function sigV4(body, url, region, accessKeyId, secretAccessKey) {
  const now     = new Date();
  const date    = now.toISOString().slice(0, 10).replace(/-/g, '');
  const datetime = `${date}T${now.toISOString().slice(11, 19).replace(/:/g, '')}Z`;
  const host    = new URL(url).host;
  const bodyHash = await sha256hex(body);

  const signedHeaders   = 'content-type;host;x-amz-date';
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${datetime}\n`;
  const canonicalReq    = ['POST', '/', '', canonicalHeaders, signedHeaders, bodyHash].join('\n');

  const scope       = `${date}/${region}/email/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, await sha256hex(canonicalReq)].join('\n');

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'email');
  const kSigning = await hmac(kService, 'aws4_request');
  const sig      = hex(await hmac(kSigning, stringToSign));

  return {
    'x-amz-date': datetime,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

async function hmac(key, msg) {
  const k  = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(msg)));
}

async function sha256hex(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return hex(new Uint8Array(buf));
}

function hex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Cloudflare Workers AI — Ask Cortex (General Q&A) ────────────────────────

async function askCortex({ question, history }, env) {
  const messages = [
    {
      role: 'system',
      content: `You are Cortex AI, an intelligent assistant embedded in Zeb's Cortex learning management platform. \
You help leadership with course design, learner strategy, training content, and platform questions. \
Be concise, practical, and helpful. Keep answers focused — 2-5 sentences unless more detail is clearly needed.`,
    },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];
  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { max_tokens: 1024, messages });
  return result.response;
}

// ─── Cloudflare Workers AI — Generate Assessments (MCQs) ─────────────────────

async function generateAssessments({ topic, count }, env) {
  const n = Math.min(Math.max(parseInt(count) || 3, 1), 6);
  const system = `You are a course assessment designer. Generate multiple-choice questions (MCQs) in strict JSON.
Output ONLY a valid JSON array — no explanation, no markdown, no extra text.
Each item: { "question": "string", "options": [{ "text": "string", "isCorrect": false }, ...] }
Rules: exactly 4 options per question, exactly 1 correct answer (isCorrect: true), others false.`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    max_tokens: 2048,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Generate ${n} MCQ assessments about: ${topic}` },
    ],
  });

  const text = result.response.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI response did not contain a JSON array');
  const parsed = JSON.parse(match[0]);
  // Validate shape
  return parsed.filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2);
}

// ─── Cloudflare Workers AI — Generate Exercises ───────────────────────────────

async function generateExercises({ topic, count }, env) {
  const n = Math.min(Math.max(parseInt(count) || 2, 1), 5);
  const system = `You are a course exercise designer. Generate practical learning exercises in strict JSON.
Output ONLY a valid JSON array — no explanation, no markdown, no extra text.
Each item: { "title": "string", "prompt": "string", "hint": "string", "explanation": "string" }
- title: short exercise name (5 words max)
- prompt: clear learner instructions (1-3 sentences)
- hint: optional guidance shown on wrong answer (1 sentence, can be "")
- explanation: what a strong answer looks like (1 sentence, can be "")`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    max_tokens: 2048,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Generate ${n} exercises about: ${topic}` },
    ],
  });

  const text = result.response.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI response did not contain a JSON array');
  const parsed = JSON.parse(match[0]);
  return parsed.filter((e) => e.title && e.prompt);
}

// ─── Cloudflare Workers AI — Exercise Review ──────────────────────────────────

async function reviewWithAI({ exercisePrompt, learnerAnswer }, env) {
  const system = `You are an AI tutor on the Cortex learning platform at Zeb. \
Your job is to review a learner's written exercise answer and give clear, constructive feedback. \
Be encouraging but honest. Highlight what they got right, point out any gaps or misconceptions, \
and suggest one concrete improvement. Keep your response to 3-5 sentences.`;

  const userMsg = exercisePrompt
    ? `Exercise prompt:\n${exercisePrompt}\n\nLearner's answer:\n${learnerAnswer}`
    : `Learner's answer:\n${learnerAnswer}`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    max_tokens: 512,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: userMsg },
    ],
  });

  return result.response;
}

// ─── Course Points Engine ─────────────────────────────────────────────────────

async function calcCoursePoints({ userId, courseId, totalChapters, assignmentId, doEmail }, env) {
  const token = await getGoogleAccessToken(env);
  const pid = env.FIREBASE_PROJECT_ID;
  const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
  const r = async (path) => {
    const res = await fetch(dbUrl(path));
    const data = await res.json();
    if (data && typeof data === 'object' && data.error) throw new Error(`Firebase read error at ${path}: ${data.error}`);
    return data;
  };
  const w = async (path, data) => {
    const res = await fetch(dbUrl(path), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await res.json();
    if (result && typeof result === 'object' && result.error) throw new Error(`Firebase write error at ${path}: ${result.error}`);
  };

  const [progressData, existingPoints] = await Promise.all([
    r(`progress/${userId}/${courseId}`),
    r(`coursePoints/${userId}/${courseId}`),
  ]);

  // Find assignment
  let assignment = null;
  let asgId = assignmentId;
  if (assignmentId) {
    assignment = await r(`assignments/${assignmentId}`);
  }
  if (!assignment) {
    const all = await r('assignments');
    for (const [key, a] of Object.entries(all || {})) {
      if (a.learnerId === userId && a.courseId === courseId) { assignment = a; asgId = key; break; }
    }
  }

  // 1. Timeline score (-20 to +40)
  let timelineScore = 0;
  const completedCount = (progressData?.completedChapterIds || []).length;
  const chapTotal = Math.max(totalChapters || 1, 1);
  const actualPct = Math.min((completedCount / chapTotal) * 100, 100);
  let timelineDetail = { expectedPct: 0, actualPct: Math.round(actualPct), daysElapsed: 0, totalDays: 0, gap: 0 };

  if (assignment?.assignedAt && assignment?.targetCompletionDate) {
    const now = Date.now();
    const start = new Date(assignment.assignedAt).getTime();
    const end = new Date(assignment.targetCompletionDate).getTime();
    const totalMs = end - start;
    if (totalMs > 0) {
      // Count only weekdays (Mon-Fri) for timeline calculation
      const totalWeekdays = countWeekdays(new Date(start), new Date(end));
      const elapsedWeekdays = countWeekdays(new Date(start), new Date(Math.min(now, end)));
      const ratio = totalWeekdays > 0 ? Math.min(elapsedWeekdays / totalWeekdays, 1.2) : 0;
      const expectedPct = Math.min(ratio * 100, 100);
      const gap = actualPct - expectedPct;
      timelineDetail = {
        expectedPct: Math.round(expectedPct),
        actualPct: Math.round(actualPct),
        daysElapsed: elapsedWeekdays,
        totalDays: totalWeekdays,
        gap: Math.round(gap),
      };
      timelineScore = gap >= 0
        ? Math.min(40, Math.round(20 + gap * 0.5))
        : Math.max(-20, Math.round(gap * 0.4));
    }
  }

  // 2. AI engagement score (-10 to +30)
  let aiScore = 0;
  const subs = Object.values(progressData?.exerciseSubmissions || {});
  const totalSubs = subs.length;
  const aiSubs = subs.filter(s => s.aiReview && String(s.aiReview).trim().length > 10).length;
  const aiDetail = { totalSubmissions: totalSubs, aiEngaged: aiSubs, rate: totalSubs > 0 ? Math.round((aiSubs / totalSubs) * 100) : 0 };
  if (totalSubs > 0) {
    const rate = aiSubs / totalSubs;
    if (rate >= 0.9) aiScore = 30;
    else if (rate >= 0.7) aiScore = 22;
    else if (rate >= 0.5) aiScore = 15;
    else if (rate >= 0.25) aiScore = 5;
    else aiScore = -10;
  }

  // 3. Reviewer feedback score (0 to +30)
  let reviewerScore = 0;
  let reviewerDetail = { attitude: 0, communication: 0, business: 0, technology: 0, source: 'none' };
  if (asgId) {
    const feedbackData = await r(`reviewerFeedback/${asgId}`);
    let feedback = null;
    if (feedbackData?.final) {
      feedback = feedbackData.final;
      reviewerDetail.source = 'final';
    } else if (feedbackData?.weekly) {
      const weeks = Object.entries(feedbackData.weekly);
      weeks.sort((a, b) => b[0].localeCompare(a[0]));
      if (weeks.length > 0) { feedback = weeks[0][1]; reviewerDetail.source = 'weekly'; }
    }
    if (feedback) {
      const { attitude = 0, communication = 0, business = 0, technology = 0 } = feedback;
      reviewerDetail = { attitude, communication, business, technology, source: reviewerDetail.source };
      reviewerScore = Math.round(((attitude + communication + business + technology) / 4) * 3);
    }
  }

  const totalScore = timelineScore + aiScore + reviewerScore;
  const status = totalScore >= 80 ? 'on_track' : totalScore >= 60 ? 'at_risk' : 'critical';

  const pointsData = {
    total: totalScore, timeline: timelineScore, ai: aiScore, reviewer: reviewerScore,
    timelineDetail, aiDetail, reviewerDetail,
    status, lastCalculated: new Date().toISOString(),
  };
  await w(`coursePoints/${userId}/${courseId}`, pointsData);

  // Send email if status changed or big point swing
  if (doEmail) {
    const prevStatus = existingPoints?.status;
    const prevTotal = existingPoints?.total ?? null;
    const shouldNotify = !existingPoints || prevStatus !== status || (prevTotal !== null && Math.abs(prevTotal - totalScore) >= 10);

    if (shouldNotify) {
      try {
        const [learner, allUsers] = await Promise.all([r(`users/${userId}`), r('users')]);
        const reviewerId = assignment?.reviewerId;
        const reviewer = reviewerId ? ((allUsers || {})[reviewerId] || {}) : null;

        if (learner?.email) {
          const ccList = await getLeadershipCcList(env, [learner.email]);
          if (reviewer?.email && reviewer.email.toLowerCase() !== learner.email.toLowerCase() && !ccList.includes(reviewer.email.toLowerCase())) ccList.push(reviewer.email);

          const app = env.APP_URL || 'https://cortex-zeb.web.app';
          const { subject, html } = buildPointsAlertEmail({
            toName: learner.name || 'Learner', courseName: courseId,
            points: totalScore, prevPoints: prevTotal, status, prevStatus,
            timeline: timelineScore, ai: aiScore, reviewer: reviewerScore,
            timelineDetail, app,
          });
          const from = `${env.FROM_NAME} <${env.FROM_EMAIL}>`;
          const cc = ccList.length > 0 ? ccList.join(', ') : null;
          await sendSES({ from, to: learner.email, cc, subject, html }, env);
        }
      } catch (emailErr) {
        console.error('Points email error:', emailErr.message);
      }
    }
  }

  return pointsData;
}

function buildPointsAlertEmail({ toName, courseName, points, prevPoints, status, prevStatus, timeline, ai, reviewer, timelineDetail, app }) {
  const isImproving = prevPoints !== null && points > prevPoints;
  const statusLabel = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[status] || status;
  const statusColor = { on_track: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' }[status] || '#94a3b8';
  const changeText = prevPoints !== null ? `(${isImproving ? '+' : ''}${points - prevPoints} from ${prevPoints})` : '(first calculation)';

  const scoreRow = (label, val, icon) => {
    const color = val > 0 ? '#22c55e' : val < 0 ? '#ef4444' : '#94a3b8';
    return `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px">${icon} ${label}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${color};font-size:13px">${val > 0 ? '+' : ''}${val} pts</td></tr>`;
  };

  const subject = status === 'on_track'
    ? `Cortex: Course Points Update - ${points} pts (${statusLabel})`
    : status === 'at_risk'
      ? `Cortex: Course at Risk - ${points}/80 pts needed`
      : `Cortex: Critical Course Alert - ${points} pts`;

  const html = layout(`
    ${h1(`Course Points Update`)}
    ${p(`Hi ${toName || 'there'}, here's your latest course points update on Cortex.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr>
        <td style="background:#12151f;border-radius:10px;padding:20px;text-align:center;border-left:4px solid ${statusColor}">
          <div style="font-size:48px;font-weight:800;color:${statusColor};line-height:1">${points}</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px">Course Points ${changeText}</div>
          <div style="margin-top:8px;font-size:12px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:1px">${statusLabel}</div>
        </td>
      </tr>
    </table>
    ${status !== 'on_track' ? `${p(`<span style="color:#f59e0b">Minimum required: <strong style="color:#fff">80 points</strong> &mdash; you need <strong style="color:#ef4444">${Math.max(0, 80 - points)} more points</strong> to reach the SLA.</span>`)}` : `${p(`<span style="color:#22c55e">You're above the 80-point SLA. Keep it up!</span>`)}`}
    ${box(`<table width="100%" cellpadding="0" cellspacing="0">
      ${scoreRow('Timeline Adherence', timeline, '')}
      ${scoreRow('AI Engagement', ai, '')}
      ${scoreRow('Reviewer Feedback', reviewer, '')}
      <tr><td colspan="2" style="border-top:1px solid #2a2d3e;padding-top:8px;margin-top:8px"></td></tr>
      <tr><td style="font-size:14px;font-weight:700;color:#e2e8f0;padding-top:4px">Total Score</td><td style="text-align:right;font-size:14px;font-weight:800;color:${statusColor};padding-top:4px">${points} / 100</td></tr>
    </table>`)}
    ${timelineDetail.totalDays > 0 ? p(`<span style="color:#4a5068;font-size:13px">Timeline: ${timelineDetail.daysElapsed} of ${timelineDetail.totalDays} days elapsed — you're at ${timelineDetail.actualPct}% progress (expected ${timelineDetail.expectedPct}%).</span>`) : ''}
    ${cta('View My Points', `${app}/learner/dashboard`)}
  `);

  return { subject, html };
}

// ─── AI Feedback Scoring ──────────────────────────────────────────────────────

async function suggestFeedbackScores({ assignmentId, learnerId, courseId, feedbackText }, env) {
  const token = await getGoogleAccessToken(env);
  const pid = env.FIREBASE_PROJECT_ID;
  const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
  const r = async (path) => { const res = await fetch(dbUrl(path)); const d = await res.json(); if (d && typeof d === 'object' && d.error) throw new Error(d.error); return d; };

  const [progress, pts, assignment] = await Promise.all([
    r(`progress/${learnerId}/${courseId}`),
    r(`coursePoints/${learnerId}/${courseId}`),
    assignmentId ? r(`assignments/${assignmentId}`) : Promise.resolve(null),
  ]);

  const completedCount = (progress?.completedChapterIds || []).length;
  const exerciseSubs = Object.values(progress?.exerciseSubmissions || {});
  const aiEngaged = exerciseSubs.filter(s => s.aiReview && String(s.aiReview).trim().length > 10).length;
  const chatMsgs = assignmentId ? await r(`chats/${assignmentId}`) : null;
  const learnerMsgs = Object.values(chatMsgs || {}).filter(m => m.senderId === learnerId).length;

  const context = `Learner progress data:
- Chapters completed: ${completedCount}
- Exercises submitted: ${exerciseSubs.length}, AI-reviewed: ${aiEngaged}
- Chat messages sent to reviewer: ${learnerMsgs}
- Timeline score: ${pts?.timeline ?? 0}/40, AI score: ${pts?.ai ?? 0}/30
- Current total: ${pts?.total ?? 0}/100, Status: ${pts?.status || 'unknown'}
- Assignment status: ${assignment?.status || 'unknown'}
${feedbackText ? `\nReviewer's written feedback:\n${feedbackText}` : ''}`;

  const system = `You are an AI scoring assistant for the Cortex learning platform. Based on a learner's progress data and the reviewer's written feedback, assign scores (integers 0-10) for four aspects:
- Attitude: Consistency, timeliness, proactive engagement, willingness to learn
- Communication: Interaction quality with reviewer, responsiveness, clarity
- Business: Understanding demonstrated in assessments, domain knowledge
- Technology: AI tool engagement, technical exercise quality, coding skills

Weight the reviewer's written feedback heavily when provided. Use the progress data as supporting evidence.

Respond ONLY with a JSON object like: {"attitude":7,"communication":6,"business":8,"technology":7}
No explanation, no markdown, just the JSON object.`;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      max_tokens: 100,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
    });
    const text = (result.response || '').trim();
    const match = text.match(/\{[^}]+\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        attitude: Math.min(10, Math.max(0, Math.round(parsed.attitude || 5))),
        communication: Math.min(10, Math.max(0, Math.round(parsed.communication || 5))),
        business: Math.min(10, Math.max(0, Math.round(parsed.business || 5))),
        technology: Math.min(10, Math.max(0, Math.round(parsed.technology || 5))),
      };
    }
  } catch (e) { console.error('AI feedback scoring error:', e.message); }
  return { attitude: 5, communication: 5, business: 5, technology: 5 };
}

function getWeekId(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNo = Math.round(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Daily Notifications (Cron) ───────────────────────────────────────────────

async function runDailyNotifications(env) {
  // Skip weekends — no notifications on Sat/Sun
  const today = new Date().getUTCDay();
  if (today === 0 || today === 6) {
    console.log('Weekend — skipping daily notifications.');
    return;
  }

  const token = await getGoogleAccessToken(env);
  const pid = env.FIREBASE_PROJECT_ID;
  const dbUrl = (path) => `https://${pid}-default-rtdb.firebaseio.com/${path}.json?access_token=${encodeURIComponent(token)}`;
  const r = async (path) => {
    const res = await fetch(dbUrl(path));
    const data = await res.json();
    if (data && typeof data === 'object' && data.error) throw new Error(`Firebase: ${data.error}`);
    return data;
  };
  const pushTo = async (path, data) => {
    await fetch(dbUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  };

  const [allAssignments, allUsers, allPoints] = await Promise.all([
    r('assignments'), r('users'), r('coursePoints'),
  ]);

  const userMap = allUsers || {};
  const reviewerLearners = {};

  for (const [, asg] of Object.entries(allAssignments || {})) {
    if (asg.status === 'completed') continue;
    const learner = userMap[asg.learnerId];
    if (!learner) continue;

    const pts = (allPoints || {})[asg.learnerId]?.[asg.courseId];
    const total = pts?.total ?? 0;
    const status = pts?.status || 'unknown';
    const statusLabel = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[status] || 'Pending';
    const courseName = asg.courseId;

    // Learner in-app notification
    const learnerMsg = `Daily update: Your "${courseName}" course score is ${total} pts (${statusLabel}). Timeline: ${pts?.timeline ?? 0}, AI: ${pts?.ai ?? 0}, Reviewer: ${pts?.reviewer ?? 0}.`;
    await pushTo(`notifications/${asg.learnerId}`, {
      type: 'daily_digest', message: learnerMsg, read: false,
      createdAt: new Date().toISOString(),
      metadata: { courseId: asg.courseId, total, status },
    });

    // Learner email
    if (learner.email) {
      try {
        const { subject, html } = buildDailyLearnerEmail({
          toName: learner.name, courseName, courseId: asg.courseId,
          total, status, statusLabel,
          timeline: pts?.timeline ?? 0, ai: pts?.ai ?? 0, reviewer: pts?.reviewer ?? 0,
          timelineDetail: pts?.timelineDetail, app: env.APP_URL || 'https://cortex-zeb.web.app',
        });
        const ccEmails = await getLeadershipCcList(env, [learner.email]);
        const cc = ccEmails.length > 0 ? ccEmails.join(', ') : null;
        await sendSES({ from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, to: learner.email, cc, subject, html }, env);
      } catch (e) { console.error('Daily learner email error:', e.message); }
    }

    // Aggregate for reviewer
    if (asg.reviewerId) {
      if (!reviewerLearners[asg.reviewerId]) reviewerLearners[asg.reviewerId] = [];
      reviewerLearners[asg.reviewerId].push({
        learnerId: asg.learnerId, courseId: asg.courseId,
        learnerName: learner.name || asg.learnerId, courseName,
        total, status, statusLabel,
      });
    }
  }

  // Reviewer notifications
  for (const [reviewerId, learners] of Object.entries(reviewerLearners)) {
    const reviewer = userMap[reviewerId];
    if (!reviewer) continue;

    const atRiskCount = learners.filter(l => l.status === 'at_risk' || l.status === 'critical').length;
    const summary = learners.map(l => `${l.learnerName} (${l.courseName}): ${l.total} pts - ${l.statusLabel}`).join('. ');

    await pushTo(`notifications/${reviewerId}`, {
      type: 'daily_reviewer_digest',
      message: `Daily review: ${learners.length} active learner(s)${atRiskCount > 0 ? `, ${atRiskCount} at risk` : ''}. ${summary}`,
      read: false, createdAt: new Date().toISOString(),
      metadata: { learnerCount: learners.length, atRiskCount },
    });

    if (reviewer.email) {
      try {
        const { subject, html } = buildDailyReviewerEmail({
          reviewerName: reviewer.name, learners,
          app: env.APP_URL || 'https://cortex-zeb.web.app',
        });
        const ccR = await getLeadershipCcList(env, [reviewer.email]);
        const cc = ccR.length > 0 ? ccR.join(', ') : null;
        await sendSES({ from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, to: reviewer.email, cc, subject, html }, env);
      } catch (e) { console.error('Daily reviewer email error:', e.message); }
    }
  }

  // Friday: send weekly feedback reminders to reviewers
  const isFriday = new Date().getUTCDay() === 5;
  if (isFriday) {
    const weekId = getWeekId();
    for (const [reviewerId, learners] of Object.entries(reviewerLearners)) {
      const reviewer = userMap[reviewerId];
      if (!reviewer) continue;
      const needsFeedback = [];
      for (const l of learners) {
        const asgEntry = Object.entries(allAssignments || {}).find(([, a]) => a.learnerId === l.learnerId && a.courseId === l.courseId);
        if (!asgEntry) continue;
        const existing = await r(`reviewerFeedback/${asgEntry[0]}/weekly/${weekId}`);
        if (!existing) needsFeedback.push({ ...l, assignmentId: asgEntry[0] });
      }
      if (needsFeedback.length > 0) {
        await pushTo(`notifications/${reviewerId}`, {
          type: 'weekly_feedback_reminder',
          message: `Weekly feedback due: ${needsFeedback.length} learner(s) need your feedback today.`,
          read: false, createdAt: new Date().toISOString(),
          metadata: { weekId, count: needsFeedback.length },
        });
        if (reviewer.email) {
          try {
            const subject = `Cortex: Weekly Feedback Reminder - ${needsFeedback.length} learner(s)`;
            const rows = needsFeedback.map(l => `<tr><td style="padding:6px 12px;color:#e2e8f0;font-size:13px;border-bottom:1px solid #2a2d3e">${l.learnerName}</td><td style="padding:6px 12px;color:#94a3b8;font-size:13px;border-bottom:1px solid #2a2d3e">${l.courseName}</td></tr>`).join('');
            const html = layout(`
              ${h1('Weekly Feedback Reminder')}
              ${p(`Hi ${reviewer.name || 'there'}, please submit your weekly feedback for the following learners today.`)}
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#12151f;border-radius:8px;overflow:hidden;margin:16px 0">
                <thead><tr><th style="padding:8px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;text-align:left;border-bottom:1px solid #2a2d3e">Learner</th><th style="padding:8px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;text-align:left;border-bottom:1px solid #2a2d3e">Course</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
              ${cta('Open Learner Progress', `${(env.APP_URL || 'https://cortex-zeb.web.app')}/reviewer`)}
            `);
            const ccFri = await getLeadershipCcList(env, [reviewer.email]);
            const cc = ccFri.length > 0 ? ccFri.join(', ') : null;
            await sendSES({ from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, to: reviewer.email, cc, subject, html }, env);
          } catch (e) { console.error('Feedback reminder email error:', e.message); }
        }
      }
    }
  }

  console.log('Daily notifications complete.');
}

function buildDailyLearnerEmail({ toName, courseName, courseId, total, status, statusLabel, timeline, ai, reviewer, timelineDetail, app }) {
  const statusColor = { on_track: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' }[status] || '#9ca3af';
  const scoreRow = (label, val) => {
    const color = val > 0 ? '#22c55e' : val < 0 ? '#ef4444' : '#94a3b8';
    return `<tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">${label}</td><td style="padding:4px 0;text-align:right;font-weight:700;color:${color};font-size:13px">${val > 0 ? '+' : ''}${val} pts</td></tr>`;
  };
  const subject = `Cortex Daily Update: ${courseName} - ${total} pts (${statusLabel})`;
  const html = layout(`
    ${h1('Daily Progress Update')}
    ${p(`Hi ${toName || 'there'}, here is your daily progress update for <strong style="color:#fff">${courseName}</strong>.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      <tr><td style="background:#12151f;border-radius:10px;padding:16px;text-align:center;border-left:4px solid ${statusColor}">
        <div style="font-size:40px;font-weight:800;color:${statusColor};line-height:1">${total}</div>
        <div style="font-size:12px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:1px;margin-top:4px">${statusLabel}</div>
      </td></tr>
    </table>
    ${box(`<table width="100%" cellpadding="0" cellspacing="0">
      ${scoreRow('Timeline Adherence', timeline)}
      ${scoreRow('AI Engagement', ai)}
      ${scoreRow('Reviewer Feedback', reviewer)}
    </table>`)}
    ${status !== 'on_track' ? p(`<span style="color:#f59e0b">You need <strong style="color:#fff">${Math.max(0, 80 - total)} more points</strong> to reach the 80-point SLA.</span>`) : p(`<span style="color:#22c55e">You are above the SLA. Keep up the good work.</span>`)}
    ${cta('View My Points', `${app}/learner/points/${courseId}`)}
  `);
  return { subject, html };
}

function buildDailyReviewerEmail({ reviewerName, learners, app }) {
  const atRiskCount = learners.filter(l => l.status === 'at_risk' || l.status === 'critical').length;
  const subject = `Cortex Daily Review: ${learners.length} learner(s)${atRiskCount > 0 ? `, ${atRiskCount} at risk` : ''}`;
  const tableRows = learners.map(l => {
    const color = l.status === 'on_track' ? '#22c55e' : l.status === 'at_risk' ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td style="padding:8px 12px;color:#e2e8f0;font-size:13px;border-bottom:1px solid #2a2d3e">${l.learnerName}</td>
      <td style="padding:8px 12px;color:#94a3b8;font-size:13px;border-bottom:1px solid #2a2d3e">${l.courseName}</td>
      <td style="padding:8px 12px;font-weight:700;color:${color};font-size:13px;border-bottom:1px solid #2a2d3e;text-align:right">${l.total} pts</td>
      <td style="padding:8px 12px;font-weight:600;color:${color};font-size:12px;border-bottom:1px solid #2a2d3e;text-transform:uppercase">${l.statusLabel}</td>
    </tr>`;
  }).join('');
  const html = layout(`
    ${h1('Daily Learner Review')}
    ${p(`Hi ${reviewerName || 'there'}, here is a summary of your assigned learners.`)}
    ${atRiskCount > 0 ? `<div style="background:#ef444418;border:1px solid #ef444440;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#ef4444;font-size:13px;font-weight:600">${atRiskCount} learner(s) at risk or critical</div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#12151f;border-radius:8px;overflow:hidden;margin:16px 0">
      <thead><tr>
        <th style="padding:10px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #2a2d3e">Learner</th>
        <th style="padding:10px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #2a2d3e">Course</th>
        <th style="padding:10px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #2a2d3e">Points</th>
        <th style="padding:10px 12px;color:#4a5068;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #2a2d3e">Status</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${cta('Open Learner Progress', `${app}/reviewer`)}
  `);
  return { subject, html };
}

// ─── Firebase Auth — Create User ──────────────────────────────────────────────
// Uses the public Identity Toolkit REST API (no Admin needed for create)

async function createFirebaseUser({ email, password, displayName }, env) {
  const apiKey = env.FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: false }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Firebase signUp failed: ${res.status}`);
  return data.localId; // Firebase Auth UID
}

// ─── Firebase Auth — Delete User ──────────────────────────────────────────────
// Requires Admin OAuth2 token from service account

async function deleteFirebaseUser(uid, env) {
  const token = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localIds: [uid], force: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Firebase delete failed: ${res.status}`);
}

// ─── Google Service Account → OAuth2 Access Token (RS256 JWT) ─────────────────

async function getGoogleAccessToken(env) {
  const clientEmail = env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKeyPem = env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const signingInput = `${header}.${claims}`;
  const signature = await signRS256(signingInput, privateKeyPem);
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get Google access token');
  return data.access_token;
}

async function signRS256(input, pemKey) {
  // Strip PEM headers and decode base64
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(input)
  );
  return b64url(new Uint8Array(sig));
}

function b64url(input) {
  const str = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
