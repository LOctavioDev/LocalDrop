// Folder paths are "/"-separated and relative to the storage root, which
// is "" — the same format the API uses.

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function splitPath(path: string): string[] {
  return path ? path.split('/') : [];
}

/** Whether `path` is `folder` itself or somewhere inside it */
export function isSameOrInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder + '/');
}

/**
 * Client-side mirror of the server's name rules, to reject bad names before
 * sending them. Returns an error message, or null if the name is fine.
 */
export function validateName(name: string): string | null {
  if (!name) return 'El nombre no puede estar vacío.';
  if (/[/\\]/.test(name)) return 'El nombre no puede contener "/" ni "\\".';
  if (name.startsWith('.')) return 'El nombre no puede empezar con un punto.';
  return null;
}
