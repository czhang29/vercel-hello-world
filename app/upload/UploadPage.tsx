'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';
import { runCaptionPipeline, isSupportedImageType } from '../../lib/captionApi';
import type { PipelineProgress, PipelineResult, HumorFlavor } from '../../lib/captionApi';
import Toast from '../../components/Toast';
import Link from 'next/link';

// Default option: lets the system pick a humor mix
const DEFAULT_FLAVOR_OPTION: HumorFlavor = {
  id: 0,
  slug: 'default-mix',
  description: "A balanced mix of styles chosen by our system. Best when you're not sure what flavor you want.",
};

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Pipeline state
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineProgress[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Assignment 10: humor flavor picker (addresses Users 1 & 2 finding —
  // they had no idea what each flavor would produce)
  const [flavors, setFlavors] = useState<HumorFlavor[]>([DEFAULT_FLAVOR_OPTION]);
  const [flavorsLoading, setFlavorsLoading] = useState(true);
  const [selectedFlavorId, setSelectedFlavorId] = useState<number>(0); // 0 = default

  const [toast, setToast] = useState({ message: '', visible: false });
  const showToast = useCallback((msg: string) => setToast({ message: msg, visible: true }), []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setAuthReady(true);
      setAccessToken(session.access_token);
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  // Assignment 10: Load humor flavors from Supabase so users can pick a
  // style and SEE what each one does before generating.
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    async function loadFlavors() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from('humor_flavors')
          .select('id, slug, description')
          .order('is_pinned', { ascending: false })
          .order('id', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error('Failed to load humor flavors:', error);
          // Keep default option only — don't block upload flow
          setFlavorsLoading(false);
          return;
        }

        const allFlavors: HumorFlavor[] = [DEFAULT_FLAVOR_OPTION];
        if (data) {
          for (const f of data) {
            allFlavors.push({
              id: f.id,
              slug: f.slug,
              description: f.description,
            });
          }
        }
        setFlavors(allFlavors);
      } catch (err) {
        console.error('Flavors fetch error:', err);
      } finally {
        if (!cancelled) setFlavorsLoading(false);
      }
    }
    loadFlavors();
    return () => { cancelled = true; };
  }, [authReady]);

  const handleFileSelect = useCallback((file: File) => {
    if (!isSupportedImageType(file.type)) {
      showToast('Unsupported file type. Use JPEG, PNG, WebP, GIF, or HEIC.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('File too large. Max 20MB.');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setPipelineSteps([]);
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleUploadAndCaption = async () => {
    if (!selectedFile || !accessToken) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const flavorIdForApi = selectedFlavorId > 0 ? selectedFlavorId : null;
      const pipelineResult = await runCaptionPipeline(
        selectedFile,
        accessToken,
        (steps) => setPipelineSteps([...steps]),
        flavorIdForApi
      );
      setResult(pipelineResult);
      // Clear progress steps so they don't visually duplicate the result
      setPipelineSteps([]);
      showToast('Captions generated successfully! 🎉');
    } catch (err: any) {
      setError(err.message || 'Pipeline failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setPipelineSteps([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="upload-container">
        <div className="page-header">
          <div className="skeleton" style={{ width: '180px', height: '36px', margin: '0 auto 0.75rem' }} />
          <div className="skeleton" style={{ width: '280px', height: '20px', margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  const selectedFlavor = flavors.find((f) => f.id === selectedFlavorId) ?? DEFAULT_FLAVOR_OPTION;
  const friendlyFlavorName = (slug: string) =>
    slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="upload-container">
      <div className="page-header fade-in">
        <h1 className="page-title">📸 Upload Image</h1>
        <p className="page-subtitle">
          Pick a humor style, drop in an image, and our AI will write hilarious captions for you.
        </p>
      </div>

      {/* Dropzone */}
      <div
        className={`upload-dropzone fade-in stagger-1 ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-disabled={isProcessing}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
          onChange={handleInputChange}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />

        {previewUrl ? (
          <>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
            <p style={{ fontWeight: 600, color: 'var(--success)', marginBottom: '0.25rem' }}>
              {selectedFile?.name}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {((selectedFile?.size || 0) / 1024 / 1024).toFixed(1)} MB · Click or drag to change
            </p>
            <div className="upload-preview">
              <img src={previewUrl} alt="Preview" />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem', opacity: 0.7 }}>📁</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Drop your image here or click to browse
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              JPEG, PNG, WebP, GIF, or HEIC · Max 20MB
            </p>
          </>
        )}
      </div>

      {/* Assignment 10: Humor Flavor Selector — addresses User 1 & 2's
          finding that flavor names told them nothing. Each flavor's
          description (from humor_flavors.description) is now visible. */}
      {selectedFile && !isProcessing && !result && (
        <div className="flavor-selector fade-in">
          <label className="flavor-selector-label">
            🎨 Pick a humor style
            <span className="label-hint"> · what kind of caption should the AI write?</span>
          </label>

          {flavorsLoading ? (
            <div className="flavor-options">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton flavor-skeleton" />
              ))}
            </div>
          ) : (
            <div className="flavor-options" role="radiogroup" aria-label="Humor flavor">
              {flavors.map((f) => {
                const isSelected = selectedFlavorId === f.id;
                const isDefault = f.id === 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`flavor-option ${isSelected ? 'selected' : ''} ${isDefault ? 'default-option' : ''}`}
                    onClick={() => setSelectedFlavorId(f.id)}
                  >
                    <span className="flavor-option-name">
                      {isDefault ? '✨ Default mix' : friendlyFlavorName(f.slug)}
                    </span>
                    {f.description && (
                      <span className="flavor-option-desc">{f.description}</span>
                    )}
                    {!f.description && !isDefault && (
                      <span className="flavor-option-desc" style={{ fontStyle: 'italic' }}>
                        {f.slug} style
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Assignment 10: STICKY action bar — addresses User 1's finding that
          on a 13" MacBook the Generate button got pushed below the fold */}
      {selectedFile && !isProcessing && !result && (
        <div className="upload-actions-sticky fade-in">
          <button
            className="btn btn-primary"
            onClick={handleUploadAndCaption}
            style={{ padding: '0.75rem 2rem', fontSize: '0.9375rem' }}
          >
            🚀 Generate Captions
            {selectedFlavorId > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.85, fontSize: '0.8125rem' }}>
                · {friendlyFlavorName(selectedFlavor.slug)}
              </span>
            )}
          </button>
          <button className="btn btn-ghost" onClick={handleReset}>
            Clear
          </button>
        </div>
      )}

      {/* Assignment 10: Prominent generating banner — addresses universal
          "is it frozen?" finding during 10–20s caption generation */}
      {isProcessing && (
        <div className="generating-banner">
          <div className="generating-banner-spinner" aria-hidden="true" />
          <div className="generating-banner-text">
            <div className="generating-banner-title">Working on your captions</div>
            <div className="generating-banner-subtitle">
              This usually takes 10–20 seconds. The AI is uploading your image and writing
              {selectedFlavorId > 0
                ? ` "${friendlyFlavorName(selectedFlavor.slug)}" style captions`
                : ' a few caption options'}.
              Please don&apos;t close this page.
            </div>
          </div>
        </div>
      )}

      {/* Progress steps */}
      {pipelineSteps.length > 0 && (
        <div className="upload-progress fade-in">
          <div className="progress-steps">
            {pipelineSteps.map((step, i) => (
              <div key={i} className={`progress-step ${step.status}`}>
                <div className="step-icon">
                  {step.status === 'completed' && '✅'}
                  {step.status === 'active' && <div className="step-spinner" />}
                  {step.status === 'error' && '❌'}
                  {step.status === 'pending' && <span style={{ opacity: 0.4 }}>⬜</span>}
                </div>
                <span>{step.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="fade-in" style={{
          marginTop: '1.5rem', padding: '1rem 1.25rem',
          background: 'var(--danger-light)', border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-lg)', color: 'var(--danger)', fontSize: '0.875rem',
        }}>
          <strong>Error:</strong> {error}
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={handleReset}>Try Again</button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="captions-result fade-in">
          <div className="captions-result-header">
            <span style={{ fontSize: '1.25rem' }}>🎉</span>
            <h3>Generated Captions</h3>
            {selectedFlavorId > 0 && (
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
              }}>
                {selectedFlavor.slug}
              </span>
            )}
          </div>
          <div className="captions-result-body">
            {result.captions.length > 0 ? (
              result.captions.map((caption, i) => (
                <div key={i} className="generated-caption">
                  <span className="caption-index">{i + 1}</span>
                  {caption}
                </div>
              ))
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Captions were generated but the response format was unexpected. Check the gallery for results.
              </div>
            )}
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link href="/images" className="btn btn-primary btn-sm">
              🖼️ View Gallery
            </Link>
            <button className="btn btn-secondary btn-sm" onClick={handleReset}>
              📸 Upload Another
            </button>
          </div>
        </div>
      )}

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast({ ...toast, visible: false })} />
    </div>
  );
}
