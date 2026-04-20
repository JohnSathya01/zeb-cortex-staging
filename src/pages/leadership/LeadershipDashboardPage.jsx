import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import { IconUsers, IconBook, IconClipboard, IconChart } from '../../components/Icons.jsx';
import '../../styles/pages.css';

export default function LeadershipDashboardPage() {
  const { getUsers, getCourses, getAssignments } = useData();
  const [stats, setStats] = useState({ users: 0, courses: 0, assignments: 0 });

  useEffect(() => {
    async function loadStats() {
      const [users, courses, assignments] = await Promise.all([
        getUsers(), getCourses(), getAssignments(),
      ]);
      setStats({
        users: users.filter((u) => u.role === 'learner').length,
        courses: courses.length,
        assignments: assignments.length,
      });
    }
    loadStats();
  }, []);

  const links = [
    { to: '/leadership/users', label: 'User Management', desc: 'Create, edit, and manage learner accounts', Icon: IconUsers },
    { to: '/leadership/courses', label: 'Course Management', desc: 'Upload markdown files and manage courses', Icon: IconBook },
    { to: '/leadership/assign', label: 'Course Assignment', desc: 'Assign courses to learners', Icon: IconClipboard },
    { to: '/leadership/progress', label: 'Progress Monitoring', desc: 'Track learner progress and timelines', Icon: IconChart },
  ];

  return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.users}</div><div className="stat-label">Learners</div></div>
        <div className="stat-card"><div className="stat-value">{stats.courses}</div><div className="stat-label">Courses</div></div>
        <div className="stat-card"><div className="stat-value">{stats.assignments}</div><div className="stat-label">Assignments</div></div>
      </div>
      <h2 style={{ margin: '24px 0 16px', fontSize: '18px', fontWeight: 600 }}>Quick Links</h2>
      <div className="quick-links-grid">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="quick-link-card">
            <span className="quick-link-icon"><l.Icon /></span>
            <h3>{l.label}</h3>
            <p>{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
