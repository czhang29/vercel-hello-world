// app/login/page.tsx
import LoginButton from './LoginButton';

export default function LoginPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Login</h1>
      <p>Please sign in with Google to continue.</p>
      <LoginButton />
    </main>
  );
}
