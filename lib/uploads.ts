import { Unzip, UnzipInflate } from 'fflate';

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export function isImage(file: Pick<File, 'name' | 'type'>) {
  return (
    file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(file.name)
  );
}
export function isZip(file: Pick<File, 'name' | 'type'>) {
  return /\.zip$/i.test(file.name) || /^(application\/(zip|x-zip-compressed))$/i.test(file.type);
}

// Read small compressed chunks; only retain decompressed images until the caller saves them.
export async function* zipImages(archive: File): AsyncGenerator<File> {
  let pending: File[] = [];
  let failure: Error | undefined;
  let entries = 0;
  const unzip = new Unzip((entry) => {
    entries++;
    if (
      entry.name.endsWith('/') ||
      entry.name.split('/').some((part) => part.startsWith('.')) ||
      entry.name.startsWith('__MACOSX/') ||
      !isImage({ name: entry.name, type: '' })
    )
      return;
    if ((entry.originalSize ?? 0) > MAX_IMAGE_BYTES) {
      failure = new Error(`${entry.name} exceeds the 50 MB per-image limit`);
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    entry.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      size += data.length;
      if (size > MAX_IMAGE_BYTES) {
        failure = new Error(`${entry.name} exceeds the 50 MB per-image limit`);
        entry.terminate();
        return;
      }
      chunks.push(data);
      if (final) {
        pending.push(new File(chunks as BlobPart[], `${archive.name}/${entry.name}`));
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < archive.size; offset += 64 * 1024) {
    const bytes = new Uint8Array(await archive.slice(offset, offset + 64 * 1024).arrayBuffer());
    unzip.push(bytes, offset + bytes.length === archive.size);
    for (const file of pending) yield file;
    pending = [];
    if (failure) throw failure;
  }
  if (!entries) throw new Error('The ZIP is empty or cannot be read');
}
