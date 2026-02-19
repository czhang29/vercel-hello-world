// app/login/page.tsx
import LoginButton from './LoginButton';

export default function LoginPage() {
  return (
    <div className="login-container">
      <div className="login-card fade-in">
        <div className="login-icon">😂</div>
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">
          Sign in to vote on the funniest captions and help the best humor rise to the top.
        </p>
        <LoginButton />
        <p style={{
          marginTop: '1.5rem',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          By signing in, you can upvote and downvote captions to help rank the funniest ones.
        </p>
      </div>
    </div>
  );
}
