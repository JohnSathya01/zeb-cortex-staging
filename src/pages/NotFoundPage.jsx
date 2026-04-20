import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{ padding: '48px', textAlign: 'center' }}>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/login">Back to login</Link>
    </div>
  );
}
