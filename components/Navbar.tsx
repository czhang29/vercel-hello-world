'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../lib/supabaseBrowserClient';
import type { User } from '@supabase/supabase-js';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push('/');
  };

  const getInitial = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return '?';
  };

  const getAvatarUrl = () => {
    return user?.user_metadata?.avatar_url || null;
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">
          <span className="logo-icon">😂</span>
          <span>Caption This</span>
        </Link>

        <div className="navbar-links">
          <Link
            href="/images"
            className={`nav-link ${pathname === '/images' ? 'active' : ''}`}
          >
            🖼️ Gallery
          </Link>

          {user ? (
            <div className="dropdown" ref={dropdownRef}>
              <button
                className="avatar avatar-lg"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {getAvatarUrl() ? (
                  <img src={getAvatarUrl()!} alt="Avatar" referrerPolicy="no-referrer" />
                ) : (
                  getInitial()
                )}
              </button>

              <div className={`dropdown-menu ${dropdownOpen ? 'open' : ''}`}>
                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', marginBottom: '0.375rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {user.user_metadata?.full_name || 'User'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {user.email}
                  </div>
                </div>
                <button className="dropdown-item" onClick={handleSignOut}>
                  👋 Sign out
                </button>
              </div>
            </div>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
