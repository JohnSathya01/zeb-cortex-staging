import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import '../../styles/pages.css';

export default function ChatListPage() {
  const { user } = useAuth();
  const { getReviewerConversations, subscribeToChatMessages, sendChatMessage } = useData();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  async function loadConversations() {
    try {
      const convos = await getReviewerConversations(user.uid);
      setConversations(convos);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const unsubscribe = subscribeToChatMessages(selectedId, setMessages);
    return () => unsubscribe();
  }, [selectedId, subscribeToChatMessages]);

  const selected = conversations.find((c) => c.assignmentId === selectedId);

  if (loading) return <PageLoader />;

  return (
    <div className="chat-list-page">
      <div className="chat-conversations">
        <h2>Conversations</h2>
        {conversations.length === 0 ? (
          <div className="empty-state">No conversations yet</div>
        ) : (
          conversations.map((c) => (
            <button
              key={c.assignmentId}
              className={`chat-conversation-item ${selectedId === c.assignmentId ? 'active' : ''}`}
              onClick={() => setSelectedId(c.assignmentId)}
            >
              <div className="chat-conversation-learner">{c.learnerName}</div>
              <div className="chat-conversation-course">{c.courseName}</div>
            </button>
          ))
        )}
      </div>
      <div className="chat-thread">
        {selected ? (
          <ChatPanel
            messages={messages}
            currentUserId={user.uid}
            onSend={(text) => sendChatMessage(selectedId, text)}
            headerLabel={`Chat with ${selected.learnerName}`}
          />
        ) : (
          <div className="empty-state">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
