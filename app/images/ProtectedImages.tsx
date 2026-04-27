'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';
import Toast from '../../components/Toast';
import type { User } from '@supabase/supabase-js';

type Caption = {
  id: string;
  content: string;
  created_datetime_utc: string;
  author_name: string;
  profile_id: string;
  upvotes: number;
  downvotes: number;
  net_score: number;
};

type ImageRow = {
  id: string;
  url: string | null;
  image_description?: string | null;
  created_datetime_utc?: string;
  captions: Caption[];
};

type SortMode = 'top' | 'new' | 'controversial';

const PAGE_SIZE = 200;

export default function ProtectedImages() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, { voteValue: number; voteRowId: number }>>({});
  const [votingCaptionId, setVotingCaptionId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('top');
  const [toast, setToast] = useState({ message: '', visible: false });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const profileIdRef = useRef<string | null>(null);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
  };

  // Helper to fetch a page of images and enrich with vote data
  const fetchPage = useCallback(async (pageOffset: number, currentProfileId: string) => {
    const supabase = createSupabaseBrowserClient();

    const { data: images, error: imgError } = await supabase
      .from('images')
      .select(`
        id, url, image_description, created_datetime_utc,
        captions (
          id, content, created_datetime_utc, profile_id,
          profiles!captions_profile_id_fkey ( first_name, last_name )
        )
      `)
      .order('created_datetime_utc', { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);

    if (imgError) throw new Error(imgError.message);
    if (!images || images.length === 0) return { enrichedImages: [], myVotesMap: {}, batchSize: 0 };

    const allCaptionIds = images.flatMap((img: any) =>
      (img.captions || []).map((c: any) => c.id)
    );

    let captionVoteCounts: Record<string, { upvotes: number; downvotes: number }> = {};
    let myVotesMap: Record<string, { voteValue: number; voteRowId: number }> = {};

    if (allCaptionIds.length > 0) {
      // Chunk the IN query — URLs over ~8KB get rejected
      const CHUNK = 200;

      for (let i = 0; i < allCaptionIds.length; i += CHUNK) {
        const chunk = allCaptionIds.slice(i, i + CHUNK);

        const { data: votes } = await supabase
          .from('caption_votes')
          .select('caption_id, vote_value')
          .in('caption_id', chunk);

        if (votes) {
          for (const v of votes) {
            if (!captionVoteCounts[v.caption_id]) {
              captionVoteCounts[v.caption_id] = { upvotes: 0, downvotes: 0 };
            }
            if (v.vote_value > 0) captionVoteCounts[v.caption_id].upvotes++;
            else if (v.vote_value < 0) captionVoteCounts[v.caption_id].downvotes++;
          }
        }

        const { data: myVotes } = await supabase
          .from('caption_votes')
          .select('id, caption_id, vote_value')
          .eq('profile_id', currentProfileId)
          .in('caption_id', chunk);

        if (myVotes) {
          for (const v of myVotes) {
            myVotesMap[v.caption_id] = { voteValue: v.vote_value, voteRowId: v.id };
          }
        }
      }
    }

    const enrichedImages = images.map((img: any) => ({
      ...img,
      captions: (img.captions || []).map((c: any) => {
        const profile = c.profiles as any;
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        return {
          id: c.id,
          content: c.content || '',
          created_datetime_utc: c.created_datetime_utc,
          author_name: (firstName + ' ' + lastName).trim() || 'Anonymous',
          profile_id: c.profile_id,
          upvotes: captionVoteCounts[c.id]?.upvotes || 0,
          downvotes: captionVoteCounts[c.id]?.downvotes || 0,
          net_score: (captionVoteCounts[c.id]?.upvotes || 0) - (captionVoteCounts[c.id]?.downvotes || 0),
        };
      }),
    }));

    return { enrichedImages, myVotesMap, batchSize: images.length };
  }, []);

  // Initial load
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function init() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) { setError(sessionError.message); setLoading(false); return; }
      if (!session) { router.replace('/login'); return; }

      setUser(session.user);
      const currentProfileId = session.user.id;
      setProfileId(currentProfileId);
      profileIdRef.current = currentProfileId;

      try {
        const { enrichedImages, myVotesMap, batchSize } = await fetchPage(0, currentProfileId);
        setRows(enrichedImages);
        setUserVotes(myVotesMap);
        const more = (batchSize ?? 0) >= PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load images');
        setLoading(false);
      }
    }

    init();
  }, [router, fetchPage]);

  // Load more handler
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !profileIdRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const currentLength = rows?.length ?? 0;
      const { enrichedImages, myVotesMap, batchSize } = await fetchPage(currentLength, profileIdRef.current);

      setRows((prev) => [...(prev ?? []), ...enrichedImages]);
      setUserVotes((prev) => ({ ...prev, ...myVotesMap }));

      const more = (batchSize ?? 0) >= PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch (err: any) {
      console.error('Load more error:', err);
      showToast('Failed to load more images');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [rows, fetchPage]);

  // IntersectionObserver to trigger load more when sentinel is visible
  useEffect(() => {
    if (!sentinelRef.current || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [loading, loadMore]);

  const handleVote = useCallback(async (captionId: string, voteValue: number) => {
    if (!user || !profileId) {
      router.push('/login');
      return;
    }

    setVotingCaptionId(captionId);
    const supabase = createSupabaseBrowserClient();
    const existingVote = userVotes[captionId];

    try {
      if (existingVote && existingVote.voteValue === voteValue) {
        const { error } = await supabase
          .from('caption_votes')
          .delete()
          .eq('id', existingVote.voteRowId);

        if (error) throw error;

        setUserVotes((prev) => {
          const next = { ...prev };
          delete next[captionId];
          return next;
        });

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
      } else if (existingVote) {
        const { error } = await supabase
          .from('caption_votes')
          .update({
            vote_value: voteValue,
            modified_by_user_id: profileId,
          })
          .eq('id', existingVote.voteRowId);

        if (error) throw error;

        const previousVote = existingVote.voteValue;

        setUserVotes((prev) => ({
          ...prev,
          [captionId]: { ...prev[captionId], voteValue },
        }));

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
      } else {
        const { data: inserted, error } = await supabase
          .from('caption_votes')
          .insert({
            caption_id: captionId,
            profile_id: profileId,
            vote_value: voteValue,
            created_by_user_id: profileId,
            modified_by_user_id: profileId,
          })
          .select('id')
          .single();

        if (error) throw error;

        setUserVotes((prev) => ({
          ...prev,
          [captionId]: { voteValue, voteRowId: inserted.id },
        }));

        setRows((prev) =>
          prev?.map((img) => ({
            ...img,
            captions: img.captions.map((c) => {
              if (c.id !== captionId) return c;
              return {
                ...c,
                upvotes: c.upvotes + (voteValue > 0 ? 1 : 0),
                downvotes: c.downvotes + (voteValue < 0 ? 1 : 0),
                net_score: c.net_score + voteValue,
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
  }, [user, profileId, userVotes, router]);

  const sortCaptions = (captions: Caption[]): Caption[] => {
    const sorted = [...captions];
    switch (sortMode) {
      case 'top':
        return sorted.sort((a, b) => b.net_score - a.net_score);
      case 'new':
        return sorted.sort((a, b) => new Date(b.created_datetime_utc).getTime() - new Date(a.created_datetime_utc).getTime());
      case 'controversial':
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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

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
        {[...rows].sort((a, b) => {
          if (sortMode === 'new') {
            return new Date(b.created_datetime_utc || 0).getTime() - new Date(a.created_datetime_utc || 0).getTime();
          }
          if (sortMode === 'top') {
            const aTop = Math.max(0, ...a.captions.map(c => c.net_score));
            const bTop = Math.max(0, ...b.captions.map(c => c.net_score));
            return bTop - aTop;
          }
          if (sortMode === 'controversial') {
            const aTotal = a.captions.reduce((sum, c) => sum + c.upvotes + c.downvotes, 0);
            const bTotal = b.captions.reduce((sum, c) => sum + c.upvotes + c.downvotes, 0);
            return bTotal - aTotal;
          }
          return 0;
        }).map((row, idx) => (
          <div
            key={row.id}
            className={`card fade-in stagger-${Math.min(idx + 1, 6)}`}
          >
            {row.url && (
              <div className="card-image-wrapper">
                <img src={row.url} alt={row.image_description || 'Humor image'} />
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
                          <p className="caption-text">{caption.content}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="caption-author">{caption.author_name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {formatTimeAgo(caption.created_datetime_utc)}
                            </span>
                          </div>
                        </div>

                        <div className="caption-votes">
                          <button
                            className={`vote-btn upvote ${userVotes[caption.id]?.voteValue === 1 ? 'active' : ''}`}
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
                            className={`vote-btn downvote ${userVotes[caption.id]?.voteValue === -1 ? 'active' : ''}`}
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

      {/* Sentinel + loading indicator */}
      <div ref={sentinelRef} style={{ minHeight: '60px', marginTop: '2rem' }}>
        {loadingMore && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '2rem 1rem',
          }}>
            <div className="step-spinner" style={{ width: '28px', height: '28px' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Loading more images…
            </p>
          </div>
        )}
        {!hasMore && rows.length > 0 && (
          <div style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: 'var(--text-muted)',
            fontSize: '0.875rem',
          }}>
            🎉 You've reached the end!
          </div>
        )}
      </div>

      <div style={{
        textAlign: 'center',
        marginTop: '2rem',
        padding: '1rem',
        color: 'var(--text-muted)',
        fontSize: '0.875rem',
      }} className="fade-in">
        <p>
          {rows.length} image{rows.length !== 1 ? 's' : ''} loaded · {rows.reduce((acc, r) => acc + r.captions.length, 0)} captions · {Object.keys(userVotes).length} of your votes cast
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