import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from 'firebase/auth';
import { ref, get, update } from 'firebase/database';
import { auth, database } from '../firebase.js';

const AuthContext = createContext(null);

const ERROR_MESSAGES = {
  'auth/user-not-found': 'No account found with this email address',
  'auth/wrong-password': 'Incorrect password',
  'auth/invalid-email': 'Please enter a valid email address',
  'auth/user-disabled': 'This account has been disabled',
  'auth/too-many-requests': 'Too many login attempts. Please try again later',
  'auth/invalid-credential': 'Invalid email or password',
};

function mapFirebaseError(error) {
  const code = error?.code || '';
  return ERROR_MESSAGES[code] || 'Login failed. Please try again';
}

async function fetchUserProfile(firebaseUser) {
  const userRef = ref(database, `users/${firebaseUser.uid}`);
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    const profile = snapshot.val();
    return {
      uid: firebaseUser.uid,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      specialisation: profile.specialisation || '',
      mustChangePassword: profile.mustChangePassword === true,
    };
  }
  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || '',
    email: firebaseUser.email,
    role: 'learner',
    mustChangePassword: false,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await fetchUserProfile(firebaseUser);
          setUser(profile);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const profile = await fetchUserProfile(credential.user);
      setUser(profile);
      return { success: true };
    } catch (error) {
      return { success: false, error: mapFirebaseError(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (newPassword) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not authenticated');
    await updatePassword(currentUser, newPassword);
    await update(ref(database, `users/${currentUser.uid}`), { mustChangePassword: false });
    setUser(prev => ({ ...prev, mustChangePassword: false }));
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { mapFirebaseError };
export default AuthContext;
