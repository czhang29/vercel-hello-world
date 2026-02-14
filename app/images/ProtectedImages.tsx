'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';

type ImageRow = {
  id: string;
  url: string | null;
};

export default function ProtectedImages() {
  const router = useRouter();
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      // 1. Check session on the client
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      if (!session) {
        // Not logged in → redirect to /login
        router.replace('/login');
        return;
      }

      // 2. Fetch protected data
      const { data, error } = await supabase
        .from('images')
        .select('id, url')
        .limit(20);

      if (error) {
        setError(error.message);
      } else {
        setRows(data as ImageRow[]);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) {
    return <p>Loading…</p>;
  }

  if (error) {
    return (
      <div>
        <h1>Images from Supabase</h1>
        <p style={{ color: 'red' }}>Error: {error}</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div>
        <h1>Images from Supabase</h1>
        <p>No images found.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Images from Supabase (Protected)</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((row) => (
          <li
            key={row.id}
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            <p><strong>ID:</strong> {row.id}</p>
            {row.url && (
              <div>
                <p><strong>URL:</strong> {row.url}</p>
                <img
                  src={row.url}
                  alt="Image"
                  style={{ maxWidth: '300px', marginTop: '0.5rem' }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
