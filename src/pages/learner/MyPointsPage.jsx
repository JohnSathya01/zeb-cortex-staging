import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const SLA = 80;

function MiniGauge({ total, status }) {
  const pct = Math.min(Math.max((total + 30) / 130, 0), 1);
  const r = 28;
  const circ = Math.PI * r;
  const dash = pct * circ;
  const color = status === 'on_track' ? '#22c55e' : status === 'at_risk' ? '#f59e0b' : '#ef4444';
  return (
    <svg width="72" height="44" viewBox="-36 -6 72 44" aria-label={`${total} points`}>
      <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
        fill="none" stroke="#e5e7eb" strokeWidth="7" strokeLinecap="round" />
      {pct > 0 && (
        <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
          fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} />
      )}
      <text x="0" y="12" textAnchor="middle" fontSize="14" fontWeight="800" fill={color}>{total}</text>
    </svg>
  );
}

export default function MyPointsPage() {
  const { user } = useAuth();
  const { getAssignments, getCourseById, calculateCoursePoints, loading: dataLoading } = useData();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !dataLoading) load();
  }, [user, dataLoading]);

  async function load() {
    setLoading(true);
    try {
      const assignments = await getAssignments({ learnerId: user.uid });
      const built = [];
      for (const a of assignments) {
        try {
          const course = await getCourseById(a.courseId);
          if (!course) continue;
          const pts = await calculateCoursePoints(user.uid, a.courseId, course.chapters.length, a.id, false);
          built.push({ assignment: a, course, pts });
        } catch { /* skip */ }
      }
      setRows(built);
    } catch { /* handle */ }
    finally { setLoading(false); }
  }

  if (loading) return <PageLoader />;

  const atRisk = rows.filter(r => r.pts && r.pts.status !== 'on_track');
  const onTrack = rows.filter(r => r.pts && r.pts.status === 'on_track');

  return (
    <div>
      <div className="page-header"><h1>My Points</h1></div>

      {rows.length === 0 ? (
        <div className="empty-state">No courses assigned yet.</div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="mypts-summary">
            <div className="mypts-stat">
              <span className="mypts-stat-val">{rows.length}</span>
              <span className="mypts-stat-label">Courses</span>
            </div>
            <div className="mypts-stat">
              <span className="mypts-stat-val" style={{ color: '#22c55e' }}>{onTrack.length}</span>
              <span className="mypts-stat-label">On Track</span>
            </div>
            <div className="mypts-stat">
              <span className="mypts-stat-val" style={{ color: atRisk.length ? '#f59e0b' : '#22c55e' }}>{atRisk.length}</span>
              <span className="mypts-stat-label">At Risk / Critical</span>
            </div>
            <div className="mypts-stat">
              <span className="mypts-stat-val">{SLA}</span>
              <span className="mypts-stat-label">SLA Minimum</span>
            </div>
          </div>

          {atRisk.length > 0 && (
            <div className="pts-alert-banner" style={{ marginBottom: '20px' }}>
              <span className="pts-alert-icon">⚠</span>
              <span><strong>{atRisk.length} course{atRisk.length > 1 ? 's are' : ' is'} below the 80-point SLA.</strong> Take action to get back on track.</span>
            </div>
          )}

          <div className="mypts-cards">
            {rows.map(({ assignment, course, pts }) => {
              const total = pts?.total ?? 0;
              const status = pts?.status ?? 'critical';
              const color = status === 'on_track' ? '#22c55e' : status === 'at_risk' ? '#f59e0b' : '#ef4444';
              const ptgap = Math.max(0, SLA - total);
              return (
                <div
                  key={assignment.id}
                  className="mypts-card"
                  onClick={() => navigate(`/learner/points/${course.id}?aid=${assignment.id}`)}
                  style={{ borderLeftColor: color }}
                >
                  <div className="mypts-card-left">
                    <MiniGauge total={total} status={status} />
                  </div>
                  <div className="mypts-card-body">
                    <div className="mypts-card-title">{course.title}</div>
                    <div className="mypts-card-status" style={{ color }}>
                      {status === 'on_track' ? '✓ On Track' : status === 'at_risk' ? '⚠ At Risk' : '✕ Critical'}
                    </div>
                    {ptgap > 0 && (
                      <div className="mypts-card-gap">Need <strong>{ptgap} more pts</strong> for SLA</div>
                    )}
                    <div className="mypts-breakdown-row">
                      <span title="Timeline">📅 {pts?.timeline ?? 0}</span>
                      <span title="AI">🤖 {pts?.ai ?? 0}</span>
                      <span title="Reviewer">💬 {pts?.reviewer ?? 0}</span>
                    </div>
                  </div>
                  <div className="mypts-card-arrow">→</div>
                </div>
              );
            })}
          </div>

          <div className="pts-explainer" style={{ marginTop: '28px' }}>
            <h3>How Points Are Calculated</h3>
            <div className="pts-explainer-grid">
              <div><strong>📅 Timeline (max 40)</strong><p>On/ahead of schedule = up to +40. Behind schedule = up to -20.</p></div>
              <div><strong>🤖 AI Engagement (max 30)</strong><p>Use AI review on exercises for up to +30. Ignoring AI = -10 pts.</p></div>
              <div><strong>💬 Reviewer Chat (max 30)</strong><p>Send 5+ messages to your reviewer for full 30 pts.</p></div>
              <div><strong>⚡ SLA = 80 pts</strong><p>Minimum score required. Below 80 is At Risk, below 60 is Critical.</p></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
