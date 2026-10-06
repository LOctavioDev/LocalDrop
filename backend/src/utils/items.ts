import fs from 'fs/promises';
import {
  SafePath,
  getItemInfo,
  isValidName,
  joinRel,
  resolveSafePath,
  uniqueName,
} from './fileUtils';
import { deleteThumbnails, filesUnder, moveThumbnails } from './thumbnails';
import { moveInOrder, pruneOrder } from './order';

/**
 * What to do when the destination name is already taken:
 * - undefined: refuse, so the client can ask the user
 * - "rename": keep both, picking "name (2)" etc. for the new one
 * - "replace": delete what's there first
 */
export type ConflictStrategy = 'rename' | 'replace' | undefined;

export function parseConflict(value: unknown): ConflictStrategy | null {
  if (value === undefined || value === '' || value === null) return undefined;
  if (value === 'rename' || value === 'replace') return value;
  return null;
}

export class ItemError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function statOrNull(fullPath: string) {
  return fs.stat(fullPath).catch(() => null);
}

/**
 * Deletes a file or folder (recursively) along with its cached thumbnails
 * and saved order entries.
 */
export async function deleteItem(item: SafePath): Promise<void> {
  const stats = await statOrNull(item.full);
  if (!stats) return;

  const files = await filesUnder(item.rel, stats.isDirectory());
  await fs.rm(item.full, { recursive: true, force: true });
  await deleteThumbnails(files);
  await pruneOrder(item.rel);
}

/**
 * Renames and/or moves the item at `fromRel` to `toDirRel/newName`,
 * resolving a name clash according to `conflict`. Used for both renaming
 * (same folder, new name) and moving (new folder, same name).
 */
export async function relocateItem(
  fromRel: unknown,
  toDirRel: unknown,
  newName: unknown,
  conflict: ConflictStrategy
) {
  const source = resolveSafePath(fromRel);
  if (!source || !source.rel) {
    throw new ItemError(400, 'Invalid item path');
  }
  const sourceStats = await statOrNull(source.full);
  if (!sourceStats) {
    throw new ItemError(404, 'Item not found');
  }

  const destDir = resolveSafePath(toDirRel);
  if (!destDir) {
    throw new ItemError(400, 'Invalid folder path');
  }
  if (!(await statOrNull(destDir.full))?.isDirectory()) {
    throw new ItemError(404, 'Folder not found');
  }

  if (typeof newName === 'string') newName = newName.trim();
  if (!isValidName(newName)) {
    throw new ItemError(400, 'Invalid name');
  }

  const isFolder = sourceStats.isDirectory();
  if (isFolder && (destDir.rel === source.rel || destDir.rel.startsWith(source.rel + '/'))) {
    throw new ItemError(400, 'Cannot move a folder into itself');
  }

  let name = newName;
  let target = resolveSafePath(joinRel(destDir.rel, name))!;
  if (target.rel === source.rel) {
    return getItemInfo(source.rel);
  }

  if (await statOrNull(target.full)) {
    if (conflict === undefined) {
      throw new ItemError(409, 'An item with that name already exists', {
        name,
        suggestedName: uniqueName(destDir.full, name, isFolder, source.full),
      });
    }
    if (conflict === 'rename') {
      name = uniqueName(destDir.full, name, isFolder, source.full);
      target = resolveSafePath(joinRel(destDir.rel, name))!;
      if (target.rel === source.rel) {
        return getItemInfo(source.rel);
      }
    } else {
      await deleteItem(target);
    }
  }

  const files = await filesUnder(source.rel, isFolder);
  await fs.rename(source.full, target.full);
  await moveThumbnails(files, source.rel, target.rel);
  await moveInOrder(source.rel, target.rel);

  return getItemInfo(target.rel);
}
