import React from 'react';
import { File, FileText, Folder } from 'lucide-react';
import { Item } from '../types';
import { api } from '../services/api';
import { getFileKind } from '../utils/sorting';

export const ItemThumbnail: React.FC<{ item: Item; size?: number }> = ({ item, size = 48 }) => {
  const kind = item.type === 'file' ? getFileKind(item.name) : 'other';
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

  const iconSize = Math.round(size * 0.45);

  if (item.type === 'folder') {
    return (
      <div style={boxStyle}>
        <Folder
          size={Math.round(size * 0.55)}
          color="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.25}
          strokeWidth={1.75}
        />
      </div>
    );
  }

  if (kind === 'other' || failed) {
    return <div style={boxStyle}>{kind === 'pdf' ? <FileText size={iconSize} /> : <File size={iconSize} />}</div>;
  }

  return (
    <div style={boxStyle}>
      <img
        src={api.thumbnailUrl(item.path, item.uploadedAt)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};

interface RenameInputProps {
  initialName: string;
  isFolder: boolean;
  align?: 'left' | 'center';
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * In-place name editor, like renaming in Finder/Explorer: Enter or
 * clicking away saves, Escape cancels. For files only the part before the
 * extension starts selected.
 */
export const RenameInput: React.FC<RenameInputProps> = ({
  initialName,
  isFolder,
  align = 'left',
  onCommit,
  onCancel,
}) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = initialName.lastIndexOf('.');
    input.setSelectionRange(0, !isFolder && dot > 0 ? dot : initialName.length);
  }, [initialName, isFolder]);

  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save) onCommit(ref.current?.value.trim() ?? '');
    else onCancel();
  };

  return (
    <input
      ref={ref}
      defaultValue={initialName}
      aria-label="Nuevo nombre"
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
        e.stopPropagation();
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: '100%',
        padding: '3px 6px',
        fontSize: 'inherit',
        fontWeight: 600,
        fontFamily: 'inherit',
        textAlign: align,
        color: 'var(--text-primary)',
        backgroundColor: 'var(--bg)',
        border: '2px solid var(--accent)',
        borderRadius: '6px',
        outline: 'none',
      }}
    />
  );
};
