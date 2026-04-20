import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import ChatPanel from './ChatPanel.jsx';
import { IconChat } from './Icons.jsx';
import '../styles/components.css';

export default function ChatWidget({ assignmentId, reviewer, learnerName }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenCountRef = useRef(0);
  const { user } = useAuth();
  const { subscribeToChatMessages, sendChatMessage } = useData();

  // Always subscribe to count messages (even when collapsed)
  useEffect(() => {
    if (!assignmentId) return;
    const unsubscribe = subscribeToChatMessages(assignmentId, (msgs) => {
      setMessages(msgs);
      // Count messages from the other party that arrived after last seen
      const otherMessages = msgs.filter((m) => m.senderId !== user?.uid);
      if (!expanded) {
        setUnreadCount(Math.max(0, otherMessages.length - lastSeenCountRef.current));
      }
    });
    return () => unsubscribe();
  }, [assignmentId, subscribeToChatMessages, user?.uid, expanded]);

  // When expanding, mark all as seen
  useEffect(() => {
    if (expanded) {
      const otherMessages = messages.filter((m) => m.senderId !== user?.uid);
      lastSeenCountRef.current = otherMessages.length;
      setUnreadCount(0);
    }
  }, [expanded, messages, user?.uid]);

  const handleSend = async (text) => {
    await sendChatMessage(assignmentId, text);
  };

  if (!reviewer || !assignmentId) return null;

  return (
    <div className="chat-widget-wrapper">
      {expanded ? (
        <div className="chat-widget-expanded">
          <ChatPanel
            messages={messages}
            currentUserId={user.uid}
            onSend={handleSend}
            headerLabel={`Chat with ${reviewer.name}`}
            onClose={() => setExpanded(false)}
          />
        </div>
      ) : (
        <button
          className="chat-widget-toggle"
          onClick={() => setExpanded(true)}
          aria-label="Open chat with reviewer"
        >
          <IconChat style={{ width: 18, height: 18 }} /> Chat with Reviewer
          {unreadCount > 0 && (
            <span className="chat-unread-badge">{unreadCount}</span>
          )}
        </button>
      )}
    </div>
  );
}
