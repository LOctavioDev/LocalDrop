import React from 'react';
import { ChevronRight, Folder, FolderPlus, Home } from 'lucide-react';
import { FolderItem, Item } from '../types';
import { api, errorMessage } from '../services/api';
import { isSameOrInside, joinPath, parentPath, splitPath } from '../utils/paths';
import { dialogButtonStyle } from './Dialog';

interface MoveDialogProps {
  item: Item;
  onMove: (toDir: string) => void;
  onClose: () => void;
}

/**
 * Folder picker for "Mover a…": browse the folder tree starting from the
 * item's current folder and move it into the one being viewed.
 */
export const MoveDialog: React.FC<MoveDialogProps> = ({ item, onMove, onClose }) => {
  const sourceDir = parentPath(item.path);
  const [dir, setDir] = React.useState(sourceDir);
  const [folders, setFolders] = React.useState<FolderItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (target: string) => {
    setFolders(null);
    setError(null);
    try {
      const items = await api.list(target);
      setFolders(
        items
          .filter((entry): entry is FolderItem => entry.type === 'folder')
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      setError(errorMessage(err, 'No se pudo abrir la carpeta'));
      setFolders([]);
    }
  }, []);

  React.useEffect(() => {
    load(dir);
  }, [dir, load]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const createFolder = async () => {
    try {
      const folder = await api.createFolder(dir, 'Nueva carpeta');
      setDir(folder.path);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear la carpeta'));
    }
  };

  // A folder can't go inside itself, and moving to where it already is
  // does nothing
  const isInvalidTarget = (target: string) =>
    (item.type === 'folder' && isSameOrInside(target, item.path)) || target === sourceDir;

  const segments = splitPath(dir);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mover ${item.name}`}
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 12px 40px var(--shadow)',
        }}
      >
        <h3
          style={{
            margin: '0 0 12px 0',
            color: 'var(--text-primary)',
            fontSize: '17px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Mover “{item.name}”
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '2px',
            fontSize: '13px',
            marginBottom: '8px',
          }}
        >
          <button onClick={() => setDir('')} style={crumbStyle(dir === '')}>
            <Home size={13} /> Inicio
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/');
            return (
              <React.Fragment key={target}>
                <ChevronRight size={13} color="var(--text-secondary)" />
                <button onClick={() => setDir(target)} style={crumbStyle(target === dir)}>
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div
          style={{
            height: '260px',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '4px',
          }}
        >
          {folders === null && <p style={emptyStyle}>Cargando…</p>}
          {folders?.length === 0 && !error && <p style={emptyStyle}>No hay subcarpetas.</p>}
          {error && <p style={{ ...emptyStyle, color: 'var(--danger)' }}>{error}</p>}
          {folders?.map((folder) => {
            const disabled = item.type === 'folder' && isSameOrInside(folder.path, item.path);
            return (
              <button
                key={folder.path}
                disabled={disabled}
                onClick={() => setDir(joinPath(dir, folder.name))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: '6px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Folder size={18} color="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.name}
                </span>
                <ChevronRight size={16} color="var(--text-secondary)" />
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '16px',
          }}
        >
          <button
            onClick={createFolder}
            style={{
              ...dialogButtonStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <FolderPlus size={15} /> Nueva carpeta
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                ...dialogButtonStyle,
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              Cancelar
            </button>
            <button
              disabled={isInvalidTarget(dir)}
              onClick={() => onMove(dir)}
              style={{
                ...dialogButtonStyle,
                border: 'none',
                backgroundColor: isInvalidTarget(dir) ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--accent-contrast)',
                cursor: isInvalidTarget(dir) ? 'not-allowed' : 'pointer',
              }}
            >
              Mover aquí
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  textAlign: 'center',
  fontSize: '14px',
  color: 'var(--text-secondary)',
};

function crumbStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    background: 'none',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}
