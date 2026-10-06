import { useCallback, useEffect, useState } from 'react';

// The open folder lives in the URL hash (#/Fotos/2026), so the browser's
// back button works and a folder link can be shared with other devices.

function readHashPath(): string {
  const raw = window.location.hash.replace(/^#\/?/, '');
  try {
    return raw
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
      .join('/');
  } catch {
    return '';
  }
}

function toHash(path: string): string {
  return '#/' + path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function useHashPath(): [string, (path: string) => void] {
  const [path, setPath] = useState(readHashPath);

  useEffect(() => {
    const onHashChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    if (next !== readHashPath()) {
      window.location.hash = toHash(next);
    }
  }, []);

  return [path, navigate];
}
