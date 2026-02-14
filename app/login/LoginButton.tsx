'use client';

import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';

export default function LoginButton() {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('signInWithOAuth error', error);
      return;
    }

    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <button
      onClick={handleSignIn}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '4px',
        border: '1px solid #ccc',
        background: 'white',
        cursor: 'pointer',
      }}
    >
      Sign in with Google
    </button>
  );
}
