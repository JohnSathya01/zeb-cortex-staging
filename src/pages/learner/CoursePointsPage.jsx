import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const SLA_MIN = 80;

function ScoreGauge({ score }) {
  const norm = Math.min(Math.max((score + 30) / 130, 0), 1);
  const r = 60;
  const circ = Math.PI * r; // semicircle circumference
  const dash = norm * circ;
  const color = score >= SLA_MIN ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  // SLA marker position at norm = (80+30)/130
  const slaNorm = 110 / 130;
  const slaMx = r * Math.cos(Math.PI - slaNorm * Math.PI);
  const slaMy = -r * Math.sin(slaNorm * Math.PI);

  return (
    <svg width="160" height="96" viewBox="-80 -72 160 96" aria-label={`${score} points`}>
      {/* Track */}
      <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
        fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      {/* SLA marker */}
      <circle cx={slaMx} cy={slaMy} r="5" fill="#9ca3af" />
      <text x={slaMx + 2} y={slaMy - 8} fontSize="8" fill="#9ca3af" textAnchor="middle">80</text>
      {/* Fill */}
      <path d={`M -${r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      {/* Score */}
      <text x="0" y="-18" textAnchor="middle" fontSize="30" fontWeight="800" fill={color}>{score}</text>
      <text x="0" y="2" textAnchor="middle" fontSize="11" fill="#6b7280">out of 100</text>
    </svg>
  );
}

function ScoreCard({ label, score, maxScore, minScore = 0, children }) {
  const norm = Math.max(0, (score - minScore) / (maxScore - minScore));
  const color = score > 0 ? '#22c55e' : score < 0 ? '#ef4444' : '#9ca3af';
  const barColor = score > 0 ? '#22c55e' : score < 0 ? '#ef4444' : '#d1d5db';
  return (
    <div className="pts-score-card">
      <div className="pts-score-card-header">
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
          <Link to="/learner/dashboard" className="back-link">&larr; Back to My Courses</Link>
          <h1>Course Points</h1>
          {course && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>{course.title}</div>}
        </div>
        <button className="btn btn-secondary" onClick={handleRecalculate} disabled={recalcing}>
          {recalcing ? 'Refreshing...' : 'Refresh Points'}
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
                {statusLabel}
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
            <ScoreCard label="Timeline Adherence" score={points.timeline ?? 0} maxScore={40} minScore={-20}>
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
                    <p className="pts-tip pts-tip--ok">You're on track or ahead of schedule.</p>
                  )}
                </>
              ) : (
                <p className="pts-tip">No due date set -- points unavailable for this category.</p>
              )}
            </ScoreCard>

            <ScoreCard label="AI Engagement" score={points.ai ?? 0} maxScore={30} minScore={-10}>
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
                    <p className="pts-tip pts-tip--ok">Excellent AI engagement -- maximum points.</p>
                  )}
                </>
              ) : (
                <p className="pts-tip">No exercises submitted yet. Complete exercises and use the AI review feature.</p>
              )}
            </ScoreCard>

            <ScoreCard label="Reviewer Feedback" score={points.reviewer ?? 0} maxScore={30} minScore={0}>
              {points.reviewerDetail?.source && points.reviewerDetail.source !== 'none' ? (
                <>
                  <div className="pts-detail-row">
                    <span>Attitude</span><strong>{points.reviewerDetail.attitude ?? 0}/10</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Communication</span><strong>{points.reviewerDetail.communication ?? 0}/10</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Business</span><strong>{points.reviewerDetail.business ?? 0}/10</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Technology</span><strong>{points.reviewerDetail.technology ?? 0}/10</strong>
                  </div>
                  <div className="pts-detail-row">
                    <span>Source</span><strong>{points.reviewerDetail.source === 'final' ? 'Final Review' : 'Weekly Review'}</strong>
                  </div>
                </>
              ) : (
                <p className="pts-tip">No reviewer feedback submitted yet. Your reviewer will rate you on 4 aspects.</p>
              )}
            </ScoreCard>
          </div>

          {/* How points work */}
          <div className="pts-explainer">
            <h3>How Points Work</h3>
            <div className="pts-explainer-grid">
              <div><strong>Timeline (max 40)</strong><p>Earn up to 40 pts for being on or ahead of schedule. Points go negative (down to -20) if you fall behind.</p></div>
              <div><strong>AI Engagement (max 30)</strong><p>Earn up to 30 pts for using AI review on your exercises. Low usage (-10) if you skip AI review.</p></div>
              <div><strong>Reviewer Feedback (max 30)</strong><p>Reviewer rates Attitude, Communication, Business, Technology (0-10 each). Average x3 = up to 30 pts.</p></div>
              <div><strong>SLA (minimum 80)</strong><p>You must maintain at least 80 points. Below 80 is At Risk; below 60 is Critical.</p></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
