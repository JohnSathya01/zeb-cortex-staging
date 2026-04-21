import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { IconDashboard, IconUsers, IconBook, IconClipboard, IconChart, IconChat, IconShield, IconLogout, IconAnalytics, IconCohort, IconAudit } from '../components/Icons.jsx';
import '../styles/layout.css';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/leadership/dashboard', label: 'Dashboard', Icon: IconDashboard },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/leadership/users',    label: 'User Management',     Icon: IconUsers },
      { to: '/leadership/cohorts',  label: 'Cohorts',             Icon: IconCohort },
      { to: '/leadership/reviewers',label: 'Reviewer Management', Icon: IconShield },
    ],
  },
  {
    label: 'Courses',
    items: [
      { to: '/leadership/courses', label: 'Course Management', Icon: IconBook },
      { to: '/leadership/assign',  label: 'Course Assignment', Icon: IconClipboard },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/leadership/progress',  label: 'Progress Monitoring', Icon: IconChart },
      { to: '/leadership/analytics', label: 'Analytics',           Icon: IconAnalytics },
      { to: '/leadership/audit',     label: 'Audit Log',           Icon: IconAudit },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/leadership/chats', label: 'Chats', Icon: IconChat },
    ],
  },
];

export default function LeadershipLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>Cortex</h2>
          <span>Leadership Portal</span>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/leadership/dashboard'}>
                  <span className="nav-icon"><item.Icon /></span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
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
