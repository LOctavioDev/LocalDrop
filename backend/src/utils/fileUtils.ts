import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Overridable via STORAGE_DIR so tests can point this at an isolated
// temp directory instead of the real production storage folder.
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, '../../storage');

const MAX_NAME_BYTES = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Whether `name` is usable as-is for a single file or folder inside
 * storage. Names starting with "." are reserved for internal data
 * (.thumbnails, .order.json, in-progress uploads), so they're rejected too.
 */
export function isValidName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name === name.trim() &&
    !name.startsWith('.') &&
    !/[/\\]/.test(name) &&
    !CONTROL_CHARS.test(name) &&
    Buffer.byteLength(name, 'utf8') <= MAX_NAME_BYTES
  );
}

/**
 * Turns an arbitrary user-supplied name (e.g. an uploaded file's original
 * name) into a valid one: strips path separators, control characters and
 * leading dots, and falls back to `fallback` if nothing is left.
 */
export function sanitizeName(name: string, fallback = 'unnamed-file'): string {
  let sanitized = name
    .replace(/[/\\]/g, '')
    .replace(new RegExp(CONTROL_CHARS.source, 'g'), '')
    .trim()
    .replace(/^\.+/, '')
    .trim();

  // Trim to the byte limit without splitting a multi-byte character
  while (Buffer.byteLength(sanitized, 'utf8') > MAX_NAME_BYTES) {
    sanitized = Array.from(sanitized).slice(0, -1).join('');
  }

  return sanitized || fallback;
}

export interface SafePath {
  /** Normalized path relative to storage ("" for the root), "/"-separated */
  rel: string;
  /** Absolute path on disk */
  full: string;
}

/**
 * Resolves a "/"-separated path relative to storage, rejecting anything
 * that could escape it (".." segments, backslashes, hidden segments, etc).
 * Returns null for invalid input. An empty string resolves to the root.
 */
export function resolveSafePath(relPath: unknown): SafePath | null {
  if (relPath === undefined || relPath === null) relPath = '';
  if (typeof relPath !== 'string') return null;

  const segments = relPath.split('/').filter((segment) => segment !== '');
  if (!segments.every(isValidName)) return null;

  const root = path.resolve(STORAGE_DIR);
  const full = path.resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) return null;

  return { rel: segments.join('/'), full };
}

export function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function parentRel(rel: string): string {
  const index = rel.lastIndexOf('/');
  return index === -1 ? '' : rel.slice(0, index);
}

export function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1);
}

/**
 * Returns `name` if it's free inside `dirFull`, otherwise the first free
 * "name (2).ext", "name (3).ext", ... — the same scheme macOS uses.
 * Folders don't get their "extension" split off. `freeing` is a path about
 * to be vacated (the item being renamed), so it counts as free.
 */
export function uniqueName(dirFull: string, name: string, isFolder = false, freeing?: string): string {
  const isTaken = (candidate: string) => {
    const candidatePath = path.join(dirFull, candidate);
    return candidatePath !== freeing && existsSync(candidatePath);
  };

  if (!isTaken(name)) return name;

  const ext = isFolder ? '' : path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;

  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!isTaken(candidate)) return candidate;
  }
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

export interface FileInfo {
  type: 'file';
  name: string;
  path: string;
  size: number;
  uploadedAt: Date;
}

export interface FolderInfo {
  type: 'folder';
  name: string;
  path: string;
  itemCount: number;
  uploadedAt: Date;
}

export type ItemInfo = FileInfo | FolderInfo;

function isVisible(name: string): boolean {
  return !name.startsWith('.');
}

/**
 * Gets the listing info for one file or folder, by relative path.
 */
export async function getItemInfo(rel: string): Promise<ItemInfo> {
  const safe = resolveSafePath(rel);
  if (!safe || !safe.rel) {
    throw new Error('Invalid item path');
  }

  const stats = await fs.stat(safe.full);
  const name = baseName(safe.rel);

  if (stats.isDirectory()) {
    const entries = await fs.readdir(safe.full);
    return {
      type: 'folder',
      name,
      path: safe.rel,
      itemCount: entries.filter(isVisible).length,
      uploadedAt: stats.mtime,
    };
  }

  return {
    type: 'file',
    name,
    path: safe.rel,
    size: stats.size,
    uploadedAt: stats.mtime,
  };
}

/**
 * Lists the visible files and folders directly inside `dirRel`.
 */
export async function listDir(dirRel: string): Promise<ItemInfo[]> {
  const safe = resolveSafePath(dirRel);
  if (!safe) throw new Error('Invalid folder path');

  const entries = (await fs.readdir(safe.full)).filter(isVisible);

  const items = await Promise.all(
    entries.map(async (name) => {
      try {
        return await getItemInfo(joinRel(safe.rel, name));
      } catch (error) {
        // Skips names that aren't valid any more (e.g. created outside the
        // app) and entries that vanished mid-listing
        return null;
      }
    })
  );

  return items.filter((item): item is ItemInfo => item !== null);
}

/**
 * Recursively walks the visible tree under `dirRel`, yielding every file
 * and folder (not including `dirRel` itself) as relative paths.
 */
export async function* walk(
  dirRel: string
): AsyncGenerator<{ rel: string; isFolder: boolean }> {
  const safe = resolveSafePath(dirRel);
  if (!safe) return;

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(safe.full, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!isValidName(entry.name)) continue;
    const rel = joinRel(safe.rel, entry.name);
    if (entry.isDirectory()) {
      yield { rel, isFolder: true };
      yield* walk(rel);
    } else if (entry.isFile()) {
      yield { rel, isFolder: false };
    }
  }
}
