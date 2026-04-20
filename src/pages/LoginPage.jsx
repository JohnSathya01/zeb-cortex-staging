import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import '../styles/layout.css';

/* ── Neural network visualization ─────────────────────────────── */
const C = { x: 250, y: 320 };

const NODES = [
  { id: 'n0', x: 250, y: 105, label: 'LLMs',             dur: '4s',   delay: '0s'   },
  { id: 'n1', x: 400, y: 168, label: 'Neural Networks',  dur: '5s',   delay: '0.5s' },
  { id: 'n2', x: 440, y: 320, label: 'Deep Learning',    dur: '4.5s', delay: '1s'   },
  { id: 'n3', x: 378, y: 468, label: 'Data Science',     dur: '6s',   delay: '0.3s' },
  { id: 'n4', x: 210, y: 520, label: 'Computer Vision',  dur: '3.8s', delay: '0.8s' },
  { id: 'n5', x: 72,  y: 448, label: 'Transformers',     dur: '5.5s', delay: '1.5s' },
  { id: 'n6', x: 60,  y: 285, label: 'Machine Learning', dur: '4.2s', delay: '0.2s' },
  { id: 'n7', x: 132, y: 130, label: 'NLP',              dur: '4.8s', delay: '1.2s' },
];

const EDGE_PAIRS = [
  ['n0','n1'],['n1','n2'],['n2','n3'],['n3','n4'],
  ['n4','n5'],['n5','n6'],['n6','n7'],['n7','n0'],
];

const PARTICLES = [
  { x: 110, y: 390, delay: '0s',   dur: '3.8s' },
  { x: 190, y: 220, delay: '1.3s', dur: '4.2s' },
  { x: 320, y: 450, delay: '0.5s', dur: '4.6s' },
  { x: 390, y: 250, delay: '1.9s', dur: '3.5s' },
  { x: 165, y: 490, delay: '0.9s', dur: '4.0s' },
  { x: 355, y: 148, delay: '2.3s', dur: '3.9s' },
  { x: 410, y: 440, delay: '0.4s', dur: '4.4s' },
  { x: 95,  y: 165, delay: '1.7s', dur: '4.1s' },
  { x: 280, y: 500, delay: '2.6s', dur: '3.7s' },
  { x: 420, y: 185, delay: '0.7s', dur: '5.0s' },
];

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

function LoginVisual() {
  return (
    <svg
      viewBox="0 0 500 640"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <defs>
        <pattern id="lv-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.9" fill="#9c9a94" opacity="0.4" />
        </pattern>
        <filter id="lv-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="lv-glow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Dot grid background */}
      <rect width="500" height="650" fill="url(#lv-grid)" />

      {/* Drifting particles */}
      {PARTICLES.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r="2.2" fill="#b5d44f">
          <animate attributeName="cy" from={p.y} to={p.y - 65}
            dur={p.dur} begin={p.delay} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.75;0"
            dur={p.dur} begin={p.delay} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Outer-ring edges */}
      {EDGE_PAIRS.map(([a, b], i) => {
        const na = NODES.find(n => n.id === a);
        const nb = NODES.find(n => n.id === b);
        return (
          <line key={`e${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="#9c9a94" strokeWidth="0.9" strokeOpacity="0.35"
            strokeDasharray="4 9"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-26"
              dur="4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </line>
        );
      })}

      {/* Centre spokes */}
      {NODES.map((n, i) => (
        <line key={`s${i}`}
          x1={C.x} y1={C.y} x2={n.x} y2={n.y}
          stroke="#b5d44f" strokeWidth="1.1" strokeOpacity="0.3"
          strokeDasharray="5 8"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-26"
            dur="2.6s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </line>
      ))}

      {/* Centre pulse rings */}
      {[0, 1, 2].map(i => (
        <circle key={`ring${i}`} cx={C.x} cy={C.y} r="38" fill="none"
          stroke="#b5d44f" strokeWidth="1.5">
          <animate attributeName="r"       from="38" to="105" dur="3s"
            begin={`${i}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.55" to="0" dur="3s"
            begin={`${i}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Outer nodes */}
      {NODES.map(n => {
        const { tx, ty, anchor } = nodeLabel(n);
        return (
          <g key={n.id}>
            <animateTransform attributeName="transform" attributeType="XML"
              type="translate" values="0 0; 0 -8; 0 0"
              dur={n.dur} begin={n.delay} repeatCount="indefinite" />

            {/* Glow halo */}
            <circle cx={n.x} cy={n.y} r="13" fill="none"
              stroke="#b5d44f" strokeWidth="1" filter="url(#lv-glow-sm)">
              <animate attributeName="r"       values="11;16;11" dur={n.dur} begin={n.delay} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.45;0.1;0.45" dur={n.dur} begin={n.delay} repeatCount="indefinite" />
            </circle>

            {/* Outer ring */}
            <circle cx={n.x} cy={n.y} r="10" fill="none"
              stroke="#1a1a1a" strokeWidth="1" strokeOpacity="0.25" />

            {/* Dot body */}
            <circle cx={n.x} cy={n.y} r="7" fill="#1a1a1a" />
            {/* Green pip */}
            <circle cx={n.x} cy={n.y} r="3.2" fill="#b5d44f" filter="url(#lv-glow-sm)" />

            {/* Label */}
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

      {/* Centre node */}
      <g>
        <circle cx={C.x} cy={C.y} r="40" fill="#1a1a1a" opacity="0.15" filter="url(#lv-glow)" />
        <circle cx={C.x} cy={C.y} r="34" fill="#1a1a1a" />
        <circle cx={C.x} cy={C.y} r="28" fill="none"
          stroke="#b5d44f" strokeWidth="0.8" strokeOpacity="0.5" />
        <text x={C.x} y={C.y + 3}
          textAnchor="middle" fontSize="8" fontWeight="800"
          fontFamily="Inter, system-ui, sans-serif"
          fill="#ffffff" letterSpacing="2">CORTEX</text>
      </g>

      {/* Bottom tagline */}
      <text x="250" y="626"
        textAnchor="middle" fontSize="9"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="700" fill="#6b6960" opacity="0.55"
        letterSpacing="3">
        LEARNING · CAPABILITY · EXCELLENCE
      </text>
    </svg>
  );
}

/* ── Login page ─────────────────────────────────────────────────── */
export default function LoginPage() {
  const { isAuthenticated, user, login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  if (isAuthenticated && user) {
    const dest = user.role === 'leadership' ? '/leadership/dashboard' : '/learner/dashboard';
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) setError(result.error || 'Invalid email or password');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      {/* Left: form */}
      <div className="login-card">
        <div className="login-card-inner">
          <div className="brand">
            <h1>Cortex</h1>
            <p>Where innovations born!</p>
            <p className="brand-powered">powered by <span>zeb</span></p>
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@zeb.co" required autoComplete="email" />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password" required autoComplete="current-password" />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Login with zeb ▲'}
            </button>
          </form>
        </div>
      </div>

      {/* Right: animated neural network */}
      <div className="login-visual">
        <LoginVisual />
      </div>
    </div>
  );
}
