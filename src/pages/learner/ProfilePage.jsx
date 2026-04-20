import { useAuth } from '../../contexts/AuthContext.jsx';
import '../../styles/pages.css';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <div>
      <div className="page-header"><h1>My Profile</h1></div>
      <div className="profile-card">
        <div className="profile-field"><label>Name</label><div>{user?.name ?? '—'}</div></div>
        <div className="profile-field"><label>Email</label><div>{user?.email ?? '—'}</div></div>
        <div className="profile-field"><label>Role</label><div style={{ textTransform: 'capitalize' }}>{user?.role ?? '—'}</div></div>
        <div className="profile-field"><label>Specialisation</label><div>{user?.specialisation || '—'}</div></div>
      </div>
    </div>
  );
}
