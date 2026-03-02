'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <section style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: '15%', left: '10%', fontSize: '4rem', opacity: 0.15, transform: 'rotate(-15deg)' }}>😂</div>
        <div style={{ position: 'absolute', top: '25%', right: '12%', fontSize: '3.5rem', opacity: 0.12, transform: 'rotate(12deg)' }}>🤣</div>
        <div style={{ position: 'absolute', bottom: '20%', left: '15%', fontSize: '3rem', opacity: 0.1, transform: 'rotate(8deg)' }}>😆</div>
        <div style={{ position: 'absolute', bottom: '30%', right: '8%', fontSize: '3.5rem', opacity: 0.12, transform: 'rotate(-10deg)' }}>🏆</div>

        <div className="fade-in" style={{ maxWidth: '640px' }}>
          <div style={{ fontSize: '5rem', marginBottom: '1.5rem', lineHeight: 1 }}>😂</div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: 1.1,
          }}>
            Caption This
          </h1>
          <p style={{
            fontSize: '1.125rem', color: 'var(--text-secondary)', lineHeight: 1.7,
            marginBottom: '2.5rem', maxWidth: '480px', margin: '0 auto 2.5rem',
          }}>
            Upload images, let AI generate hilarious captions, and vote for the funniest ones. The best humor rises to the top.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/images" className="btn btn-primary" style={{ padding: '0.875rem 2rem', fontSize: '1rem' }}>
              🖼️ Browse Gallery
            </Link>
            <Link href="/upload" className="btn btn-secondary" style={{ padding: '0.875rem 2rem', fontSize: '1rem' }}>
              📸 Upload Image
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginTop: '4rem', flexWrap: 'wrap' }}>
            {[
              { icon: '📸', label: 'Upload images' },
              { icon: '🤖', label: 'AI generates captions' },
              { icon: '👆', label: 'Vote on favorites' },
              { icon: '🏆', label: 'Best rises to top' },
            ].map((item, i) => (
              <div key={i} className={`fade-in stagger-${i + 2}`} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                fontSize: '0.9375rem', color: 'var(--text-muted)',
              }}>
                <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}