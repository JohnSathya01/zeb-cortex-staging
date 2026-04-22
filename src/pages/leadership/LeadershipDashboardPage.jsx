import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import { IconUsers, IconBook, IconClipboard, IconChart } from '../../components/Icons.jsx';
import '../../styles/pages.css';

function PointsStatusPill({ status, points }) {
  const cfg = {
    on_track: { label: 'On Track', color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
    at_risk:  { label: 'At Risk',  color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
    critical: { label: 'Critical', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  }[status] || { label: status, color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {status === 'at_risk' ? '⚠' : '✕'} {cfg.label} · {points} pts
    </span>
  );
}

export default function LeadershipDashboardPage() {
  const { getUsers, getCourses, getAssignments, getAtRiskLearners } = useData();
  const [stats, setStats] = useState({ users: 0, courses: 0, assignments: 0 });
  const [atRisk, setAtRisk] = useState([]);
  const [atRiskLoading, setAtRiskLoading] = useState(true);

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
    async function loadAtRisk() {
      setAtRiskLoading(true);
      const data = await getAtRiskLearners();
      setAtRisk(data);
      setAtRiskLoading(false);
    }
    loadStats();
    loadAtRisk();
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
        <div className="stat-card" style={{ borderColor: atRisk.length > 0 ? '#fca5a5' : undefined }}>
          <div className="stat-value" style={{ color: atRisk.length > 0 ? '#ef4444' : undefined }}>{atRisk.length}</div>
          <div className="stat-label">At Risk / Critical</div>
        </div>
      </div>

      {/* At-Risk Learners Panel */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
            ⚠ At-Risk Learners
            <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--gray-500)', marginLeft: '8px' }}>below 80-pt SLA</span>
          </h2>
        </div>

        {atRiskLoading ? (
          <div style={{ color: 'var(--gray-500)', fontSize: '13px' }}>Loading…</div>
        ) : atRisk.length === 0 ? (
          <div className="pts-no-risk">
            <span style={{ fontSize: '24px' }}>✓</span>
            <span>All learners are above the 80-point SLA. Great work!</span>
          </div>
        ) : (
          <div className="pts-risk-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Timeline</th>
                  <th>AI</th>
                  <th>Reviewer</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.learnerName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{row.learnerEmail}</div>
                    </td>
                    <td style={{ fontSize: '13px' }}>{row.courseId}</td>
                    <td><PointsStatusPill status={row.status} points={row.points} /></td>
                    <td>
                      <span style={{ fontSize: '13px', color: row.timeline < 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                        {row.timeline > 0 ? '+' : ''}{row.timeline}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: row.ai < 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                        {row.ai > 0 ? '+' : ''}{row.ai}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.reviewer}</span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                      {row.targetCompletionDate ? new Date(row.targetCompletionDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
