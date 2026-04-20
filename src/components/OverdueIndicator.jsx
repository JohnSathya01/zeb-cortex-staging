import React from 'react';
import '../styles/components.css';

export default function OverdueIndicator({ targetDate, isCompleted }) {
  if (!targetDate || isCompleted) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  if (now <= target) return null;

  return <span className="overdue-badge">Overdue</span>;
}
