import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import '../styles/layout.css';

/* ── Right-panel visual — lock/security theme ────────────────────── */
const SHIELD_NODES = [
  { id: 's0', x: 250, y: 100, label: 'Encryption',      dur: '4.2s', delay: '0s'   },
  { id: 's1', x: 410, y: 175, label: 'Zero-Trust',      dur: '5s',   delay: '0.6s' },
  { id: 's2', x: 445, y: 330, label: 'Authentication',  dur: '4.6s', delay: '1.1s' },
  { id: 's3', x: 370, y: 475, label: 'Access Control',  dur: '5.5s', delay: '0.3s' },
  { id: 's4', x: 200, y: 520, label: 'Audit Logs',      dur: '3.9s', delay: '0.8s' },
  { id: 's5', x: 65,  y: 455, label: 'Identity',        dur: '4.8s', delay: '1.4s' },
  { id: 's6', x: 55,  y: 290, label: 'Secrets',         dur: '4.3s', delay: '0.2s' },
  { id: 's7', x: 128, x2: 128, y: 135, label: 'Tokens', dur: '5.2s', delay: '1.0s' },
];
const EDGE_PAIRS = [
  ['s0','s1'],['s1','s2'],['s2','s3'],['s3','s4'],
  ['s4','s5'],['s5','s6'],['s6','s7'],['s7','s0'],
];
const PARTICLES = [
  { x: 105, y: 385, delay: '0s',   dur: '3.8s' },
  { x: 185, y: 215, delay: '1.3s', dur: '4.2s' },
  { x: 325, y: 445, delay: '0.5s', dur: '4.6s' },
  { x: 395, y: 245, delay: '1.9s', dur: '3.5s' },
  { x: 160, y: 490, delay: '0.9s', dur: '4.0s' },
  { x: 360, y: 145, delay: '2.3s', dur: '3.9s' },
  { x: 415, y: 435, delay: '0.4s', dur: '4.4s' },
  { x: 90,  y: 160, delay: '1.7s', dur: '4.1s' },
];
const C = { x: 250, y: 320 };

function nodeLabel(n) {
  const isTop   = n.y < C.y;
  const isRight = n.x > C.x + 80;
  const isLeft  = n.x < C.x - 80;
  return {
    tx: isRight ? n.x - 10 : isLeft ? n.x + 10 : n.x,
    ty: isTop   ? n.y - 20  : n.y + 24,
    anchor: isRight ? 'end' : isLeft ? 'start' : 'middle',
  };
}

function SecurityVisual() {
  return (
    <svg
      viewBox="0 0 500 640"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <defs>
        <pattern id="cp-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.9" fill="#9c9a94" opacity="0.4" />
        </pattern>
        <filter id="cp-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cp-glow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect width="500" height="650" fill="url(#cp-grid)" />

      {PARTICLES.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r="2.2" fill="#b5d44f">
          <animate attributeName="cy" from={p.y} to={p.y - 65}
            dur={p.dur} begin={p.delay} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.75;0"
            dur={p.dur} begin={p.delay} repeatCount="indefinite" />
        </circle>
      ))}

      {EDGE_PAIRS.map(([a, b], i) => {
        const na = SHIELD_NODES.find(n => n.id === a);
        const nb = SHIELD_NODES.find(n => n.id === b);
        return (
          <line key={`e${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="#9c9a94" strokeWidth="0.9" strokeOpacity="0.35"
            strokeDasharray="4 9">
            <animate attributeName="stroke-dashoffset" from="0" to="-26"
              dur="4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </line>
        );
      })}

      {SHIELD_NODES.map((n, i) => (
        <line key={`sp${i}`}
          x1={C.x} y1={C.y} x2={n.x} y2={n.y}
          stroke="#b5d44f" strokeWidth="1.1" strokeOpacity="0.3"
          strokeDasharray="5 8">
          <animate attributeName="stroke-dashoffset" from="0" to="-26"
            dur="2.6s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </line>
      ))}

      {[0, 1, 2].map(i => (
        <circle key={`ring${i}`} cx={C.x} cy={C.y} r="38" fill="none"
          stroke="#b5d44f" strokeWidth="1.5">
          <animate attributeName="r"       from="38" to="105" dur="3s"
            begin={`${i}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.55" to="0" dur="3s"
            begin={`${i}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {SHIELD_NODES.map(n => {
        const { tx, ty, anchor } = nodeLabel(n);
        return (
          <g key={n.id}>
            <animateTransform attributeName="transform" attributeType="XML"
              type="translate" values="0 0; 0 -8; 0 0"
              dur={n.dur} begin={n.delay} repeatCount="indefinite" />
            <circle cx={n.x} cy={n.y} r="13" fill="none"
              stroke="#b5d44f" strokeWidth="1" filter="url(#cp-glow-sm)">
              <animate attributeName="r"       values="11;16;11" dur={n.dur} begin={n.delay} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.45;0.1;0.45" dur={n.dur} begin={n.delay} repeatCount="indefinite" />
            </circle>
            <circle cx={n.x} cy={n.y} r="10" fill="none"
              stroke="#1a1a1a" strokeWidth="1" strokeOpacity="0.25" />
            <circle cx={n.x} cy={n.y} r="7" fill="#1a1a1a" />
            <circle cx={n.x} cy={n.y} r="3.2" fill="#b5d44f" filter="url(#cp-glow-sm)" />
            <text x={tx} y={ty}
              textAnchor={anchor} fontSize="10.5"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="600" fill="#37352f" opacity="0.85"
              letterSpacing="0.2">
              {n.label}
            </text>
          </g>
        );
      })}

      {/* Centre shield icon */}
      <g>
        <circle cx={C.x} cy={C.y} r="40" fill="#1a1a1a" opacity="0.15" filter="url(#cp-glow)" />
        <circle cx={C.x} cy={C.y} r="34" fill="#1a1a1a" />
        <circle cx={C.x} cy={C.y} r="28" fill="none"
          stroke="#b5d44f" strokeWidth="0.8" strokeOpacity="0.5" />
        {/* Lock icon */}
        <rect x={C.x - 9} y={C.y - 2} width="18" height="14" rx="2"
          fill="none" stroke="#b5d44f" strokeWidth="1.5" />
        <path d={`M${C.x - 5} ${C.y - 2} a5 5 0 0 1 10 0`}
          fill="none" stroke="#b5d44f" strokeWidth="1.5" />
        <circle cx={C.x} cy={C.y + 5} r="2" fill="#b5d44f" />
      </g>

      <text x="250" y="626"
        textAnchor="middle" fontSize="9"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="700" fill="#6b6960" opacity="0.55"
        letterSpacing="3">
        SECURE · PRIVATE · TRUSTED
      </text>
    </svg>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,  setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      await changePassword(newPassword);
      const dest = user?.role === 'leadership' ? '/leadership/dashboard' : '/learner/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(
        err?.code === 'auth/requires-recent-login'
          ? 'Session expired. Please log out and log in again.'
          : err.message || 'Failed to update password'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      {/* Left: form */}
      <div className="login-card" style={{ background: '#0f1117' }}>
        <div className="login-card-inner">
          {/* Brand */}
          <div className="brand" style={{ marginBottom: '40px' }}>
            <h1 style={{ color: '#fff', fontWeight: 800 }}>
              Cortex<span style={{ color: '#c4e04e' }}>.</span>
            </h1>
            <p style={{ color: '#64748b' }}>Set your new password</p>
            <p style={{ color: '#475569', fontSize: '13px', marginTop: '6px', lineHeight: 1.55 }}>
              You're logged in with a temporary password.<br />
              Please choose a permanent one to continue.
            </p>
          </div>

          {error && (
            <div className="error-message" role="alert" style={{
              background: '#2d1a1a', borderColor: '#7f1d1d', color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="new-password" style={{ color: '#94a3b8' }}>New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                autoFocus
                style={{ background: '#12151f', borderColor: '#2a2d3e', color: '#fff' }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password" style={{ color: '#94a3b8' }}>Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                style={{ background: '#12151f', borderColor: '#2a2d3e', color: '#fff' }}
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}
              style={{ marginTop: '8px' }}>
              {loading ? 'Updating…' : 'Set password & continue ▲'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button onClick={logout} style={{
              background: 'none', border: 'none',
              color: '#4a5068', fontSize: '13px',
              cursor: 'pointer', textDecoration: 'underline',
            }}>
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* Right: animated security visual */}
      <div className="login-visual">
        <SecurityVisual />
      </div>
    </div>
  );
}
