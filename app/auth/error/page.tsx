// app/auth/error/page.tsx
import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <div className="login-container">
      <div className="login-card fade-in">
        <div className="login-icon">😅</div>
        <h1 className="login-title">Oops!</h1>
        <p className="login-subtitle">
          There was a problem signing you in. Please try again.
        </p>
        <Link href="/login" className="btn btn-primary" style={{ width: '100%' }}>
          Try again
        </Link>
      </div>
    </div>
  );
}
