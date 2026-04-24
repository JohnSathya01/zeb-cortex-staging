import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { IconBookOpen, IconUser, IconLogout, IconShield, IconChart, IconChat, IconAnalytics } from '../components/Icons.jsx';
import '../styles/layout.css';

export default function LearnerLayout() {
  const { user, logout } = useAuth();
  const { getAssignments } = useData();
  const navigate = useNavigate();
  const [isReviewer, setIsReviewer] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    getAssignments().then((assignments) => {
      const reviewing = assignments.some((a) => a.reviewerId === user.uid);
      // Leadership users also get the reviewing panel
      setIsReviewer(reviewing || user.role === 'leadership');
    }).catch(() => {});
  }, [user?.uid, user?.role]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>Cortex</h2>
          <span>Learner Portal</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/learner/dashboard" end>
            <span className="nav-icon"><IconBookOpen /></span>My Courses
          </NavLink>
          <NavLink to="/learner/my-points">
            <span className="nav-icon"><IconAnalytics /></span>My Points
          </NavLink>
          <NavLink to="/learner/profile">
            <span className="nav-icon"><IconUser /></span>Profile
          </NavLink>

          {isReviewer && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Reviewing</div>
              <NavLink to="/learner/reviewing">
                <span className="nav-icon"><IconChart /></span>Learner Progress
              </NavLink>
              <NavLink to="/learner/review-chats">
                <span className="nav-icon"><IconChat /></span>Review Chats
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="main-wrapper">
        <header className="top-header">
          <NotificationBell />
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0) || '?'}</div>
            <div className="user-details">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Sign Out">
              <IconLogout />
            </button>
          </div>
        </header>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}
