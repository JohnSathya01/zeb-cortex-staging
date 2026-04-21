import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

const ACTION_META = {
  assign_course:   { label: 'Assign Course',    color: 'audit-action-assign' },
  unassign_course: { label: 'Unassign Course',  color: 'audit-action-danger' },
  assign_reviewer: { label: 'Assign Reviewer',  color: 'audit-action-assign' },
  remove_reviewer: { label: 'Remove Reviewer',  color: 'audit-action-warn' },
  create_user:     { label: 'Create User',      color: 'audit-action-create' },
  update_user:     { label: 'Update User',      color: 'audit-action-update' },
  delete_user:     { label: 'Delete User',      color: 'audit-action-danger' },
  create_cohort:   { label: 'Create Cohort',    color: 'audit-action-create' },
  update_cohort:   { label: 'Update Cohort',    color: 'audit-action-update' },
  delete_cohort:   { label: 'Delete Cohort',    color: 'audit-action-danger' },
  send_email:      { label: 'Email Sent',        color: 'audit-action-email' },
};

const ALL_ACTIONS = Object.keys(ACTION_META);

function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditLogPage() {
  const { getAuditLogs } = useData();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getAuditLogs(500);
    setLogs(data);
    setLoading(false);
  }

  if (loading) return <PageLoader />;

  // Unique actors for filter dropdown
  const actors = [...new Set(logs.map((l) => l.actorName))].sort();

  const filtered = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterActor && log.actorName !== filterActor) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !log.detail?.toLowerCase().includes(q) &&
        !log.actorName?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {/* Filters */}
      <div className="audit-filters">
        <input
          className="audit-search"
          type="text"
          placeholder="Search by actor or detail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="audit-filter-select"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          {ALL_ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
          ))}
        </select>
        <select
          className="audit-filter-select"
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
        >
          <option value="">All Users</option>
          {actors.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="audit-count">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.length === 0 ? (
        <div className="empty-state">No audit events found.</div>
      ) : (
        <div className="audit-log-list">
          {filtered.map((log) => {
            const meta = ACTION_META[log.action] || { label: log.action, color: '' };
            return (
              <div key={log.id} className="audit-entry">
                <div className="audit-entry-left">
                  <span className={`audit-action-badge ${meta.color}`}>{meta.label}</span>
                  <span className="audit-detail">{log.detail}</span>
                </div>
                <div className="audit-entry-right">
                  <span className="audit-actor">{log.actorName}</span>
                  <span className="audit-time">{formatTimestamp(log.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
