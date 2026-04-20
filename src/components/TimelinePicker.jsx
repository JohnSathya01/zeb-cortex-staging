import React from 'react';
import '../styles/components.css';

export default function TimelinePicker({ value, onChange, disabled }) {
  return (
    <div className="timeline-picker">
      <label className="timeline-label" htmlFor="timeline-date">
        Target completion date
      </label>
      <input
        id="timeline-date"
        type="date"
        className="timeline-input"
        value={value || ''}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
