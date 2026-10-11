import { validNumbers, unresolved, type ScanImage } from './review';
// Queue identity is the retained image key, never a possibly repeated filename.
export function getPendingImages(
  images: ScanImage[],
  batch: string,
  mode: 'queued' | 'retry' | 'recheck' | 'missing' = 'queued',
) {
  return images.filter(
    (image) =>
      image.batch === batch &&
      (mode === 'missing'
        ? !validNumbers([image]).length &&
          (image.status === 'empty' ||
            image.status === 'failed' ||
            image.results.some((f) => f.category === 'review' && unresolved(f.reviewState)))
        : mode === 'recheck' ||
          image.status === 'queued' ||
          (mode === 'retry' && image.status === 'failed')),
  );
}
