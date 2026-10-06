import fs from 'fs/promises';
import path from 'path';
import { STORAGE_DIR, baseName, parentRel } from './fileUtils';

const ORDER_FILE = path.join(STORAGE_DIR, '.order.json');

/**
 * Manual order of the items in each folder, keyed by the folder's relative
 * path ("" is the root). Each list holds item names (files and folders).
 */
type OrderMap = Record<string, string[]>;

/**
 * Reads the saved manual orders. Not critical data (just a UI preference),
 * so any missing/corrupt file quietly resolves to {}. A plain array is the
 * pre-folders format and is taken as the root folder's order.
 */
async function readOrderMap(): Promise<OrderMap> {
  try {
    const parsed = JSON.parse(await fs.readFile(ORDER_FILE, 'utf-8'));
    if (Array.isArray(parsed)) {
      return { '': parsed.filter((entry): entry is string => typeof entry === 'string') };
    }
    if (!parsed || typeof parsed !== 'object') return {};

    const map: OrderMap = {};
    for (const [dir, names] of Object.entries(parsed)) {
      if (Array.isArray(names)) {
        map[dir] = names.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function writeOrderMap(map: OrderMap): Promise<void> {
  await fs.writeFile(ORDER_FILE, JSON.stringify(map), 'utf-8');
}

// Serializes read-modify-write cycles so concurrent requests (e.g. several
// devices on the LAN) can't clobber each other's changes.
let queue: Promise<unknown> = Promise.resolve();

function updateOrderMap(mutate: (map: OrderMap) => boolean): Promise<void> {
  const run = queue.then(async () => {
    const map = await readOrderMap();
    if (mutate(map)) {
      await writeOrderMap(map);
    }
  });
  queue = run.catch(() => {});
  return run;
}

function isSameOrInside(dir: string, folderRel: string): boolean {
  return dir === folderRel || dir.startsWith(folderRel + '/');
}

export async function readOrder(dir: string): Promise<string[]> {
  await queue;
  return (await readOrderMap())[dir] ?? [];
}

export function writeOrder(dir: string, order: string[]): Promise<void> {
  return updateOrderMap((map) => {
    if (order.length === 0) {
      delete map[dir];
    } else {
      map[dir] = order;
    }
    return true;
  });
}

/**
 * Removes an item from its folder's saved order, e.g. after it's deleted.
 * For folders, the saved orders of everything inside it go too.
 */
export function pruneOrder(rel: string): Promise<void> {
  return updateOrderMap((map) => {
    let changed = false;
    const dir = parentRel(rel);
    const name = baseName(rel);

    if (map[dir]?.includes(name)) {
      map[dir] = map[dir].filter((entry) => entry !== name);
      changed = true;
    }

    for (const key of Object.keys(map)) {
      if (isSameOrInside(key, rel)) {
        delete map[key];
        changed = true;
      }
    }
    return changed;
  });
}

/**
 * Updates saved orders after an item is renamed or moved from `fromRel` to
 * `toRel`: a rename keeps its position, a move drops it from the old folder
 * (it lands at the end of the new one), and a folder carries the saved
 * orders of everything inside it along.
 */
export function moveInOrder(fromRel: string, toRel: string): Promise<void> {
  return updateOrderMap((map) => {
    let changed = false;
    const fromDir = parentRel(fromRel);
    const toDir = parentRel(toRel);
    const fromName = baseName(fromRel);
    const toName = baseName(toRel);

    // Whatever was at the destination before (if replaced) loses its spot
    if (map[toDir]?.includes(toName) && fromRel !== toRel) {
      map[toDir] = map[toDir].filter((entry) => entry !== toName);
      changed = true;
    }

    const list = map[fromDir];
    if (list?.includes(fromName)) {
      map[fromDir] =
        fromDir === toDir
          ? list.map((entry) => (entry === fromName ? toName : entry))
          : list.filter((entry) => entry !== fromName);
      changed = true;
    }

    for (const key of Object.keys(map)) {
      if (isSameOrInside(key, toRel)) {
        // Stale orders under a replaced destination folder
        delete map[key];
        changed = true;
      }
    }
    for (const key of Object.keys(map)) {
      if (isSameOrInside(key, fromRel)) {
        map[toRel + key.slice(fromRel.length)] = map[key];
        delete map[key];
        changed = true;
      }
    }
    return changed;
  });
}
