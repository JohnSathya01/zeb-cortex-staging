import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth, mapFirebaseError } from '../../contexts/AuthContext.jsx';

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

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext', () => {
  let authStateCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    // Capture the onAuthStateChanged callback
    onAuthStateChanged.mockImplementation((auth, callback) => {
      authStateCallback = callback;
      // Simulate initial auth state: no user
      callback(null);
      return vi.fn(); // unsubscribe
    });
  });

  it('starts with no user, isAuthenticated false, and loading resolves', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login with valid credentials sets user and isAuthenticated', async () => {
    const mockFirebaseUser = { uid: '1', email: 'admin@zeb.co', displayName: 'Admin' };
    signInWithEmailAndPassword.mockResolvedValue({ user: mockFirebaseUser });
    ref.mockReturnValue('users/1');
    get.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Admin', email: 'admin@zeb.co', role: 'leadership' }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login('admin@zeb.co', 'pass123');
    });

    expect(loginResult).toEqual({ success: true });
    expect(result.current.user).toEqual({ uid: '1', name: 'Admin', email: 'admin@zeb.co', role: 'leadership' });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login with invalid credentials returns error and stays unauthenticated', async () => {
    signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login('admin@zeb.co', 'wrong');
    });

    expect(loginResult).toEqual({ success: false, error: 'Invalid email or password' });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logout clears user state', async () => {
    const mockFirebaseUser = { uid: '2', email: 'learner@zeb.co', displayName: 'Learner' };
    signInWithEmailAndPassword.mockResolvedValue({ user: mockFirebaseUser });
    ref.mockReturnValue('users/2');
    get.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Learner', email: 'learner@zeb.co', role: 'learner' }),
    });
    signOut.mockResolvedValue();

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('learner@zeb.co', 'pass456');
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('useAuth throws when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});

describe('mapFirebaseError', () => {
  it('maps known error codes to user-friendly messages', () => {
    expect(mapFirebaseError({ code: 'auth/user-not-found' })).toBe('No account found with this email address');
    expect(mapFirebaseError({ code: 'auth/wrong-password' })).toBe('Incorrect password');
    expect(mapFirebaseError({ code: 'auth/invalid-email' })).toBe('Please enter a valid email address');
    expect(mapFirebaseError({ code: 'auth/user-disabled' })).toBe('This account has been disabled');
    expect(mapFirebaseError({ code: 'auth/too-many-requests' })).toBe('Too many login attempts. Please try again later');
    expect(mapFirebaseError({ code: 'auth/invalid-credential' })).toBe('Invalid email or password');
  });

  it('returns default message for unknown error codes', () => {
    expect(mapFirebaseError({ code: 'auth/unknown-error' })).toBe('Login failed. Please try again');
    expect(mapFirebaseError({})).toBe('Login failed. Please try again');
  });
});
