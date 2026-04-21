import { useState, useRef, useEffect } from 'react';
import '../styles/components.css';

const STATUS = { idle: 'idle', pass: 'pass', fail: 'fail' };
const WORKER_URL = import.meta.env.VITE_MAILER_URL;

async function fetchAIReview(exercisePrompt, learnerAnswer) {
  const res = await fetch(`${WORKER_URL}/ai/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercisePrompt, learnerAnswer }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'AI review failed');
  return data.feedback;
}

export default function ExerciseCard({ exercise, submission, onSubmit }) {
  // Support both Firebase exercises (exercise.prompt, exercise.pattern) and legacy markdown exercises
  const rule = exercise.pattern ? { pattern: exercise.pattern, flags: exercise.flags, hint: exercise.hint, explanation: exercise.explanation } : null;
  const [code, setCode] = useState(submission?.text || '');
  const [status, setStatus] = useState(submission ? STATUS.pass : STATUS.idle);
  const [feedback, setFeedback] = useState(submission ? '✓ Previously submitted' : '');
  const [running, setRunning] = useState(false);
  const [aiReview, setAiReview]     = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const textareaRef = useRef(null);
  const lineCountRef = useRef(null);

  if (!exercise) return null;

  const hasRule = rule?.pattern;

  function syncLines() {
    if (!textareaRef.current || !lineCountRef.current) return;
    const lines = code.split('\n').length;
    lineCountRef.current.innerHTML = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join('<br/>');
  }

  useEffect(() => { syncLines(); }, [code]);

  function handleTabKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newVal);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  }

  async function handleRun() {
    if (!code.trim()) return;
    setRunning(true);

    // Short artificial delay so it feels like it's "running"
    await new Promise((r) => setTimeout(r, 400));

    if (hasRule) {
      try {
        const regex = new RegExp(rule.pattern, rule.flags || 'i');
        const passed = regex.test(code.trim());
        if (passed) {
          setStatus(STATUS.pass);
          setFeedback(rule.explanation || 'Correct! Your answer matches the expected pattern.');
          await onSubmit?.(exercise.id, code);
        } else {
          setStatus(STATUS.fail);
          setFeedback(rule.hint || 'Not quite — review your answer and try again.');
        }
      } catch {
        setStatus(STATUS.fail);
        setFeedback('Could not validate — regex error in rule definition.');
      }
    } else {
      // No regex rule — open-ended, just save
      setStatus(STATUS.pass);
      setFeedback('Submitted! Your answer has been saved for review.');
      await onSubmit?.(exercise.id, code);
    }

    setRunning(false);
  }

  function handleReset() {
    setCode('');
    setStatus(STATUS.idle);
    setFeedback('');
    setAiReview('');
  }

  async function handleAIReview() {
    if (!code.trim()) return;
    setAiLoading(true);
    setAiReview('');
    try {
      const prompt = exercise.prompt || exercise.instructions || '';
      const review = await fetchAIReview(prompt, code);
      setAiReview(review);
    } catch {
      setAiReview('AI review unavailable right now. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  const isPassed = status === STATUS.pass;
  const isFailed = status === STATUS.fail;

  return (
    <div className="ide-card">
      {/* Title bar */}
      <div className="ide-titlebar">
        <div className="ide-dots">
          <span className="ide-dot red" />
          <span className="ide-dot yellow" />
          <span className="ide-dot green" />
        </div>
        <span className="ide-filename">{exercise.title || 'Try It Yourself'}</span>
        <span className="ide-badge">exercise</span>
      </div>

      {/* Question prompt */}
      <div className="ide-prompt">
        <span className="ide-prompt-icon">?</span>
        <p>{exercise.prompt || exercise.instructions || 'Write your answer below.'}</p>
      </div>

      {/* Editor area */}
      <div className="ide-editor-wrap">
        <div className="ide-line-numbers" ref={lineCountRef} aria-hidden="true">1</div>
        <textarea
          ref={textareaRef}
          className="ide-editor"
          value={code}
          onChange={(e) => { setCode(e.target.value); setStatus(STATUS.idle); setFeedback(''); }}
          onKeyDown={handleTabKey}
          placeholder={rule?.hint ? `Hint: ${rule.hint}` : 'Write your answer here…'}
          spellCheck={false}
          rows={6}
        />
      </div>

      {/* Toolbar */}
      <div className="ide-toolbar">
        <button
          className={`ide-run-btn${running ? ' running' : ''}`}
          onClick={handleRun}
          disabled={running || !code.trim() || isPassed}
        >
          {running ? '⟳ Running…' : isPassed ? '✓ Submitted' : '▶ Run'}
        </button>
        {(status !== STATUS.idle) && !isPassed && (
          <button className="ide-reset-btn" onClick={handleReset}>Reset</button>
        )}
        {isPassed && !hasRule && (
          <button className="ide-reset-btn" onClick={handleReset}>Edit</button>
        )}
        {/* AI Review — available once there's something written */}
        {code.trim() && (
          <button
            className="ide-ai-btn"
            onClick={handleAIReview}
            disabled={aiLoading}
            title="Get AI feedback on your answer"
          >
            {aiLoading ? '⟳ Reviewing…' : '✦ AI Review'}
          </button>
        )}
      </div>

      {/* Output panel */}
      {feedback && (
        <div className={`ide-output ${isPassed ? 'pass' : isFailed ? 'fail' : ''}`}>
          <span className="ide-output-icon">{isPassed ? '✓' : '✕'}</span>
          <span className="ide-output-msg">{feedback}</span>
          {isPassed && hasRule && (
            <span className="ide-score-badge">+1 pt</span>
          )}
        </div>
      )}

      {/* AI Review panel */}
      {(aiReview || aiLoading) && (
        <div className="ide-ai-review">
          <div className="ide-ai-review-header">
            <span className="ide-ai-icon">✦</span>
            <span>AI Tutor Feedback</span>
          </div>
          {aiLoading
            ? <p className="ide-ai-thinking">Reviewing your answer…</p>
            : <p className="ide-ai-text">{aiReview}</p>
          }
        </div>
      )}
    </div>
  );
}
