import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import sharp from 'sharp';
import { STORAGE_DIR } from './fileUtils';

export const THUMBS_DIR = path.join(STORAGE_DIR, '.thumbnails');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif',
]);
const PDF_EXTENSIONS = new Set(['.pdf']);

const THUMBNAIL_SIZE = 200;

export type FileKind = 'image' | 'pdf' | 'other';

export function getFileKind(filename: string): FileKind {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  return 'other';
}

async function ensureThumbsDir(): Promise<void> {
  await fs.mkdir(THUMBS_DIR, { recursive: true });
}

async function generateImageThumbnail(sourcePath: string, destPath: string): Promise<void> {
  await sharp(sourcePath)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toFile(destPath);
}

// Renders the first page of a PDF via poppler-utils' pdftoppm, then
// resizes it the same way as image thumbnails. Requires the `poppler-utils`
// system package (not an npm dependency) — if it's missing this throws
// and the caller falls back to no thumbnail.
async function generatePdfThumbnail(sourcePath: string, destPath: string): Promise<void> {
  const rawPath = `${destPath}.raw`;
  await new Promise<void>((resolve, reject) => {
    execFile(
      'pdftoppm',
      ['-jpeg', '-f', '1', '-l', '1', '-scale-to', String(THUMBNAIL_SIZE * 2), sourcePath, rawPath],
      (error) => (error ? reject(error) : resolve())
    );
  });

  // pdftoppm appends "-1" (first page) plus its own extension to the prefix we gave it
  const rendered = `${rawPath}-1.jpg`;
  try {
    await sharp(rendered)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', background: '#fff' })
      .jpeg({ quality: 70 })
      .toFile(destPath);
  } finally {
    await fs.unlink(rendered).catch(() => {});
  }
}

let pdftoppmAvailable = true;

function thumbnailPathFor(filename: string): string {
  return path.join(THUMBS_DIR, `${filename}.jpg`);
}

/**
 * Returns the path to a cached thumbnail for `filename`, generating and
 * caching it first if needed. Returns null if the file type isn't
 * supported, or if generation fails (e.g. corrupt file, missing
 * poppler-utils for PDFs) — callers should treat that as "no thumbnail".
 */
export async function getOrCreateThumbnail(
  filename: string,
  sourcePath: string
): Promise<string | null> {
  const kind = getFileKind(filename);
  if (kind === 'other') return null;

  if (kind === 'pdf' && !pdftoppmAvailable) return null;

  const thumbPath = thumbnailPathFor(filename);

  const [sourceStat, thumbStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(thumbPath).catch(() => null),
  ]);

  if (thumbStat && thumbStat.mtimeMs >= sourceStat.mtimeMs) {
    return thumbPath;
  }

  await ensureThumbsDir();

  try {
    if (kind === 'image') {
      await generateImageThumbnail(sourcePath, thumbPath);
    } else {
      await generatePdfThumbnail(sourcePath, thumbPath);
    }
    return thumbPath;
  } catch (error) {
    if (kind === 'pdf' && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      pdftoppmAvailable = false;
      console.warn(
        'pdftoppm not found — PDF thumbnails disabled. Install the "poppler-utils" system package to enable them.'
      );
    } else {
      console.error(`Failed to generate thumbnail for ${filename}:`, error);
    }
    await fs.unlink(thumbPath).catch(() => {});
    return null;
  }
}

export async function deleteThumbnail(filename: string): Promise<void> {
  const thumbPath = thumbnailPathFor(filename);
  if (existsSync(thumbPath)) {
    await fs.unlink(thumbPath).catch(() => {});
  }
}
