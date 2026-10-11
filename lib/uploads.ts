import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export function isImage(file: Pick<File, 'name' | 'type'>) {
  return (
    file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(file.name)
  );
}
export function isZip(file: Pick<File, 'name' | 'type'>) {
  return /\.zip$/i.test(file.name) || /^(application\/(zip|x-zip-compressed))$/i.test(file.type);
}

export type ZipProgress = { total: number; processed: number; skipped: number; errors: string[] };

// Use the central directory to account for every image, including ZIP64 and data descriptors.
export async function* zipImages(
  archive: File,
  onProgress?: (progress: ZipProgress) => void,
): AsyncGenerator<File> {
  const reader = new ZipReader(new BlobReader(archive), { useWebWorkers: false });
  try {
    const entries = (await reader.getEntries()).filter(
      (entry) =>
        !entry.directory &&
        !entry.filename.startsWith('__MACOSX/') &&
        !entry.filename.split('/').some((part) => part.startsWith('.')) &&
        isImage({ name: entry.filename, type: '' }),
    );
    const progress: ZipProgress = { total: entries.length, processed: 0, skipped: 0, errors: [] };
    onProgress?.({ ...progress });
    for (const entry of entries) {
      let file: File | undefined;
      try {
        if (entry.encrypted) throw new Error('Password-protected image');
        if (entry.uncompressedSize > MAX_IMAGE_BYTES)
          throw new Error('Exceeds the 50 MB per-image limit');
        const blob = await entry.getData!(new BlobWriter(), { checkSignature: true });
        file = new File([blob], `${archive.name}/${entry.filename}`, { type: blob.type });
      } catch (error) {
        progress.skipped++;
        progress.errors.push(
          `${entry.filename}: ${error instanceof Error ? error.message : 'could not extract image'}`,
        );
      }
      if (file) yield file;
      progress.processed++;
      onProgress?.({ ...progress, errors: [...progress.errors] });
    }
  } finally {
    await reader.close();
  }
}
