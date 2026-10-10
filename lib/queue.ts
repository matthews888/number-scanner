import type { ScanImage } from './review';
// Queue identity is the retained image key, never a possibly repeated filename.
export function getPendingImages(
  images: ScanImage[],
  batch: string,
  mode: 'queued' | 'retry' | 'recheck' = 'queued',
) {
  return images.filter(
    (image) =>
      image.batch === batch &&
      (mode === 'recheck' ||
        image.status === 'queued' ||
        (mode === 'retry' && image.status === 'failed')),
  );
}
