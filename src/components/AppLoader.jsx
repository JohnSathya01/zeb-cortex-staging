import '../styles/loader.css';

/*
 * Zeb logo mark — upward triangle split into:
 *   left: dark charcoal  |  right: lime green  |  apex: darker accent
 */
function ZebMark() {
  return (
    <svg
      className="zeb-mark"
      viewBox="0 0 46 46"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Dark charcoal left half */}
      <path d="M23,3 L7,39 Q4,45 10,45 L30,45 Z" fill="#3c3c3c" />

      {/* Lime green right half */}
      <path d="M23,3 L30,45 L37,45 Q43,45 40,39 Z" fill="#c4e04e" />

      {/* Darker apex accent where the two halves meet */}
      <path d="M23,3 L27,15 L19,15 Z" fill="#555555" opacity="0.75" />
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
