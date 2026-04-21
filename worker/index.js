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

    // CC john.sathya@zeb.co unless he's already the recipient
    const cc = toEmail.toLowerCase() === env.CC_EMAIL.toLowerCase() ? null : env.CC_EMAIL;

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
};

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
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
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
