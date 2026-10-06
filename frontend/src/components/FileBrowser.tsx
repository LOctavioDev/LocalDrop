import React from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  Home,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ConflictStrategy, Item, SortBy, SortDir, ViewMode } from '../types';
import { ConflictError, api, errorMessage } from '../services/api';
import { UploadBatch, batchFromDataTransfer } from '../utils/droppedFiles';
import { isSameOrInside, parentPath, splitPath, validateName } from '../utils/paths';
import { SORT_LABELS, defaultDirFor, loadPref, savePref, sortItems } from '../utils/sorting';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ContextMenu, MenuEntry } from './ContextMenu';
import { useDialog } from './Dialog';
import { ItemThumbnail, RenameInput } from './ItemViews';
import { MoveDialog } from './MoveDialog';

interface FileBrowserProps {
  /** Folder being shown ("" is the root) */
  dir: string;
  items: Item[];
  /** True while the folder's first listing is still loading */
  loading?: boolean;
  onNavigate: (dir: string) => void;
  /** Reloads `items`; resolves once the new listing is in */
  onRefresh: () => Promise<void>;
  /** Uploads dropped files/folders into `targetDir` */
  onUpload: (targetDir: string, batch: Promise<UploadBatch>) => void;
}

/** Where a dragged item would land: inside a folder, or next to an item (custom order) */
type DropIntent = 'into' | 'before' | 'after';

const iconButtonStyle: React.CSSProperties = {
  padding: '6px 10px',
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  fontSize: '14px',
  color: 'var(--text-primary)',
  transition: 'background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease',
};

const toolbarButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const ROOT_LABEL = 'Inicio';

function describeLocation(dir: string): string {
  return [ROOT_LABEL, ...splitPath(dir)].join(' › ');
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ dir, items, loading, onNavigate, onRefresh, onUpload }) => {
  const dialog = useDialog();
  // Phones: icon-only actions so list rows keep room for the name
  const isNarrow = useMediaQuery('(max-width: 640px)');

  const [viewMode, setViewMode] = React.useState<ViewMode>(() => loadPref('localdrop.viewMode', 'list'));
  const [sortBy, setSortBy] = React.useState<SortBy>(() => loadPref('localdrop.sortBy', 'date'));
  const [sortDir, setSortDir] = React.useState<SortDir>(() => loadPref('localdrop.sortDir', 'desc'));
  const [customOrder, setCustomOrder] = React.useState<string[]>([]);

  const [query, setQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Item[] | null>(null);

  const [renamingPath, setRenamingPath] = React.useState<string | null>(null);
  const [busyPaths, setBusyPaths] = React.useState<Set<string>>(new Set());
  const [menu, setMenu] = React.useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<Item | null>(null);

  const dragRef = React.useRef<Item | null>(null);
  const [draggingPath, setDraggingPath] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ key: string; intent: DropIntent } | null>(null);

  React.useEffect(() => savePref('localdrop.viewMode', viewMode), [viewMode]);
  React.useEffect(() => savePref('localdrop.sortBy', sortBy), [sortBy]);
  React.useEffect(() => savePref('localdrop.sortDir', sortDir), [sortDir]);

  // Opening another folder ends whatever was in progress in this one
  React.useEffect(() => {
    setRenamingPath(null);
    setMenu(null);
    setQuery('');
  }, [dir]);

  // Keep the folder's shared manual order in sync (also picks up reorders
  // made from other devices, since this re-runs whenever the polled
  // listing changes)
  React.useEffect(() => {
    let cancelled = false;
    api
      .getOrder(dir)
      .then((order) => {
        if (!cancelled) setCustomOrder(order);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dir, items]);

  const isSearch = query.trim() !== '';

  const closeMenu = React.useCallback(() => setMenu(null), []);

  // Navigating also leaves search mode, even when going to the open folder
  const goTo = (target: string) => {
    setQuery('');
    onNavigate(target);
  };

  const runSearch = React.useCallback(async (text: string) => {
    try {
      setSearchResults(await api.search(text));
    } catch {
      setSearchResults([]);
    }
  }, []);

  React.useEffect(() => {
    if (!isSearch) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => runSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, isSearch, runSearch]);

  const refreshAll = async () => {
    await onRefresh();
    if (isSearch) await runSearch(query.trim());
  };

  const displayed = React.useMemo(() => {
    if (isSearch) {
      // Search spans many folders, so there's no single manual order to use
      return sortItems(searchResults ?? [], sortBy === 'custom' ? 'name' : sortBy, sortDir, []);
    }
    return sortItems(items, sortBy, sortDir, customOrder);
  }, [isSearch, searchResults, items, sortBy, sortDir, customOrder]);

  const isCustom = sortBy === 'custom' && !isSearch;

  // --- sorting ---

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

  // --- actions ---

  const markBusy = (path: string, busy: boolean) =>
    setBusyPaths((prev) => {
      const next = new Set(prev);
      if (busy) next.add(path);
      else next.delete(path);
      return next;
    });

  /**
   * Runs a rename/move, and if the name is taken asks whether to replace
   * the existing item or keep both, then retries with that choice.
   */
  const withConflictPrompt = async (attempt: (conflict?: ConflictStrategy) => Promise<unknown>) => {
    try {
      await attempt();
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const { action } = await dialog.ask({
        title: `Ya existe “${error.itemName}”`,
        message: (
          <>
            Ya hay un elemento con ese nombre en esa ubicación. Puedes reemplazarlo o conservar ambos (el
            nuevo se llamará “{error.suggestedName}”).
          </>
        ),
        actions: [
          { id: 'replace', label: 'Reemplazar', tone: 'danger' },
          { id: 'rename', label: 'Conservar ambos', tone: 'primary' },
        ],
        cancelLabel: 'Cancelar',
      });
      if (action) await attempt(action as ConflictStrategy);
    }
  };

  const openItem = (item: Item) => {
    if (item.type === 'folder') goTo(item.path);
  };

  const downloadItem = (item: Item) => {
    if (item.type === 'folder') api.downloadFolder(item.path);
    else api.downloadFile(item.path);
  };

  const commitRename = async (item: Item, newName: string) => {
    setRenamingPath(null);
    if (!newName || newName === item.name) return;

    const invalid = validateName(newName);
    if (invalid) {
      await dialog.alert('Nombre no válido', invalid);
      return;
    }

    markBusy(item.path, true);
    try {
      await withConflictPrompt((conflict) => api.renameItem(item.path, newName, conflict));
      await refreshAll();
    } catch (error) {
      await dialog.alert('No se pudo renombrar', errorMessage(error, `No se pudo renombrar “${item.name}”.`));
    } finally {
      markBusy(item.path, false);
    }
  };

  const moveItem = async (item: Item, toDir: string) => {
    if (parentPath(item.path) === toDir) return;
    if (item.type === 'folder' && isSameOrInside(toDir, item.path)) return;

    markBusy(item.path, true);
    try {
      await withConflictPrompt((conflict) => api.moveItem(item.path, toDir, conflict));
      await refreshAll();
    } catch (error) {
      await dialog.alert('No se pudo mover', errorMessage(error, `No se pudo mover “${item.name}”.`));
    } finally {
      markBusy(item.path, false);
    }
  };

  const deleteItem = async (item: Item) => {
    const confirmed =
      item.type === 'folder'
        ? await dialog.confirm(
            `¿Eliminar la carpeta “${item.name}”?`,
            item.itemCount > 0
              ? `Se eliminará junto con todo su contenido (${api.formatItemCount(item.itemCount)} adentro). Esta acción no se puede deshacer.`
              : 'Esta acción no se puede deshacer.',
            'Eliminar'
          )
        : await dialog.confirm(`¿Eliminar “${item.name}”?`, 'Esta acción no se puede deshacer.', 'Eliminar');
    if (!confirmed) return;

    markBusy(item.path, true);
    try {
      await api.deleteItem(item.path);
      await refreshAll();
    } catch (error) {
      await dialog.alert('No se pudo eliminar', errorMessage(error, `No se pudo eliminar “${item.name}”.`));
    } finally {
      markBusy(item.path, false);
    }
  };

  const createFolder = async () => {
    try {
      setQuery('');
      const folder = await api.createFolder(dir, 'Nueva carpeta');
      await onRefresh();
      setRenamingPath(folder.path);
    } catch (error) {
      await dialog.alert('No se pudo crear la carpeta', errorMessage(error, 'Inténtalo de nuevo.'));
    }
  };

  const persistReorder = async (names: string[]) => {
    setCustomOrder(names);
    try {
      await api.saveOrder(dir, names);
    } catch (error) {
      console.error('Failed to save file order:', error);
    }
  };

  const reorder = (dragged: Item, target: Item, position: 'before' | 'after') => {
    const names = displayed.map((item) => item.name).filter((name) => name !== dragged.name);
    const index = names.indexOf(target.name);
    names.splice(position === 'before' ? index : index + 1, 0, dragged.name);
    persistReorder(names);
  };

  // --- menus ---

  const itemMenuEntries = (item: Item): MenuEntry[] => [
    ...(item.type === 'folder'
      ? [{ label: 'Abrir', icon: <FolderOpen size={15} />, onSelect: () => openItem(item) }]
      : []),
    ...(isSearch
      ? [{ label: 'Mostrar en carpeta', icon: <FolderSearch size={15} />, onSelect: () => goTo(parentPath(item.path)) }]
      : []),
    {
      label: item.type === 'folder' ? 'Descargar .zip' : 'Descargar',
      icon: item.type === 'folder' ? <Archive size={15} /> : <Download size={15} />,
      onSelect: () => downloadItem(item),
    },
    { label: 'Renombrar', icon: <Pencil size={15} />, onSelect: () => setRenamingPath(item.path), disabled: isSearch },
    { label: 'Mover a…', icon: <FolderInput size={15} />, onSelect: () => setMoveTarget(item) },
    { label: 'Eliminar', icon: <Trash2 size={15} />, onSelect: () => deleteItem(item), danger: true },
  ];

  const backgroundMenuEntries = (): MenuEntry[] => [
    { label: 'Nueva carpeta', icon: <FolderPlus size={15} />, onSelect: createFolder },
    { label: 'Descargar carpeta (.zip)', icon: <Archive size={15} />, onSelect: () => api.downloadFolder(dir) },
  ];

  const openMenu = (e: React.MouseEvent, item: Item | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entries: item ? itemMenuEntries(item) : backgroundMenuEntries() });
  };

  // --- drag and drop ---

  const isExternalFileDrag = (e: React.DragEvent) =>
    !dragRef.current && Array.from(e.dataTransfer.types).includes('Files');

  /** Can the item being dragged (or external files) be dropped into folder `target`? */
  const canDropInto = (e: React.DragEvent, target: string) => {
    if (isExternalFileDrag(e)) return true;
    const dragged = dragRef.current;
    if (!dragged || parentPath(dragged.path) === target) return false;
    return !(dragged.type === 'folder' && isSameOrInside(target, dragged.path));
  };

  const intentFor = (e: React.DragEvent, item: Item): DropIntent | null => {
    const dragged = dragRef.current;
    if (dragged?.path === item.path) return null;

    const canReorder = isCustom && !!dragged && dragged.type === item.type;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio =
      viewMode === 'list' ? (e.clientY - rect.top) / rect.height : (e.clientX - rect.left) / rect.width;

    if (item.type === 'folder') {
      // Over a folder's edges you reorder it; anywhere else you drop into it
      if (canReorder && ratio < 0.25) return 'before';
      if (canReorder && ratio > 0.75) return 'after';
      return canDropInto(e, item.path) ? 'into' : null;
    }
    if (!canReorder) return null;
    return ratio < 0.5 ? 'before' : 'after';
  };

  const clearDrag = () => {
    dragRef.current = null;
    setDraggingPath(null);
    setDropTarget(null);
  };

  const itemDragProps = (item: Item) => ({
    draggable: renamingPath !== item.path,
    onDragStart: (e: React.DragEvent) => {
      dragRef.current = item;
      setDraggingPath(item.path);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.name);
    },
    onDragEnd: clearDrag,
    onDragOver: (e: React.DragEvent) => {
      const intent = intentFor(e, item);
      if (!intent) {
        if (dropTarget?.key === item.path) setDropTarget(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = isExternalFileDrag(e) ? 'copy' : 'move';
      if (dropTarget?.key !== item.path || dropTarget.intent !== intent) {
        setDropTarget({ key: item.path, intent });
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node) && dropTarget?.key === item.path) {
        setDropTarget(null);
      }
    },
    onDrop: (e: React.DragEvent) => {
      const intent = intentFor(e, item);
      if (!intent) return; // falls through to the container (uploads to this folder)
      e.preventDefault();
      e.stopPropagation();
      const dragged = dragRef.current;
      const external = isExternalFileDrag(e);
      const batch = external ? batchFromDataTransfer(e.dataTransfer) : null;
      clearDrag();

      if (batch) onUpload(item.path, batch);
      else if (dragged && intent === 'into') moveItem(dragged, item.path);
      else if (dragged && intent !== 'into') reorder(dragged, item, intent);
    },
  });

  const crumbDropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (target === dir && !isSearch) return;
      if (!canDropInto(e, target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (dropTarget?.key !== `crumb:${target}`) setDropTarget({ key: `crumb:${target}`, intent: 'into' });
    },
    onDragLeave: () => {
      if (dropTarget?.key === `crumb:${target}`) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      if (!canDropInto(e, target)) return;
      e.preventDefault();
      e.stopPropagation();
      const dragged = dragRef.current;
      const batch = isExternalFileDrag(e) ? batchFromDataTransfer(e.dataTransfer) : null;
      clearDrag();
      if (batch) onUpload(target, batch);
      else if (dragged) moveItem(dragged, target);
    },
  });

  // Files dropped from the computer anywhere else in the browser area go
  // into the open folder
  const containerDropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropTarget?.key !== 'container') setDropTarget({ key: 'container', intent: 'into' });
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node) && dropTarget?.key === 'container') {
        setDropTarget(null);
      }
    },
    onDrop: (e: React.DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      const batch = batchFromDataTransfer(e.dataTransfer);
      clearDrag();
      onUpload(dir, batch);
    },
  };

  const dropHighlight = (item: Item): React.CSSProperties => {
    if (dropTarget?.key !== item.path) return {};
    if (dropTarget.intent === 'into') {
      return { backgroundColor: 'var(--surface-hover)', boxShadow: '0 0 0 2px var(--accent)' };
    }
    const before = dropTarget.intent === 'before';
    const line =
      viewMode === 'list'
        ? `inset 0 ${before ? 3 : -3}px 0 var(--accent)`
        : `inset ${before ? 3 : -3}px 0 0 var(--accent)`;
    return { boxShadow: line };
  };

  // --- rendering ---

  const renderActions = (item: Item, size: 'normal' | 'compact') => {
    const busy = busyPaths.has(item.path);
    const roundButton = (style: React.CSSProperties): React.CSSProperties => ({
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: size === 'normal' ? '8px 16px' : '7px',
      border: 'none',
      borderRadius: size === 'normal' ? '980px' : '50%',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 600,
      transition: 'background-color 0.2s ease',
      ...style,
    });

    return (
      <div style={{ display: 'flex', gap: size === 'normal' ? '8px' : '6px' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => downloadItem(item)}
          title={item.type === 'folder' ? 'Descargar .zip' : 'Download'}
          style={roundButton({ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' })}
        >
          {item.type === 'folder' ? <Archive size={14} /> : <Download size={14} />}
          {size === 'normal' && 'Download'}
        </button>
        <button
          onClick={() => deleteItem(item)}
          disabled={busy}
          title="Delete"
          style={roundButton({
            backgroundColor: busy ? 'var(--disabled)' : 'var(--danger)',
            color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
          })}
        >
          <Trash2 size={14} />
          {size === 'normal' && 'Delete'}
        </button>
        <button
          onClick={(e) => openMenu(e, item)}
          title="Más acciones"
          aria-label={`Más acciones para ${item.name}`}
          style={roundButton({
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-primary)',
            padding: size === 'normal' ? '8px 10px' : '7px',
          })}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    );
  };

  const itemSubtitle = (item: Item, withDate: boolean) =>
    item.type === 'folder'
      ? `${api.formatItemCount(item.itemCount)}${withDate ? ` • ${api.formatDate(item.uploadedAt)}` : ''}`
      : `${api.formatFileSize(item.size)}${withDate ? ` • ${api.formatDate(item.uploadedAt)}` : ''}`;

  const searchLocation = (item: Item) =>
    isSearch && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          goTo(parentPath(item.path));
        }}
        title="Mostrar en carpeta"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '12px',
          color: 'var(--accent)',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        en {describeLocation(parentPath(item.path))}
      </button>
    );

  const commonItemProps = (item: Item) => ({
    ...itemDragProps(item),
    onClick: () => openItem(item),
    onContextMenu: (e: React.MouseEvent) => openMenu(e, item),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) openItem(item);
    },
    tabIndex: 0,
    'aria-label': item.type === 'folder' ? `Carpeta ${item.name}` : item.name,
  });

  const itemCursor = (item: Item) => (item.type === 'folder' ? 'pointer' : isCustom ? 'grab' : 'default');

  const renderListItem = (item: Item) => (
    <div
      key={item.path}
      {...commonItemProps(item)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isNarrow ? '10px 12px' : '12px 16px',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        backgroundColor: 'var(--surface)',
        transition: 'box-shadow 0.2s ease, background-color 0.3s ease, border-color 0.3s ease',
        opacity: draggingPath === item.path || busyPaths.has(item.path) ? 0.5 : 1,
        cursor: itemCursor(item),
        outline: 'none',
        ...dropHighlight(item),
      }}
      onMouseEnter={(e) => {
        if (!dropTarget) e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)';
      }}
      onMouseLeave={(e) => {
        if (!dropTarget) e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <ItemThumbnail item={item} size={48} />
      <div style={{ flex: 1, minWidth: 0, marginLeft: '12px' }}>
        {renamingPath === item.path ? (
          <div style={{ marginBottom: '4px' }}>
            <RenameInput
              initialName={item.name}
              isFolder={item.type === 'folder'}
              onCommit={(name) => commitRename(item, name)}
              onCancel={() => setRenamingPath(null)}
            />
          </div>
        ) : (
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
            {item.name}
          </div>
        )}
        <div
          style={{
            fontSize: isNarrow ? '13px' : '14px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'color 0.3s ease',
          }}
        >
          {itemSubtitle(item, !isNarrow)}
        </div>
        {searchLocation(item)}
      </div>
      <div style={{ marginLeft: isNarrow ? '8px' : '16px' }}>{renderActions(item, isNarrow ? 'compact' : 'normal')}</div>
    </div>
  );

  const renderGridItem = (item: Item) => (
    <div
      key={item.path}
      {...commonItemProps(item)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        backgroundColor: 'var(--surface)',
        transition: 'background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.2s ease',
        opacity: draggingPath === item.path || busyPaths.has(item.path) ? 0.5 : 1,
        cursor: itemCursor(item),
        outline: 'none',
        minWidth: 0,
        ...dropHighlight(item),
      }}
    >
      <ItemThumbnail item={item} size={96} />
      {renamingPath === item.path ? (
        <div style={{ marginTop: '8px', width: '100%', fontSize: '13px' }}>
          <RenameInput
            initialName={item.name}
            isFolder={item.type === 'folder'}
            align="center"
            onCommit={(name) => commitRename(item, name)}
            onCancel={() => setRenamingPath(null)}
          />
        </div>
      ) : (
        <div
          title={item.name}
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
          {item.name}
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', transition: 'color 0.3s ease' }}>
        {itemSubtitle(item, false)}
      </div>
      {searchLocation(item)}
      <div style={{ marginTop: '8px' }}>{renderActions(item, 'compact')}</div>
    </div>
  );

  const crumbStyle = (target: string): React.CSSProperties => {
    const current = target === dir && !isSearch;
    const highlighted = dropTarget?.key === `crumb:${target}`;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 8px',
      border: 'none',
      borderRadius: '8px',
      background: highlighted ? 'var(--surface-hover)' : 'none',
      boxShadow: highlighted ? '0 0 0 2px var(--accent)' : 'none',
      cursor: current ? 'default' : 'pointer',
      fontSize: current ? '20px' : '16px',
      fontWeight: current ? 600 : 500,
      color: current ? 'var(--text-primary)' : 'var(--text-secondary)',
      maxWidth: '260px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      transition: 'color 0.3s ease',
    };
  };

  const segments = splitPath(dir);
  const folderCount = displayed.filter((item) => item.type === 'folder').length;
  const fileCount = displayed.length - folderCount;

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

  let summary: string;
  let emptyMessage: string | null;
  if (isSearch) {
    summary = searchResults === null ? 'Buscando…' : `${plural(displayed.length, 'resultado')} en todas las carpetas`;
    emptyMessage = searchResults === null ? null : `Sin resultados para “${query.trim()}”.`;
  } else if (loading) {
    summary = '';
    emptyMessage = 'Loading files...';
  } else {
    summary = [folderCount > 0 && plural(folderCount, 'carpeta'), plural(fileCount, 'archivo')]
      .filter(Boolean)
      .join(' · ');
    emptyMessage =
      dir === ''
        ? 'No files uploaded yet. Drop some files to get started!'
        : 'Esta carpeta está vacía. Arrastrá archivos acá o creá una carpeta.';
  }

  return (
    <div
      {...containerDropProps}
      onContextMenu={(e) => openMenu(e, null)}
      style={{
        borderRadius: '14px',
        padding: '4px',
        margin: '-4px',
        boxShadow: dropTarget?.key === 'container' ? '0 0 0 2px var(--accent)' : 'none',
        transition: 'box-shadow 0.2s ease',
        minHeight: '200px',
      }}
    >
      {/* Location and search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <nav aria-label="Ubicación" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px', minWidth: 0 }}>
          <button onClick={() => goTo('')} {...crumbDropProps('')} style={crumbStyle('')}>
            <Home size={dir === '' && !isSearch ? 18 : 15} /> {ROOT_LABEL}
          </button>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join('/');
            return (
              <React.Fragment key={target}>
                <ChevronRight size={16} color="var(--text-secondary)" />
                <button
                  onClick={() => goTo(target)}
                  {...crumbDropProps(target)}
                  title={segment}
                  style={crumbStyle(target)}
                >
                  {segment}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: '980px',
            backgroundColor: 'var(--surface)',
            flex: '0 1 260px',
            minWidth: '160px',
          }}
        >
          <Search size={15} color="var(--text-secondary)" />
          <input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder="Buscar en todas las carpetas"
            aria-label="Buscar archivos y carpetas"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'none',
              fontSize: '14px',
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              style={{ display: 'flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Folder actions and view options */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={createFolder} style={toolbarButtonStyle} title="Nueva carpeta">
            <FolderPlus size={16} /> Nueva carpeta
          </button>
          <button
            onClick={() => api.downloadFolder(dir)}
            title="Descargar esta carpeta como .zip"
            disabled={items.length === 0}
            style={{ ...toolbarButtonStyle, opacity: items.length === 0 ? 0.5 : 1, cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <Archive size={16} /> .zip
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{summary}</span>
        </div>

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

          {sortBy !== 'custom' && (
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

      {isCustom && displayed.length > 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Arrastrá los archivos para reordenarlos a tu gusto, o soltalos sobre una carpeta para moverlos.
        </p>
      )}

      {displayed.length === 0 ? (
        emptyMessage && (
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
            <p style={{ fontSize: '18px', margin: 0 }}>{emptyMessage}</p>
          </div>
        )
      ) : viewMode === 'list' ? (
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{displayed.map(renderListItem)}</div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '16px',
          }}
        >
          {displayed.map(renderGridItem)}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={closeMenu} />}

      {moveTarget && (
        <MoveDialog
          item={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMove={(toDir) => {
            const item = moveTarget;
            setMoveTarget(null);
            moveItem(item, toDir);
          }}
        />
      )}
    </div>
  );
};
