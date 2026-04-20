import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../contexts/AuthContext.jsx';
import RequireAuth from '../../components/RequireAuth.jsx';
import RequireRole from '../../components/RequireRole.jsx';
import { act } from '@testing-library/react';
import { useState } from 'react';

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

// Mock firebase/database
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
}));

// Mock firebase.js
vi.mock('../../firebase.js', () => ({
  auth: {},
  database: {},
}));

import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { ref, get } from 'firebase/database';

function LoginPage() {
  return <div>Login Page</div>;
}
function LeadershipDashboard() {
  return <div>Leadership Dashboard</div>;
}
function LearnerDashboard() {
  return <div>Learner Dashboard</div>;
}
function ProtectedContent() {
  return <div>Protected Content</div>;
}

function LoginTrigger({ email, password, children }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  if (!ready) {
    login(email, password).then(() => setReady(true));
    return null;
  }

  return children;
}

function setupMocks(userProfile) {
  signInWithEmailAndPassword.mockResolvedValue({
    user: { uid: userProfile.uid, email: userProfile.email, displayName: userProfile.name },
  });
  ref.mockReturnValue(`users/${userProfile.uid}`);
  get.mockResolvedValue({
    exists: () => true,
    val: () => ({ name: userProfile.name, email: userProfile.email, role: userProfile.role }),
  });
  signOut.mockResolvedValue();
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChanged.mockImplementation((auth, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  it('redirects to /login when not authenticated', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/protected" element={<ProtectedContent />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
    });

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders child routes when authenticated', async () => {
    setupMocks({ uid: '1', name: 'Admin', email: 'admin@zeb.co', role: 'leadership' });

    await act(async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <LoginTrigger email="admin@zeb.co" password="pass123">
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route path="/protected" element={<ProtectedContent />} />
                </Route>
              </Routes>
            </LoginTrigger>
          </MemoryRouter>
        </AuthProvider>
      );
    });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChanged.mockImplementation((auth, callback) => {
      callback(null);
      return vi.fn();
    });
  });

  it('redirects leadership user to /leadership/dashboard when accessing learner route', async () => {
    setupMocks({ uid: '1', name: 'Admin', email: 'admin@zeb.co', role: 'leadership' });

    await act(async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/learner/dashboard']}>
            <LoginTrigger email="admin@zeb.co" password="pass123">
              <Routes>
                <Route path="/leadership/dashboard" element={<LeadershipDashboard />} />
                <Route element={<RequireAuth />}>
                  <Route element={<RequireRole role="learner" />}>
                    <Route path="/learner/dashboard" element={<LearnerDashboard />} />
                  </Route>
                </Route>
              </Routes>
            </LoginTrigger>
          </MemoryRouter>
        </AuthProvider>
      );
    });

    expect(screen.getByText('Leadership Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Learner Dashboard')).not.toBeInTheDocument();
  });

  it('redirects learner user to /learner/dashboard when accessing leadership route', async () => {
    setupMocks({ uid: '2', name: 'Learner', email: 'learner@zeb.co', role: 'learner' });

    await act(async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/leadership/dashboard']}>
            <LoginTrigger email="learner@zeb.co" password="pass456">
              <Routes>
                <Route path="/learner/dashboard" element={<LearnerDashboard />} />
                <Route element={<RequireAuth />}>
                  <Route element={<RequireRole role="leadership" />}>
                    <Route path="/leadership/dashboard" element={<LeadershipDashboard />} />
                  </Route>
                </Route>
              </Routes>
            </LoginTrigger>
          </MemoryRouter>
        </AuthProvider>
      );
    });

    expect(screen.getByText('Learner Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Leadership Dashboard')).not.toBeInTheDocument();
  });

  it('renders child routes when role matches', async () => {
    setupMocks({ uid: '1', name: 'Admin', email: 'admin@zeb.co', role: 'leadership' });

    await act(async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/leadership/dashboard']}>
            <LoginTrigger email="admin@zeb.co" password="pass123">
              <Routes>
                <Route element={<RequireAuth />}>
                  <Route element={<RequireRole role="leadership" />}>
                    <Route path="/leadership/dashboard" element={<LeadershipDashboard />} />
                  </Route>
                </Route>
              </Routes>
            </LoginTrigger>
          </MemoryRouter>
        </AuthProvider>
      );
    });

    expect(screen.getByText('Leadership Dashboard')).toBeInTheDocument();
  });
});
