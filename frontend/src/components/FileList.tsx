import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  File,
  FileText,
  LayoutGrid,
  List,
  Trash2,
} from 'lucide-react';
import { FileInfo, SortBy, SortDir, ViewMode } from '../types';
import { api } from '../services/api';

interface FileListProps {
  files: FileInfo[];
  onFileDeleted: () => void;
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif',
]);

function getFileKind(filename: string): 'image' | 'pdf' | 'other' {
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'other';
}

const FileThumbnail: React.FC<{ filename: string; size?: number }> = ({ filename, size = 48 }) => {
  const kind = getFileKind(filename);
  const [failed, setFailed] = React.useState(false);

  const boxStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${Math.round(size * 0.2)}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--thumb-bg)',
    overflow: 'hidden',
    transition: 'background-color 0.3s ease',
  };

  if (kind === 'other' || failed) {
    const iconSize = Math.round(size * 0.45);
    return <div style={boxStyle}>{kind === 'pdf' ? <FileText size={iconSize} /> : <File size={iconSize} />}</div>;
  }

  return (
    <div style={boxStyle}>
      <img
        src={`/api/files/${encodeURIComponent(filename)}/thumbnail`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};

// --- per-device view/sort preferences ---

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (e.g. private browsing storage restrictions)
  }
}

const SORT_LABELS: Record<Exclude<SortBy, 'custom'>, string> = {
  name: 'Nombre',
  date: 'Fecha',
  size: 'Tamaño',
  type: 'Tipo',
};

function defaultDirFor(field: SortBy): SortDir {
  return field === 'date' ? 'desc' : 'asc';
}

function compareFiles(a: FileInfo, b: FileInfo, sortBy: SortBy): number {
  switch (sortBy) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'date':
      return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    case 'size':
      return a.size - b.size;
    case 'type': {
      const kindDiff = getFileKind(a.name).localeCompare(getFileKind(b.name));
      return kindDiff !== 0 ? kindDiff : a.name.localeCompare(b.name);
    }
    default:
      return 0;
  }
}

const iconButtonStyle: React.CSSProperties = {
  padding: '6px 10px',
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  fontSize: '14px',
  color: 'var(--text-primary)',
  transition: 'background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease',
};

export const FileList: React.FC<FileListProps> = ({ files, onFileDeleted }) => {
  const [deletingFiles, setDeletingFiles] = React.useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = React.useState<ViewMode>(() => loadPref('localdrop.viewMode', 'list'));
  const [sortBy, setSortBy] = React.useState<SortBy>(() => loadPref('localdrop.sortBy', 'date'));
  const [sortDir, setSortDir] = React.useState<SortDir>(() => loadPref('localdrop.sortDir', 'desc'));
  const [customOrder, setCustomOrder] = React.useState<string[]>([]);
  const [dragOverName, setDragOverName] = React.useState<string | null>(null);
  const dragIndexRef = React.useRef<number | null>(null);

  React.useEffect(() => savePref('localdrop.viewMode', viewMode), [viewMode]);
  React.useEffect(() => savePref('localdrop.sortBy', sortBy), [sortBy]);
  React.useEffect(() => savePref('localdrop.sortDir', sortDir), [sortDir]);

  // Keep the shared manual order in sync (also picks up reorders made from
  // other devices, since this re-runs whenever the polled file list changes)
  React.useEffect(() => {
    let cancelled = false;
    api
      .getOrder()
      .then((order) => {
        if (!cancelled) setCustomOrder(order);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [files]);

  const orderedFiles = React.useMemo(() => {
    if (sortBy === 'custom') {
      const byName = new Map(files.map((f) => [f.name, f]));
      const positioned = customOrder
        .map((name) => byName.get(name))
        .filter((f): f is FileInfo => !!f);
      const placedNames = new Set(positioned.map((f) => f.name));
      const rest = files
        .filter((f) => !placedNames.has(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...positioned, ...rest];
    }

    const sorted = [...files].sort((a, b) => compareFiles(a, b, sortBy));
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [files, sortBy, sortDir, customOrder]);

  const handleSortFieldChange = (field: SortBy) => {
    if (field === sortBy) {
      if (field !== 'custom') {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      }
      return;
    }
    setSortBy(field);
    setSortDir(defaultDirFor(field));
  };

  const sortIndicator = (field: SortBy) => {
    if (sortBy !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const persistReorder = async (names: string[]) => {
    setCustomOrder(names);
    try {
      await api.saveOrder(names);
    } catch (error) {
      console.error('Failed to save file order:', error);
    }
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (name: string) => (e: React.DragEvent) => {
    if (sortBy !== 'custom') return;
    e.preventDefault();
    if (dragOverName !== name) setDragOverName(name);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    if (sortBy !== 'custom') return;
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverName(null);
    if (fromIndex === null || fromIndex === index) return;

    const names = orderedFiles.map((f) => f.name);
    const [moved] = names.splice(fromIndex, 1);
    names.splice(index, 0, moved);
    persistReorder(names);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverName(null);
  };

  const handleDownload = async (filename: string) => {
    try {
      await api.downloadFile(filename);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    setDeletingFiles((prev) => new Set(prev).add(filename));

    try {
      await api.deleteFile(filename);
      onFileDeleted();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete file');
    } finally {
      setDeletingFiles((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  };

  if (files.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--surface)',
          borderRadius: '12px',
          transition: 'background-color 0.3s ease, color 0.3s ease',
        }}
      >
        <p style={{ fontSize: '18px', margin: 0 }}>
          No files uploaded yet. Drop some files to get started!
        </p>
      </div>
    );
  }

  const renderActions = (file: FileInfo, size: 'normal' | 'compact') => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={() => handleDownload(file.name)}
        title="Download"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: size === 'normal' ? '8px 16px' : '8px',
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-contrast)',
          border: 'none',
          borderRadius: size === 'normal' ? '980px' : '50%',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'background-color 0.2s ease',
        }}
      >
        <Download size={14} />
        {size === 'normal' && 'Download'}
      </button>
      <button
        onClick={() => handleDelete(file.name)}
        disabled={deletingFiles.has(file.name)}
        title="Delete"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: size === 'normal' ? '8px 16px' : '8px',
          backgroundColor: deletingFiles.has(file.name) ? 'var(--disabled)' : 'var(--danger)',
          color: '#fff',
          border: 'none',
          borderRadius: size === 'normal' ? '980px' : '50%',
          cursor: deletingFiles.has(file.name) ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'background-color 0.2s ease',
        }}
      >
        <Trash2 size={14} />
        {size === 'normal' && (deletingFiles.has(file.name) ? 'Deleting...' : 'Delete')}
      </button>
    </div>
  );

  const isCustom = sortBy === 'custom';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600, transition: 'color 0.3s ease' }}>
          Available Files ({files.length})
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={sortBy}
            onChange={(e) => handleSortFieldChange(e.target.value as SortBy)}
            style={{ ...iconButtonStyle, borderRadius: '8px' }}
          >
            {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((field) => (
              <option key={field} value={field}>
                {SORT_LABELS[field]}
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>

          {!isCustom && (
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
              style={{ ...iconButtonStyle, borderRadius: '8px', display: 'flex', alignItems: 'center' }}
            >
              {sortDir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          )}

          <div
            style={{
              display: 'flex',
              borderRadius: '980px',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              transition: 'border-color 0.3s ease',
            }}
          >
            <button
              onClick={() => setViewMode('list')}
              title="Vista de lista"
              style={{
                ...iconButtonStyle,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                backgroundColor: viewMode === 'list' ? 'var(--accent)' : 'var(--surface)',
                color: viewMode === 'list' ? 'var(--accent-contrast)' : 'var(--text-primary)',
              }}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Vista de grilla"
              style={{
                ...iconButtonStyle,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                backgroundColor: viewMode === 'grid' ? 'var(--accent)' : 'var(--surface)',
                color: viewMode === 'grid' ? 'var(--accent-contrast)' : 'var(--text-primary)',
              }}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {isCustom && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Arrastrá los archivos para reordenarlos a tu gusto.
        </p>
      )}

      {viewMode === 'list' ? (
        <div>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '0 16px 6px 60px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <button
              onClick={() => handleSortFieldChange('name')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: 0 }}
            >
              Nombre{sortIndicator('name')}
            </button>
            <button
              onClick={() => handleSortFieldChange('size')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: 0 }}
            >
              Tamaño{sortIndicator('size')}
            </button>
            <button
              onClick={() => handleSortFieldChange('date')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: 0 }}
            >
              Fecha{sortIndicator('date')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orderedFiles.map((file, index) => (
              <div
                key={file.name}
                draggable={isCustom}
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(file.name)}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  backgroundColor: 'var(--surface)',
                  transition: 'box-shadow 0.2s ease, background-color 0.3s ease, border-color 0.3s ease',
                  opacity: dragOverName === file.name ? 0.5 : 1,
                  cursor: isCustom ? 'grab' : 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <FileThumbnail filename={file.name} size={48} />
                <div style={{ flex: 1, minWidth: 0, marginLeft: '12px' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '4px',
                      transition: 'color 0.3s ease',
                    }}
                  >
                    {file.name}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', transition: 'color 0.3s ease' }}>
                    {api.formatFileSize(file.size)} • {api.formatDate(file.uploadedAt)}
                  </div>
                </div>
                <div style={{ marginLeft: '16px' }}>{renderActions(file, 'normal')}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '16px',
          }}
        >
          {orderedFiles.map((file, index) => (
            <div
              key={file.name}
              draggable={isCustom}
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(file.name)}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                backgroundColor: 'var(--surface)',
                transition: 'background-color 0.3s ease, border-color 0.3s ease',
                opacity: dragOverName === file.name ? 0.5 : 1,
                cursor: isCustom ? 'grab' : 'default',
              }}
            >
              <FileThumbnail filename={file.name} size={96} />
              <div
                title={file.name}
                style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  textAlign: 'center',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                  lineHeight: '1.3',
                  maxHeight: '2.6em',
                  transition: 'color 0.3s ease',
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', transition: 'color 0.3s ease' }}>
                {api.formatFileSize(file.size)}
              </div>
              <div style={{ marginTop: '8px' }}>{renderActions(file, 'compact')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
