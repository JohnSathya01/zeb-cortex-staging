import { getRelativeTime } from '../utils/timeUtils.js';
import '../styles/components.css';

export default function NotificationDropdown({ notifications, onMarkRead, onMarkAllRead, onClose }) {
  const sorted = [...(notifications || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <div className="notification-dropdown">
      <div className="notification-dropdown-header">
        <span className="notification-dropdown-title">Notifications</span>
        <button className="notification-mark-all-btn" onClick={onMarkAllRead}>
          Mark all as read
        </button>
      </div>
      <div className="notification-dropdown-list">
        {sorted.length === 0 ? (
          <div className="notification-empty">No notifications yet.</div>
        ) : (
          sorted.map((n) => (
            <div
              key={n.id}
              className={`notification-item${n.read ? '' : ' notification-unread'}`}
              onClick={() => !n.read && onMarkRead(n.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && !n.read && onMarkRead(n.id)}
            >
              <div className="notification-message">{n.message}</div>
              <div className="notification-time">{getRelativeTime(n.createdAt)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
