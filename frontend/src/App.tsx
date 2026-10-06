import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { DropZone } from './components/DropZone';
import { FileBrowser } from './components/FileBrowser';
import { UploadProgress } from './components/UploadProgress';
import { ThemeToggle } from './components/ThemeToggle';
import { useDialog } from './components/Dialog';
import { useHashPath } from './hooks/useHashPath';
import { api, errorMessage } from './services/api';
import { ConflictStrategy, Item, UploadProgress as UploadProgressType } from './types';
import { UploadBatch } from './utils/droppedFiles';
import { joinPath, parentPath, splitPath } from './utils/paths';

type UploadDecision = ConflictStrategy | 'skip';

function App() {
  const dialog = useDialog();
  const [dir, navigate] = useHashPath();
  const [items, setItems] = useState<Item[]>([]);
  const [uploads, setUploads] = useState<UploadProgressType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Guards against a slow listing of a folder we've already left
  const dirRef = useRef(dir);
  dirRef.current = dir;
  const nextUploadId = useRef(0);

  const loadItems = useCallback(async () => {
    const requested = dir;
    try {
      const list = await api.list(requested);
      if (dirRef.current !== requested) return;
      setItems(list);
      setError(null);
    } catch (err) {
      if (dirRef.current !== requested) return;
      if (axios.isAxiosError(err) && err.response?.status === 404 && requested !== '') {
        // Deleted or renamed (maybe from another device) while open
        setNotice(`La carpeta “${splitPath(requested).pop()}” ya no existe.`);
        navigate('');
        return;
      }
      console.error('Failed to load files:', err);
      setError('Failed to load files. Make sure the backend is running.');
    } finally {
      if (dirRef.current === requested) setLoading(false);
    }
  }, [dir, navigate]);

  const loadItemsRef = useRef(loadItems);
  loadItemsRef.current = loadItems;

  useEffect(() => {
    setLoading(true);
    setItems([]);
    loadItems();
    // Refresh file list every 5 seconds
    const interval = setInterval(loadItems, 5000);
    return () => clearInterval(interval);
  }, [loadItems]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const updateUpload = (id: number, changes: Partial<UploadProgressType>) =>
    setUploads((prev) => prev.map((upload) => (upload.id === id ? { ...upload, ...changes } : upload)));

  /**
   * Asks what to do with each top-level name that already exists in the
   * target folder: replace it, keep both ("name (2)"), or skip it.
   */
  const askConflicts = async (targetDir: string, names: string[]) => {
    const decisions = new Map<string, UploadDecision>();
    let forAll: UploadDecision | null = null;
    const where = targetDir ? `La carpeta “${splitPath(targetDir).pop()}”` : 'Inicio';

    for (const [index, name] of names.entries()) {
      if (forAll) {
        decisions.set(name, forAll);
        continue;
      }
      const remaining = names.length - index;
      const { action, applyToAll } = await dialog.ask({
        title: `Ya existe “${name}”`,
        message: `${where} ya tiene un elemento con ese nombre. Puedes reemplazarlo o conservar ambos.`,
        actions: [
          { id: 'replace', label: 'Reemplazar', tone: 'danger' },
          { id: 'rename', label: 'Conservar ambos', tone: 'primary' },
        ],
        cancelLabel: 'Omitir',
        applyToAllLabel: remaining > 1 ? `Hacer lo mismo con los ${remaining} conflictos` : undefined,
      });
      const decision: UploadDecision = (action as ConflictStrategy | null) ?? 'skip';
      decisions.set(name, decision);
      if (applyToAll) forAll = decision;
    }
    return decisions;
  };

  /**
   * Uploads files and whole folder trees into `targetDir`. Folders are
   * created first (so empty ones survive too); when a top-level folder is
   * kept alongside an existing one, the server names it "name (2)" and
   * everything inside is uploaded under that name.
   */
  const handleUpload = async (targetDir: string, batchPromise: Promise<UploadBatch>) => {
    let batch: UploadBatch;
    let existing: Set<string>;
    try {
      batch = await batchPromise;
      existing = new Set((await api.list(targetDir)).map((item) => item.name));
    } catch (err) {
      await dialog.alert('No se pudo subir', errorMessage(err, 'No se pudieron leer los archivos.'));
      return;
    }

    const topDirs = batch.dirs.filter((path) => !path.includes('/'));
    const topFiles = batch.files.filter((entry) => !entry.dir).map((entry) => entry.file.name);
    const decisions = await askConflicts(
      targetDir,
      [...topDirs, ...topFiles].filter((name) => existing.has(name))
    );

    const failures: string[] = [];
    const rootPaths = new Map<string, string | null>();
    for (const name of topDirs) {
      const decision = decisions.get(name);
      if (decision === 'skip') {
        rootPaths.set(name, null);
        continue;
      }
      try {
        if (decision === 'replace') await api.deleteItem(joinPath(targetDir, name));
        rootPaths.set(name, (await api.createFolder(targetDir, name)).path);
      } catch (err) {
        console.error('Failed to create folder:', err);
        failures.push(name);
        rootPaths.set(name, null);
      }
    }

    // Maps a folder path inside the batch to where it really goes, or null if skipped
    const realDir = (batchDir: string): string | null => {
      if (!batchDir) return targetDir;
      const [top, ...rest] = batchDir.split('/');
      const root = rootPaths.get(top);
      if (!root) return null;
      return rest.length ? `${root}/${rest.join('/')}` : root;
    };

    const subDirs = batch.dirs
      .filter((path) => path.includes('/'))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    for (const batchDir of subDirs) {
      const real = realDir(batchDir);
      if (!real) continue;
      try {
        await api.createFolder(parentPath(real), splitPath(real).pop()!);
      } catch (err) {
        console.error('Failed to create folder:', err);
      }
    }

    const queue = batch.files
      .map(({ file, dir: batchDir }) => ({
        file,
        dir: realDir(batchDir),
        label: joinPath(batchDir, file.name),
        decision: batchDir ? 'rename' : (decisions.get(file.name) ?? 'rename'),
      }))
      .filter((entry) => entry.dir !== null && entry.decision !== 'skip')
      .map((entry) => ({ ...entry, id: nextUploadId.current++ }));

    setUploads((prev) => [
      ...prev,
      ...queue.map((entry) => ({ id: entry.id, filename: entry.label, progress: 0, status: 'uploading' as const })),
    ]);

    // Upload files sequentially to avoid overwhelming the server
    for (const entry of queue) {
      try {
        await api.uploadFile(entry.file, entry.dir!, entry.decision as ConflictStrategy, (progress) =>
          updateUpload(entry.id, { progress })
        );
        updateUpload(entry.id, { progress: 100, status: 'success' });
        await loadItemsRef.current();
      } catch (err) {
        console.error('Upload failed:', err);
        updateUpload(entry.id, { status: 'error', error: errorMessage(err, 'Upload failed') });
      }
    }

    if (queue.length === 0) await loadItemsRef.current();
    if (failures.length > 0) {
      await dialog.alert('Algunas carpetas no se pudieron crear', failures.join(', '));
    }

    // Clear completed uploads after 3 seconds
    const finished = new Set(queue.map((entry) => entry.id));
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => !finished.has(u.id) || u.status === 'uploading'));
    }, 3000);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        padding: '20px',
        transition: 'background-color 0.4s ease',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div style={{ width: '56px', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h1
              style={{
                fontSize: '48px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '0 0 8px 0',
                color: 'var(--text-primary)',
                transition: 'color 0.4s ease',
              }}
            >
              ETHDrop
            </h1>
            <p
              style={{
                fontSize: '18px',
                color: 'var(--text-secondary)',
                margin: 0,
                transition: 'color 0.4s ease',
              }}
            >
              Share files across your local network
            </p>
          </div>
          <ThemeToggle />
        </header>

        {(error || notice) && (
          <div
            style={{
              padding: '16px',
              backgroundColor: error ? 'var(--danger)' : 'var(--accent)',
              color: '#fff',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            {error ?? notice}
          </div>
        )}

        <DropZone
          onFilesSelected={(batch) => handleUpload(dir, batch)}
          disabled={uploads.some((u) => u.status === 'uploading')}
        />

        <UploadProgress uploads={uploads} />

        <FileBrowser
          dir={dir}
          items={items}
          loading={loading}
          onNavigate={navigate}
          onRefresh={loadItems}
          onUpload={handleUpload}
        />
      </div>
    </div>
  );
}

export default App;
