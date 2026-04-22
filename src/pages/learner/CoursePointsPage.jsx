import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const SLA_MIN = 80;

function ScoreGauge({ score }) {
  const clamped = Math.max(-30, Math.min(100, score));
  const norm = (clamped + 30) / 130; // normalize -30..100 → 0..1
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const strokeW = 10;
  const circumference = Math.PI * radius; // half circle
  const filled = norm * circumference;
  const color = score >= SLA_MIN ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const bgColor = '#e5e7eb';
  // We'll draw a half circle (bottom arc)
  const startAngle = Math.PI; // 180°
  const describeArc = (r, start, end) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const endAngle = startAngle + norm * Math.PI;

  return (
    <svg width="180" height="110" viewBox="0 0 180 110" aria-label={`Score: ${score}`}>
      {/* Track */}
      <path
        d={describeArc(radius, Math.PI, 2 * Math.PI)}
        fill="none" stroke={bgColor} strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* SLA marker at 80 pts = norm at (80+30)/130 */}
      {(() => {
        const slaNorm = (80 + 30) / 130;
        const slaAngle = Math.PI + slaNorm * Math.PI;
        const mx = cx + radius * Math.cos(slaAngle);
        const my = cy + radius * Math.sin(slaAngle);
        return <circle cx={mx} cy={my} r={4} fill="#6b7280" />;
      })()}
      {/* Fill */}
      {norm > 0 && (
        <path
          d={describeArc(radius, Math.PI, endAngle)}
          fill="none" stroke={color} strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s ease' }}
        />
      )}
      {/* Score text */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="32" fontWeight="800" fill={color}>{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#6b7280">out of 100</text>
      <text x={20} y={108} fontSize="10" fill="#9ca3af">-30</text>
      <text x={155} y={108} fontSize="10" fill="#9ca3af">100</text>
      <text x={cx - 6} y={108} fontSize="9" fill="#6b7280">80▲</text>
    </svg>
  );
}

function ScoreCard({ label, icon, score, maxScore, minScore = 0, children }) {
  const norm = Math.max(0, (score - minScore) / (maxScore - minScore));
  const color = score > 0 ? '#22c55e' : score < 0 ? '#ef4444' : '#9ca3af';
  const barColor = score > 0 ? '#22c55e' : score < 0 ? '#ef4444' : '#d1d5db';
  return (
    <div className="pts-score-card">
      <div className="pts-score-card-header">
        <span className="pts-score-icon">{icon}</span>
        <span className="pts-score-label">{label}</span>
        <span className="pts-score-value" style={{ color }}>{score > 0 ? '+' : ''}{score} pts</span>
      </div>
      <div className="pts-score-bar-track">
        <div
          className="pts-score-bar-fill"
          style={{
            width: `${Math.abs(norm) * 100}%`,
            background: barColor,
            marginLeft: score < 0 ? 'auto' : '0',
          }}
        />
      </div>
      <div className="pts-score-range">
        <span>{minScore}</span><span>{maxScore} max</span>
      </div>
      <div className="pts-score-detail">{children}</div>
    </div>
  );
}

export default function CoursePointsPage() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('aid');
  const { user } = useAuth();
  const { getCourseById, calculateCoursePoints, getCoursePoints, loading: dataLoading } = useData();

  const [points, setPoints] = useState(null);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalcing, setRecalcing] = useState(false);

  useEffect(() => {
    if (user && !dataLoading) load();
  }, [user, dataLoading, courseId]);

  async function load() {
    setLoading(true);
    try {
      const [c, existing] = await Promise.all([
        getCourseById(courseId),
        getCoursePoints(user.uid, courseId),
      ]);
      setCourse(c);
      if (existing) {
        setPoints(existing);
        setLoading(false);
        // Silently recalculate in background
        if (c) {
          const fresh = await calculateCoursePoints(user.uid, courseId, c.chapters.length, assignmentId, false);
          if (fresh) setPoints(fresh);
        }
      } else {
        // No data yet — calculate now
        if (c) {
          const fresh = await calculateCoursePoints(user.uid, courseId, c.chapters.length, assignmentId, false);
          if (fresh) setPoints(fresh);
        }
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  async function handleRecalculate() {
    if (!course) return;
    setRecalcing(true);
    const fresh = await calculateCoursePoints(user.uid, courseId, course.chapters.length, assignmentId, true);
    if (fresh) setPoints(fresh);
    setRecalcing(false);
  }

  if (loading) return <PageLoader />;

  const status = points?.status || 'unknown';
  const statusLabel = { on_track: 'On Track', at_risk: 'At Risk', critical: 'Critical' }[status] || 'No Data';
  const statusColor = { on_track: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' }[status] || '#9ca3af';
  const total = points?.total ?? 0;
  const ptgap = Math.max(0, SLA_MIN - total);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/learner/dashboard" className="back-link">← Back to My Courses</Link>
          <h1>Course Points</h1>
          {course && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>{course.title}</div>}
        </div>
        <button className="btn btn-secondary" onClick={handleRecalculate} disabled={recalcing}>
          {recalcing ? 'Refreshing…' : '↻ Refresh Points'}
        </button>
      </div>

      {!points ? (
        <div className="empty-state">No points data yet. Complete some chapters and exercises to start earning points.</div>
      ) : (
        <>
          {/* Hero gauge */}
          <div className="pts-hero">
            <div className="pts-gauge-wrap">
              <ScoreGauge score={total} />
              <div className="pts-status-pill" style={{ background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}40` }}>
                {status === 'on_track' ? '✓' : status === 'at_risk' ? '⚠' : '✕'} {statusLabel}
              </div>
            </div>
            <div className="pts-hero-info">
              <div className="pts-sla-box">
                <div className="pts-sla-top">
                  <span className="pts-sla-title">Minimum SLA</span>
                  <span className="pts-sla-required">80 pts required</span>
                </div>
                <div className="pts-sla-track">
                  <div className="pts-sla-fill" style={{
                    width: `${Math.min(100, Math.max(0, (total + 30) / 130 * 100))}%`,
                    background: statusColor,
                  }} />
                  <div className="pts-sla-marker" style={{ left: `${(80 + 30) / 130 * 100}%` }} />
                </div>
                {ptgap > 0 ? (
                  <p className="pts-sla-msg pts-sla-msg--warn">You need <strong>{ptgap} more points</strong> to meet the SLA.</p>
                ) : (
                  <p className="pts-sla-msg pts-sla-msg--ok">You're above the SLA. Keep going!</p>
                )}
              </div>
              {points.lastCalculated && (
                <div className="pts-last-calc">
                  Last calculated: {new Date(points.lastCalculated).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Breakdown cards */}
          <h2 className="pts-section-title">Points Breakdown</h2>
          <div className="pts-cards-grid">
            <ScoreCard label="Timeline Adherence" icon="📅" score={points.timeline ?? 0} maxScore={40} minScore={-20}>
              {points.timelineDetail?.totalDays > 0 ? (
                <>
                  <div className="pts-detail-row">
                    <span>Progress</span><strong>{points.timelineDetail.actualPct}%</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Expected by now</span><strong>{points.timelineDetail.expectedPct}%</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Days elapsed</span><strong>{points.timelineDetail.daysElapsed} / {points.timelineDetail.totalDays}</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Gap</span>
                    <strong style={{ color: points.timelineDetail.gap >= 0 ? '#22c55e' : '#ef4444' }}>
                      {points.timelineDetail.gap >= 0 ? '+' : ''}{points.timelineDetail.gap}%
                    </strong>
                  </div>
                  {points.timelineDetail.gap < 0 && (
                    <p className="pts-tip">You're behind schedule. Complete more chapters to earn back points.</p>
                  )}
                  {points.timelineDetail.gap >= 0 && (
                    <p className="pts-tip pts-tip--ok">You're on track or ahead of schedule!</p>
                  )}
                </>
              ) : (
                <p className="pts-tip">No due date set — points unavailable for this category.</p>
              )}
            </ScoreCard>

            <ScoreCard label="AI Engagement" icon="🤖" score={points.ai ?? 0} maxScore={30} minScore={-10}>
              {points.aiDetail?.totalSubmissions > 0 ? (
                <>
                  <div className="pts-detail-row">
                    <span>Exercises submitted</span><strong>{points.aiDetail.totalSubmissions}</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>AI-reviewed</span><strong>{points.aiDetail.aiEngaged}</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>AI engagement rate</span><strong>{points.aiDetail.rate}%</strong>
                  </div>
                  {points.aiDetail.rate < 50 && (
                    <p className="pts-tip">Interact with AI after each exercise answer to boost this score.</p>
                  )}
                  {points.aiDetail.rate >= 90 && (
                    <p className="pts-tip pts-tip--ok">Excellent AI engagement — maximum points!</p>
                  )}
                </>
              ) : (
                <p className="pts-tip">No exercises submitted yet. Complete exercises and use the AI review feature.</p>
              )}
            </ScoreCard>

            <ScoreCard label="Reviewer Interaction" icon="💬" score={points.reviewer ?? 0} maxScore={30} minScore={0}>
              <div className="pts-detail-row">
                <span>Messages sent</span><strong>{points.reviewerDetail?.learnerMessages ?? 0}</strong>
              </div>
              <div className="pts-detail-row">
                <span>Target</span><strong>5+ messages = 30 pts</strong>
              </div>
              {(points.reviewerDetail?.learnerMessages ?? 0) < 5 && (
                <p className="pts-tip">Chat with your reviewer to earn up to 30 points.</p>
              )}
              {(points.reviewerDetail?.learnerMessages ?? 0) >= 5 && (
                <p className="pts-tip pts-tip--ok">Great engagement with your reviewer!</p>
              )}
            </ScoreCard>
          </div>

          {/* How points work */}
          <div className="pts-explainer">
            <h3>How Points Work</h3>
            <div className="pts-explainer-grid">
              <div><strong>📅 Timeline (max 40)</strong><p>Earn up to 40 pts for being on or ahead of schedule. Points go negative (down to -20) if you fall behind.</p></div>
              <div><strong>🤖 AI Engagement (max 30)</strong><p>Earn up to 30 pts for using AI review on your exercises. Low usage (-10) if you skip AI review.</p></div>
              <div><strong>💬 Reviewer Interaction (max 30)</strong><p>Earn up to 30 pts for chatting with your reviewer. 5+ messages earns full points.</p></div>
              <div><strong>⚡ SLA (minimum 80)</strong><p>You must maintain at least 80 points. Below 80 is At Risk; below 60 is Critical.</p></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
