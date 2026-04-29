import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../styles/components.css';

const WORKER_URL = import.meta.env.VITE_MAILER_URL;

const PAGE_DESCRIPTIONS = {
  '/leadership/dashboard': 'Leadership Dashboard — overview of all learners, courses, progress stats and alerts',
  '/leadership/users': 'User Management — manage learner and leadership user accounts',
  '/leadership/courses': 'Course Management — create and edit courses, chapters, content',
  '/leadership/assign': 'Course Assignment — assign courses to learners, set reviewers and deadlines',
  '/leadership/progress': 'Progress Monitoring — detailed learner progress, feedback history, chapter completion, points breakdown',
  '/leadership/reviewers': 'Reviewer Management — manage reviewer assignments and workload',
  '/leadership/analytics': 'Analytics Dashboard — charts and insights on learner engagement, completion rates',
  '/leadership/cohorts': 'Cohort Management — organize learners into groups/batches',
  '/leadership/audit': 'Audit Log — history of all actions taken on the platform',
  '/leadership/chats': 'Chat List — view all learner-reviewer conversations',
  '/leadership/reviewing': 'Learner Progress (Reviewer view) — review learner work and provide feedback',
  '/leadership/review-chats': 'Review Chats — messaging between reviewers and learners',
};

const THINKING_PHRASES = [
  'Thinking…', 'Reasoning…', 'Cortexing…', 'Analyzing…',
  'Processing…', 'Consulting…', 'Synthesizing…', 'Reflecting…',
];

function getPageContext(pathname) {
  const pageDesc = PAGE_DESCRIPTIONS[pathname] || null;
  // Try to capture visible page data from the main content area
  const mainContent = document.querySelector('[class*="layout-content"], main, .page-header');
  let visibleText = '';
  if (mainContent) {
    // Get text from tables, headings, stats, and key data elements
    const elements = mainContent.querySelectorAll('h1, h2, h3, .stats-card, table, .pts-hero, .pts-score-card, .empty-state, .panel-title, .status-badge, [class*="detail"], [class*="summary"]');
    const parts = [];
    elements.forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length < 2000) parts.push(text);
    });
    visibleText = parts.join('\n').slice(0, 4000);
  }
  return { page: pageDesc || pathname, visibleData: visibleText };
}

export default function AskCortexWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [phrase, setPhrase] = useState(THINKING_PHRASES[0]);
  const phraseRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    phraseRef.current = setInterval(() => {
      i = (i + 1) % THINKING_PHRASES.length;
      setPhrase(THINKING_PHRASES[i]);
    }, 700);
    return () => clearInterval(phraseRef.current);
  }, [loading]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 150);
  }, [open]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setPhrase(THINKING_PHRASES[0]);

    try {
      const ctx = getPageContext(location.pathname);
      const res = await fetch(`${WORKER_URL}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: messages, pageContext: ctx }),
      });
      const data = await res.json();
      setMessages([...newMessages, {
        role: 'assistant',
        content: data.ok ? data.answer : 'Sorry, something went wrong. Try again.',
      }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Could not reach Cortex AI. Check your connection.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button className="ask-cortex-fab" onClick={() => setOpen(true)}>
          <span className="ask-cortex-fab-icon">✦</span>
          Ask Cortex
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="ask-cortex-panel">
          <div className="ask-cortex-header">
            <div className="ask-cortex-header-left">
              <span className="ask-cortex-header-icon">✦</span>
              <span className="ask-cortex-header-title">Ask Cortex</span>
            </div>
            <button className="ask-cortex-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="ask-cortex-messages">
            {messages.length === 0 && (
              <div className="ask-cortex-empty">
                <span className="ask-cortex-empty-icon">✦</span>
                <p>Ask me anything about courses, learners, or training strategy.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ask-cortex-msg ask-cortex-msg--${m.role}`}>
                {m.role === 'assistant' && <span className="ask-cortex-msg-icon">✦</span>}
                <span className="ask-cortex-msg-text">{m.content}</span>
              </div>
            ))}
            {loading && (
              <div className="ask-cortex-msg ask-cortex-msg--assistant">
                <span className="ask-cortex-msg-icon">✦</span>
                <span className="ask-cortex-thinking-phrase">
                  <span className="ask-cortex-dot-pulse" />
                  {phrase}
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ask-cortex-footer">
            <textarea
              ref={textareaRef}
              className="ask-cortex-input"
              rows={2}
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="ask-cortex-send"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
