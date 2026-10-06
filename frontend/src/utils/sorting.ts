import { FileItem, FolderItem, Item, SortBy, SortDir } from '../types';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif',
]);

export function getFileKind(filename: string): 'image' | 'pdf' | 'other' {
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'other';
}

// --- per-device view/sort preferences ---

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (e.g. private browsing storage restrictions)
  }
}

export const SORT_LABELS: Record<Exclude<SortBy, 'custom'>, string> = {
  name: 'Nombre',
  date: 'Fecha',
  size: 'Tamaño',
  type: 'Tipo',
};

export function defaultDirFor(field: SortBy): SortDir {
  return field === 'date' ? 'desc' : 'asc';
}

const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

function compareFiles(a: FileItem, b: FileItem, sortBy: SortBy): number {
  switch (sortBy) {
    case 'name':
      return byName(a, b);
    case 'date':
      return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    case 'size':
      return a.size - b.size;
    case 'type': {
      const kindDiff = getFileKind(a.name).localeCompare(getFileKind(b.name));
      return kindDiff !== 0 ? kindDiff : byName(a, b);
    }
    default:
      return 0;
  }
}

// Folders sort by how many items they hold instead of a byte size, and
// all share one "type", so that falls back to name
function compareFolders(a: FolderItem, b: FolderItem, sortBy: SortBy): number {
  switch (sortBy) {
    case 'date':
      return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    case 'size':
      return a.itemCount - b.itemCount || byName(a, b);
    default:
      return byName(a, b);
  }
}

function applyCustomOrder<T extends Item>(items: T[], customOrder: string[]): T[] {
  const byItemName = new Map(items.map((item) => [item.name, item]));
  const positioned = customOrder
    .map((name) => byItemName.get(name))
    .filter((item): item is T => !!item);
  const placed = new Set(positioned.map((item) => item.name));
  const rest = items.filter((item) => !placed.has(item.name)).sort(byName);
  return [...positioned, ...rest];
}

/**
 * Sorts a folder listing. Folders always come before files; in "custom"
 * mode each group follows the folder's saved manual order.
 */
export function sortItems(
  items: Item[],
  sortBy: SortBy,
  sortDir: SortDir,
  customOrder: string[]
): Item[] {
  const folders = items.filter((item): item is FolderItem => item.type === 'folder');
  const files = items.filter((item): item is FileItem => item.type === 'file');

  if (sortBy === 'custom') {
    return [...applyCustomOrder(folders, customOrder), ...applyCustomOrder(files, customOrder)];
  }

  const direction = sortDir === 'desc' ? -1 : 1;
  folders.sort((a, b) => direction * compareFolders(a, b, sortBy));
  files.sort((a, b) => direction * compareFiles(a, b, sortBy));
  return [...folders, ...files];
}
