// app/images/page.tsx
import { supabase } from '../../lib/supabaseClient'; // or '@/lib/supabaseClient' if that works

type ImageRow = {
  id: string;
  url: string | null;
};

export default async function ImagesPage() {
  const { data, error } = await supabase
    .from('images')
    .select('id, url')  // only request existing columns
    .limit(20);

  if (error) {
    const msg = typeof error === 'string' ? error : error.message ?? 'Unknown error';

    return (
      <main style={{ padding: '2rem' }}>
        <h1>Images from Supabase</h1>
        <p style={{ color: 'red' }}>Error loading images: {msg}</p>
      </main>
    );
  }

  if (!data || data.length === 0) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Images from Supabase</h1>
        <p>No images found.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Images from Supabase</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {data.map((row: ImageRow) => (
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
    </main>
  );
}
