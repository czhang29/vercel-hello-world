'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';
import Toast from '../../components/Toast';
import type { User } from '@supabase/supabase-js';

type CaptionVote = {
  caption_id: string;
  vote: number; // 1 for upvote, -1 for downvote
};

type Caption = {
  id: string;
  caption_text: string;
  created_at: string;
  author_name?: string;
  upvotes: number;
  downvotes: number;
  net_score: number;
};

type ImageRow = {
  id: string;
  url: string | null;
  alt_text?: string | null;
  created_at?: string;
  captions: Caption[];
};

type SortMode = 'top' | 'new' | 'controversial';

export default function ProtectedImages() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [votingCaptionId, setVotingCaptionId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('top');
  const [toast, setToast] = useState({ message: '', visible: false });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
  };

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      // Check session
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
        router.replace('/login');
        return;
      }

      setUser(session.user);

      // Fetch images
      const { data: images, error: imgError } = await supabase
        .from('images')
        .select('id, url, alt_text, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (imgError) {
        setError(imgError.message);
        setLoading(false);
        return;
      }

      if (!images || images.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch captions for all images
      const imageIds = images.map((img: any) => img.id);
      const { data: captions, error: capError } = await supabase
        .from('captions')
        .select('id, image_id, caption_text, created_at, author_name')
        .in('image_id', imageIds);

      // Fetch vote counts for all captions
      let captionVoteCounts: Record<string, { upvotes: number; downvotes: number }> = {};
      if (captions && captions.length > 0) {
        const captionIds = captions.map((c: any) => c.id);
        const { data: votes } = await supabase
          .from('caption_votes')
          .select('caption_id, vote')
          .in('caption_id', captionIds);

        if (votes) {
          for (const v of votes) {
            if (!captionVoteCounts[v.caption_id]) {
              captionVoteCounts[v.caption_id] = { upvotes: 0, downvotes: 0 };
            }
            if (v.vote > 0) captionVoteCounts[v.caption_id].upvotes++;
            else if (v.vote < 0) captionVoteCounts[v.caption_id].downvotes++;
          }
        }

        // Fetch current user's votes
        const { data: myVotes } = await supabase
          .from('caption_votes')
          .select('caption_id, vote')
          .eq('user_id', session.user.id)
          .in('caption_id', captionIds);

        if (myVotes) {
          const voteMap: Record<string, number> = {};
          for (const v of myVotes) {
            voteMap[v.caption_id] = v.vote;
          }
          setUserVotes(voteMap);
        }
      }

      // Combine data
      const enrichedImages = images.map((img: any) => {
        const imgCaptions = (captions || [])
          .filter((c: any) => c.image_id === img.id)
          .map((c: any) => ({
            id: c.id,
            caption_text: c.caption_text,
            created_at: c.created_at,
            author_name: c.author_name || 'Anonymous',
            upvotes: captionVoteCounts[c.id]?.upvotes || 0,
            downvotes: captionVoteCounts[c.id]?.downvotes || 0,
            net_score: (captionVoteCounts[c.id]?.upvotes || 0) - (captionVoteCounts[c.id]?.downvotes || 0),
          }));

        return {
          ...img,
          captions: imgCaptions,
        };
      });

      setRows(enrichedImages);
      setLoading(false);
    }

    load();
  }, [router]);

  const handleVote = useCallback(async (captionId: string, voteValue: number) => {
    if (!user) {
      router.push('/login');
      return;
    }

    setVotingCaptionId(captionId);
    const supabase = createSupabaseBrowserClient();
    const currentVote = userVotes[captionId];

    try {
      if (currentVote === voteValue) {
        // Remove vote (toggle off)
        const { error } = await supabase
          .from('caption_votes')
          .delete()
          .eq('caption_id', captionId)
          .eq('user_id', user.id);

        if (error) throw error;

        setUserVotes((prev) => {
          const next = { ...prev };
          delete next[captionId];
          return next;
        });

        // Update local counts
        setRows((prev) =>
          prev?.map((img) => ({
            ...img,
            captions: img.captions.map((c) => {
              if (c.id !== captionId) return c;
              return {
                ...c,
                upvotes: c.upvotes - (voteValue > 0 ? 1 : 0),
                downvotes: c.downvotes - (voteValue < 0 ? 1 : 0),
                net_score: c.net_score - voteValue,
              };
            }),
          })) ?? null
        );

        showToast('Vote removed');
      } else {
        // Upsert vote
        const { error } = await supabase
          .from('caption_votes')
          .upsert(
            {
              caption_id: captionId,
              user_id: user.id,
              vote: voteValue,
            },
            { onConflict: 'caption_id,user_id' }
          );

        if (error) throw error;

        const previousVote = currentVote || 0;

        setUserVotes((prev) => ({
          ...prev,
          [captionId]: voteValue,
        }));

        // Update local counts
        setRows((prev) =>
          prev?.map((img) => ({
            ...img,
            captions: img.captions.map((c) => {
              if (c.id !== captionId) return c;
              let upDelta = 0;
              let downDelta = 0;

              if (previousVote > 0) upDelta--;
              if (previousVote < 0) downDelta--;
              if (voteValue > 0) upDelta++;
              if (voteValue < 0) downDelta++;

              return {
                ...c,
                upvotes: c.upvotes + upDelta,
                downvotes: c.downvotes + downDelta,
                net_score: c.net_score + voteValue - previousVote,
              };
            }),
          })) ?? null
        );

        showToast(voteValue > 0 ? '👍 Upvoted!' : '👎 Downvoted');
      }
    } catch (err: any) {
      console.error('Vote error:', err);
      showToast('Failed to vote. Please try again.');
    } finally {
      setVotingCaptionId(null);
    }
  }, [user, userVotes, router]);

  const sortCaptions = (captions: Caption[]): Caption[] => {
    const sorted = [...captions];
    switch (sortMode) {
      case 'top':
        return sorted.sort((a, b) => b.net_score - a.net_score);
      case 'new':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'controversial':
        // Most total votes with closest to 0 net score
        return sorted.sort((a, b) => {
          const aTotal = a.upvotes + a.downvotes;
          const bTotal = b.upvotes + b.downvotes;
          const aControversy = aTotal > 0 ? aTotal / (Math.abs(a.net_score) + 1) : 0;
          const bControversy = bTotal > 0 ? bTotal / (Math.abs(b.net_score) + 1) : 0;
          return bControversy - aControversy;
        });
      default:
        return sorted;
    }
  };

  const getScoreClass = (score: number) => {
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return '';
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Loading skeleton
  if (loading) {
    return (
      <main className="page-container">
        <div className="page-header">
          <div className="skeleton" style={{ width: '200px', height: '36px', margin: '0 auto 0.75rem' }} />
          <div className="skeleton" style={{ width: '320px', height: '20px', margin: '0 auto' }} />
        </div>
        <div className="image-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ width: '100%', aspectRatio: '4/3' }} />
              <div style={{ padding: '1.25rem' }}>
                <div className="skeleton" style={{ width: '60%', height: '16px', marginBottom: '0.5rem' }} />
                <div className="skeleton" style={{ width: '80%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-container">
        <div className="login-container">
          <div className="login-card">
            <div className="login-icon">😬</div>
            <h1 className="login-title">Something went wrong</h1>
            <p className="login-subtitle">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1 className="page-title">Gallery</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🖼️</div>
          <p>No images found yet. Check back soon!</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="page-header fade-in">
        <h1 className="page-title">Caption Gallery</h1>
        <p className="page-subtitle">
          Browse images and vote on the funniest captions. The best humor rises to the top!
        </p>
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }} className="fade-in stagger-1">
        <div className="sort-pills">
          <button
            className={`sort-pill ${sortMode === 'top' ? 'active' : ''}`}
            onClick={() => setSortMode('top')}
          >
            🏆 Top Rated
          </button>
          <button
            className={`sort-pill ${sortMode === 'new' ? 'active' : ''}`}
            onClick={() => setSortMode('new')}
          >
            ✨ Newest
          </button>
          <button
            className={`sort-pill ${sortMode === 'controversial' ? 'active' : ''}`}
            onClick={() => setSortMode('controversial')}
          >
            🔥 Controversial
          </button>
        </div>
      </div>

      <div className="image-grid">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className={`card fade-in stagger-${Math.min(idx + 1, 6)}`}
          >
            {/* Image */}
            {row.url && (
              <div className="card-image-wrapper">
                <img src={row.url} alt={row.alt_text || 'Humor image'} />
                {row.captions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '0.75rem',
                    right: '0.75rem',
                    background: 'rgba(26,22,18,0.7)',
                    backdropFilter: 'blur(8px)',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.25rem 0.625rem',
                    borderRadius: 'var(--radius-full)',
                  }}>
                    {row.captions.length} caption{row.captions.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            <div className="card-body">
              {/* Captions */}
              {row.captions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  No captions yet
                </p>
              ) : (
                <div className="captions-list">
                  {sortCaptions(row.captions)
                    .slice(0, expandedImage === row.id ? undefined : 3)
                    .map((caption, captionIdx) => (
                      <div key={caption.id} className="caption-card" style={{ border: 'none', padding: '0.5rem 0', background: 'transparent' }}>
                        {/* Rank medal */}
                        <div className="caption-rank" style={{
                          color: sortMode === 'top' && captionIdx === 0 ? '#D4A843'
                            : sortMode === 'top' && captionIdx === 1 ? '#A8A8A8'
                              : sortMode === 'top' && captionIdx === 2 ? '#CD7F32'
                                : 'var(--text-muted)',
                        }}>
                          {sortMode === 'top' && captionIdx < 3
                            ? ['🥇', '🥈', '🥉'][captionIdx]
                            : `#${captionIdx + 1}`}
                        </div>

                        <div className="caption-content">
                          <p className="caption-text">{caption.caption_text}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="caption-author">{caption.author_name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {formatTimeAgo(caption.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Vote buttons */}
                        <div className="caption-votes">
                          <button
                            className={`vote-btn upvote ${userVotes[caption.id] === 1 ? 'active' : ''}`}
                            onClick={() => handleVote(caption.id, 1)}
                            disabled={votingCaptionId === caption.id}
                            title="Upvote"
                          >
                            <span className="vote-icon">👍</span>
                            <span>{caption.upvotes}</span>
                          </button>

                          <div className={`vote-score ${getScoreClass(caption.net_score)}`}>
                            {caption.net_score > 0 ? '+' : ''}{caption.net_score}
                          </div>

                          <button
                            className={`vote-btn downvote ${userVotes[caption.id] === -1 ? 'active' : ''}`}
                            onClick={() => handleVote(caption.id, -1)}
                            disabled={votingCaptionId === caption.id}
                            title="Downvote"
                          >
                            <span className="vote-icon">👎</span>
                            <span>{caption.downvotes}</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* Show more/less toggle */}
                  {row.captions.length > 3 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpandedImage(expandedImage === row.id ? null : row.id)}
                      style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
                    >
                      {expandedImage === row.id
                        ? `Show less`
                        : `Show ${row.captions.length - 3} more caption${row.captions.length - 3 > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Fun stats footer */}
      <div style={{
        textAlign: 'center',
        marginTop: '4rem',
        padding: '2rem',
        color: 'var(--text-muted)',
        fontSize: '0.875rem',
      }} className="fade-in">
        <p>
          {rows.length} image{rows.length !== 1 ? 's' : ''} · {rows.reduce((acc, r) => acc + r.captions.length, 0)} captions · {Object.keys(userVotes).length} of your votes cast
        </p>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </main>
  );
}
