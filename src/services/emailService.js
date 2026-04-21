// ─── Cortex Email Service ─────────────────────────────────────────────────────
// Sends email directly via AWS SES REST API using browser-native fetch.
// Uses AWS Signature V4 (WebCrypto) — no external service required.

const REGION       = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const ACCESS_KEY   = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const SECRET_KEY   = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const DEFAULT_FROM = 'Cortex <john.sathya@zeb.co>';
const CC_ADDRESS   = 'john.sathya@zeb.co';
const APP_URL      = 'https://cortex-zeb.web.app';

// ─── Public API ───────────────────────────────────────────────────────────────

// from: { email, name } — defaults to john.sathya@zeb.co for welcome, caller's identity for others
export const sendWelcomeEmail = ({ toEmail, toName }) =>
  dispatch(toEmail, 'Welcome to Cortex', templateWelcome(toName), null);

export const sendCourseAssignedEmail = ({ toEmail, toName, courseId, courseName, from }) =>
  dispatch(toEmail, `New course assigned: ${courseName || courseId}`, templateCourseAssigned(toName, courseName || courseId, courseId), from);

export const sendReviewerAssignedEmail = ({ toEmail, toName, reviewerName, courseId, courseName, from }) =>
  dispatch(toEmail, 'Your reviewer has been assigned on Cortex', templateReviewerAssigned(toName, reviewerName, courseName || courseId, courseId), from);

export const sendReviewerNewAssignmentEmail = ({ toEmail, reviewerName, learnerName, courseId, courseName, from }) =>
  dispatch(toEmail, `New learner assigned: ${learnerName}`, templateReviewerNewAssignment(reviewerName, learnerName, courseName || courseId), from);

export const sendChatMessageEmail = ({ toEmail, toName, fromName, messagePreview, from }) =>
  dispatch(toEmail, `New message from ${fromName} on Cortex`, templateChatMessage(toName, fromName, messagePreview), from);

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function dispatch(to, subject, html, from) {
  if (!ACCESS_KEY || !SECRET_KEY) throw new Error('AWS credentials not configured');

  const fromHeader = from?.email
    ? `${from.name || from.email} <${from.email}>`
    : DEFAULT_FROM;

  const boundary = `boundary_${Date.now()}`;
  const plainText = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const ccLine = to.toLowerCase().includes(CC_ADDRESS.toLowerCase()) ? [] : [`Cc: ${CC_ADDRESS}`];

  const raw = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    ...ccLine,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
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

  const encoded = btoa(unescape(encodeURIComponent(raw)));
  const body = `Action=SendRawEmail&RawMessage.Data=${encodeURIComponent(encoded)}`;
  const url = `https://email.${REGION}.amazonaws.com/`;
  const headers = await signRequest(body, url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
}

// ─── AWS Signature V4 (WebCrypto) ─────────────────────────────────────────────

async function signRequest(body, url) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const datetime = `${date}T${now.toISOString().slice(11, 19).replace(/:/g, '')}Z`;
  const host = new URL(url).host;
  const bodyHash = await sha256hex(body);

  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${datetime}\n`;
  const canonicalReq = ['POST', '/', '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const scope = `${date}/${REGION}/email/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, await sha256hex(canonicalReq)].join('\n');

  const kDate    = await hmac(`AWS4${SECRET_KEY}`, date);
  const kRegion  = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, 'email');
  const kSign    = await hmac(kService, 'aws4_request');
  const sig      = toHex(await hmac(kSign, stringToSign));

  return {
    'x-amz-date': datetime,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

async function hmac(key, msg) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(msg)));
}

async function sha256hex(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return toHex(new Uint8Array(buf));
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function layout(content) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2a2d3e;max-width:560px;width:100%">
  <tr><td style="background:#12151f;padding:24px 32px;border-bottom:1px solid #2a2d3e">
    <table cellpadding="0" cellspacing="0"><tr>
      <td width="10" style="background:#c4e04e;width:10px;height:20px;clip-path:polygon(0 100%,50% 0,100% 100%)">&nbsp;</td>
      <td style="padding-left:10px;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px">Cortex<span style="color:#c4e04e">.</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px">${content}</td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid #2a2d3e;font-size:12px;color:#4a5068;line-height:1.6">
    Automated message from Cortex by Zeb. Do not reply.<br/>
    <a href="${APP_URL}" style="color:#c4e04e;text-decoration:none">cortex-zeb.web.app</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const h1 = t => `<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fff">${t}</h1>`;
const para = t => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#94a3b8">${t}</p>`;
const box = t => `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:#12151f;border-left:3px solid #c4e04e;border-radius:4px;padding:12px 16px;font-size:14px;color:#e2e8f0;line-height:1.7">${t}</td></tr></table>`;
const cta = (label, url) => `<table cellpadding="0" cellspacing="0" style="margin:20px 0 0"><tr><td style="background:#c4e04e;border-radius:8px;padding:12px 28px"><a href="${url}" style="color:#0f1117;font-weight:700;font-size:14px;text-decoration:none">${label}</a></td></tr></table>`;

function templateWelcome(name) {
  return layout(`
    ${h1(`Welcome to Cortex${name ? `, ${name}` : ''}!`)}
    ${para('Your account is ready. Cortex is your AI learning platform at Zeb — complete courses, track progress, and connect with your reviewer.')}
    ${box('<strong style="color:#c4e04e">Next step:</strong> Log in and check your assigned courses.')}
    ${cta('Open Cortex', APP_URL)}
  `);
}

function templateCourseAssigned(name, courseName, courseId) {
  return layout(`
    ${h1('New course assigned')}
    ${para(`Hi ${name || 'there'}, a course has been assigned to you on Cortex.`)}
    ${box(`<strong style="color:#c4e04e">Course:</strong> ${courseName}`)}
    ${cta('View Course', `${APP_URL}/learner/course/${courseId}`)}
  `);
}

function templateReviewerAssigned(name, reviewerName, courseName, courseId) {
  return layout(`
    ${h1('Your reviewer is ready')}
    ${para(`Hi ${name || 'there'}, <strong style="color:#c4e04e">${reviewerName || 'a reviewer'}</strong> has been assigned to support you on Cortex.`)}
    ${box(`<strong style="color:#c4e04e">Course:</strong> ${courseName}<br/><strong style="color:#c4e04e">Reviewer:</strong> ${reviewerName || '—'}`)}
    ${para('Your reviewer can see your progress and is available via the chat inside your course.')}
    ${cta('Open Course', `${APP_URL}/learner/course/${courseId}`)}
  `);
}

function templateReviewerNewAssignment(reviewerName, learnerName, courseName) {
  return layout(`
    ${h1('New learner assigned')}
    ${para(`Hi ${reviewerName || 'there'}, you've been assigned as reviewer for <strong style="color:#c4e04e">${learnerName || 'a learner'}</strong> on Cortex.`)}
    ${box(`<strong style="color:#c4e04e">Learner:</strong> ${learnerName}<br/><strong style="color:#c4e04e">Course:</strong> ${courseName}`)}
    ${cta('Open Reviewer Dashboard', `${APP_URL}/reviewer`)}
  `);
}

function templateChatMessage(toName, fromName, preview) {
  const excerpt = preview ? `"${preview.slice(0, 160)}${preview.length > 160 ? '…' : ''}"` : '';
  return layout(`
    ${h1(`New message from ${fromName || 'someone'}`)}
    ${para(`Hi ${toName || 'there'}, you have a new message in your Cortex chat.`)}
    ${excerpt ? box(`<em style="color:#94a3b8">${excerpt}</em>`) : ''}
    ${para('<span style="font-size:13px;color:#4a5068">Reply inside Cortex — do not reply to this email.</span>')}
    ${cta('View Message', APP_URL)}
  `);
}
