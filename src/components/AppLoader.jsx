import '../styles/loader.css';

/*
 * Zeb logo mark — upward triangle split into:
 *   left: dark charcoal  |  right: lime green  |  apex: darker accent
 */
function ZebMark() {
  return (
    <svg
      className="zeb-mark"
      viewBox="0 0 52 46"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Dark charcoal left half */}
      <path d="M26,2 L4,42 Q2,44 5,44 L26,44 Z" fill="#3c3c3c" />

      {/* Lime green right half */}
      <path d="M26,2 L26,44 L47,44 Q50,44 48,42 Z" fill="#c4e04e" />
    </svg>
  );
}

export default function AppLoader({ message = 'Loading' }) {
  return (
    <div className="app-loader">
      <div className="loader-content">

        {/* Spinner rings orbiting the zeb mark */}
        <div className="loader-emblem">
          <div className="spinner-ring" />
          <div className="spinner-ring ring-2" />
          <div className="spinner-ring ring-3" />
          <ZebMark />
        </div>

        <div className="loader-brand">Cortex</div>
        <div className="loader-powered">powered by <span>zeb</span></div>

        <div className="loader-text">{message}</div>
        <div className="loader-dots">
          <span className="dot" />
          <span className="dot dot-2" />
          <span className="dot dot-3" />
        </div>

      </div>
    </div>
  );
}
