import { useState, useRef, useEffect } from 'react';
import { IconSend } from './Icons.jsx';
import '../styles/components.css';

export default function ChatPanel({ messages, currentUserId, onSend, headerLabel, onClose }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await onSend(trimmed);
      setInput('');
    } catch (err) {
      setError(err.message || 'Failed to send message');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span className="chat-panel-header-label">{headerLabel}</span>
        {onClose && (
          <button className="chat-panel-close" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        )}
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`chat-message ${isOwn ? 'own' : ''}`}>
                <div className="chat-message-sender">{msg.senderName}</div>
                <div className="chat-message-text">{msg.text}</div>
                <div className="chat-message-time">{formatTime(msg.createdAt)}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          aria-label="Chat message input"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <IconSend style={{ width: 16, height: 16 }} />
        </button>
      </div>
      {error && <div className="chat-input-error">{error}</div>}
    </div>
  );
}
