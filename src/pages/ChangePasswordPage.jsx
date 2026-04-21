import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import '../styles/layout.css';

export default function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword);
      const dest = user?.role === 'leadership' ? '/leadership/dashboard' : '/learner/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      // Firebase may require recent login if session is old
      if (err?.code === 'auth/requires-recent-login') {
        setError('Session expired. Please log out and log in again to change your password.');
      } else {
        setError(err.message || 'Failed to update password');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f1117',
      padding: '24px',
    }}>
      <div style={{
        background: '#1a1d2e',
        border: '1px solid #2a2d3e',
        borderRadius: '12px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{
              width: '10px', height: '18px',
              background: '#c4e04e',
              clipPath: 'polygon(0 100%, 50% 0, 100% 100%)',
            }} />
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
              Cortex<span style={{ color: '#c4e04e' }}>.</span>
            </span>
          </div>
          <h2 style={{ margin: '16px 0 6px', fontSize: '22px', fontWeight: 700, color: '#fff' }}>
            Set your password
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
            You're logged in with a temporary password. Please set a new one to continue.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#2d1a1a', border: '1px solid #7f1d1d',
            borderRadius: '8px', padding: '12px 14px',
            fontSize: '14px', color: '#fca5a5', marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="new-password" style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#12151f', border: '1px solid #2a2d3e',
                borderRadius: '8px', padding: '10px 12px',
                color: '#fff', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label htmlFor="confirm-password" style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#12151f', border: '1px solid #2a2d3e',
                borderRadius: '8px', padding: '10px 12px',
                color: '#fff', fontSize: '14px', outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '24px', width: '100%',
              background: loading ? '#8a9e36' : '#c4e04e',
              color: '#0f1117', border: 'none',
              borderRadius: '8px', padding: '12px',
              fontSize: '14px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.3px',
            }}
          >
            {loading ? 'Updating…' : 'Set password & continue'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none',
              color: '#4a5068', fontSize: '13px',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
