import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import NotificationDropdown from './NotificationDropdown.jsx';
import { IconBell } from './Icons.jsx';
import '../styles/components.css';

export default function NotificationBell() {
  const { user } = useAuth();
  const { subscribeToNotifications, markNotificationRead, markAllNotificationsRead } = useData();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = subscribeToNotifications(user.uid, (notifs) => {
      setNotifications(notifs);
    });
    return () => unsubscribe();
  }, [user?.uid, subscribeToNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleMarkRead(notificationId) {
    if (user?.uid) markNotificationRead(user.uid, notificationId);
  }

  function handleMarkAllRead() {
    if (user?.uid) markAllNotificationsRead(user.uid);
  }

  return (
    <div className="notification-bell-wrapper" ref={bellRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
      >
        <span className="notification-bell-icon"><IconBell /></span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>
      {open && (
        <NotificationDropdown
          notifications={notifications}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
