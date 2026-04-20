import '../styles/loader.css';

export default function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-spinner">
        <div className="spinner-ring" />
        <div className="spinner-ring ring-2" />
        <div className="spinner-ring ring-3" />
      </div>
    </div>
  );
}
