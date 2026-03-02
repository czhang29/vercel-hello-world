'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabaseBrowserClient';
import { runCaptionPipeline, isSupportedImageType } from '../../lib/captionApi';
import type { PipelineProgress, PipelineResult } from '../../lib/captionApi';
import Toast from '../../components/Toast';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
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

  const [toast, setToast] = useState({ message: '', visible: false });
  const showToast = (msg: string) => setToast({ message: msg, visible: true });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setUser(session.user);
      setAccessToken(session.access_token);
      setLoading(false);
    }
    checkAuth();
  }, [router]);

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
  }, []);

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
      const pipelineResult = await runCaptionPipeline(
        selectedFile,
        accessToken,
        (steps) => setPipelineSteps([...steps])
      );
      setResult(pipelineResult);
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

  return (
    <div className="upload-container">
      <div className="page-header fade-in">
        <h1 className="page-title">📸 Upload Image</h1>
        <p className="page-subtitle">
          Upload an image and our AI will generate hilarious captions for it.
        </p>
      </div>

      {/* Dropzone */}
      <div
        className={`upload-dropzone fade-in stagger-1 ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
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

      {/* Action buttons */}
      {selectedFile && !isProcessing && !result && (
        <div className="fade-in" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-primary" onClick={handleUploadAndCaption} style={{ padding: '0.75rem 2rem', fontSize: '0.9375rem' }}>
            🚀 Generate Captions
          </button>
          <button className="btn btn-ghost" onClick={handleReset}>
            Clear
          </button>
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