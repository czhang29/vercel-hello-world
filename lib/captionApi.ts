// lib/captionApi.ts

const API_BASE = 'https://api.almostcrackd.ai';

const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
];

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_TYPES.includes(type);
}

export type PipelineProgress = {
  step: number; // 1-4
  status: 'pending' | 'active' | 'completed' | 'error';
  message: string;
};

export type PipelineResult = {
  captions: string[];
  imageId: string;
  cdnUrl: string;
};

/**
 * Runs the full 4-step caption pipeline.
 * Calls onProgress at each step so the UI can update.
 */
export async function runCaptionPipeline(
  file: File,
  accessToken: string,
  onProgress: (steps: PipelineProgress[]) => void
): Promise<PipelineResult> {
  const steps: PipelineProgress[] = [
    { step: 1, status: 'pending', message: 'Generating upload URL...' },
    { step: 2, status: 'pending', message: 'Uploading image...' },
    { step: 3, status: 'pending', message: 'Registering image...' },
    { step: 4, status: 'pending', message: 'Generating captions...' },
  ];

  const updateStep = (idx: number, status: PipelineProgress['status'], message?: string) => {
    steps[idx] = { ...steps[idx], status, message: message || steps[idx].message };
    onProgress([...steps]);
  };

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // Step 1: Generate presigned URL
    updateStep(0, 'active');
    const contentType = file.type || 'image/jpeg';

    const presignedRes = await fetch(`${API_BASE}/pipeline/generate-presigned-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ contentType }),
    });

    if (!presignedRes.ok) {
      const errText = await presignedRes.text();
      throw new Error(`Step 1 failed (${presignedRes.status}): ${errText}`);
    }

    const { presignedUrl, cdnUrl } = await presignedRes.json();
    updateStep(0, 'completed', 'Upload URL generated');

    // Step 2: Upload image bytes
    updateStep(1, 'active');
    const uploadRes = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`Step 2 failed (${uploadRes.status}): Upload to S3 failed`);
    }
    updateStep(1, 'completed', 'Image uploaded');

    // Step 3: Register image URL
    updateStep(2, 'active');
    const registerRes = await fetch(`${API_BASE}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageUrl: cdnUrl, isCommonUse: false }),
    });

    if (!registerRes.ok) {
      const errText = await registerRes.text();
      throw new Error(`Step 3 failed (${registerRes.status}): ${errText}`);
    }

    const { imageId } = await registerRes.json();
    updateStep(2, 'completed', 'Image registered');

    // Step 4: Generate captions
    updateStep(3, 'active', 'Generating captions (this may take a moment)...');
    const captionRes = await fetch(`${API_BASE}/pipeline/generate-captions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageId }),
    });

    if (!captionRes.ok) {
      const errText = await captionRes.text();
      throw new Error(`Step 4 failed (${captionRes.status}): ${errText}`);
    }

    const captionData = await captionRes.json();
    updateStep(3, 'completed', 'Captions generated!');

    // Extract captions — the API may return them in various formats
    let captions: string[] = [];
    if (Array.isArray(captionData.captions)) {
      captions = captionData.captions.map((c: any) =>
        typeof c === 'string' ? c : c.content || c.text || c.caption || JSON.stringify(c)
      );
    } else if (Array.isArray(captionData)) {
      captions = captionData.map((c: any) =>
        typeof c === 'string' ? c : c.content || c.text || c.caption || JSON.stringify(c)
      );
    } else if (captionData.content) {
      captions = [captionData.content];
    }

    return { captions, imageId, cdnUrl };
  } catch (err: any) {
    // Mark the current active step as error
    const activeIdx = steps.findIndex((s) => s.status === 'active');
    if (activeIdx >= 0) {
      updateStep(activeIdx, 'error', err.message || 'Something went wrong');
    }
    throw err;
  }
}