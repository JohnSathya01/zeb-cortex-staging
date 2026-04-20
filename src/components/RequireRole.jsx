import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function RequireRole({ role }) {
  const { user } = useAuth();

  if (user.role !== role) {
    if (user.role === 'leadership') {
      return <Navigate to="/leadership/dashboard" replace />;
    }
    if (user.role === 'learner') {
      return <Navigate to="/learner/dashboard" replace />;
    }
  }

  return <Outlet />;
}
