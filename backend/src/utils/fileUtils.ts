import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Overridable via STORAGE_DIR so tests can point this at an isolated
// temp directory instead of the real production storage folder.
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, '../../storage');

/**
 * Sanitizes a filename to prevent path traversal attacks
 * Removes any directory separators and special characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and parent directory references
  let sanitized = filename.replace(/[/\\]/g, '');
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove any null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // If empty after sanitization, use a default name
  if (!sanitized) {
    sanitized = 'unnamed-file';
  }

  return sanitized;
}

/**
 * Generates a unique filename if the file already exists
 * Adds a timestamp to prevent overwrites
 */
export async function getUniqueFilename(filename: string): Promise<string> {
  const sanitized = sanitizeFilename(filename);
  const filePath = path.join(STORAGE_DIR, sanitized);

  // If file doesn't exist, use the original name
  if (!existsSync(filePath)) {
    return sanitized;
  }

  // File exists, add timestamp
  const ext = path.extname(sanitized);
  const nameWithoutExt = path.basename(sanitized, ext);
  const timestamp = Date.now();

  return `${nameWithoutExt}-${timestamp}${ext}`;
}

/**
 * Validates that a filename is safe and within the storage directory
 */
export function validateFilePath(filename: string): { valid: boolean; fullPath: string } {
  const sanitized = sanitizeFilename(filename);
  const fullPath = path.resolve(STORAGE_DIR, sanitized);
  const storageDir = path.resolve(STORAGE_DIR);

  // Ensure the resolved path is within the storage directory
  const valid = fullPath.startsWith(storageDir + path.sep) || fullPath === storageDir;

  return { valid, fullPath };
}

/**
 * Ensures the storage directory exists
 */
export async function ensureStorageDir(): Promise<void> {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    console.log(`Created storage directory: ${STORAGE_DIR}`);
  }
}

/**
 * Gets file information including size and modification date
 */
export async function getFileInfo(filename: string) {
  const { valid, fullPath } = validateFilePath(filename);

  if (!valid) {
    throw new Error('Invalid file path');
  }

  const stats = await fs.stat(fullPath);

  return {
    name: filename,
    size: stats.size,
    uploadedAt: stats.mtime,
  };
}
