import React from 'react';

export interface MenuEntry {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}

/**
 * Floating menu opened by right click (or the "⋯" button), positioned at
 * the pointer and kept inside the viewport. Closes on any outside click,
 * Escape, resize, or when the user starts scrolling (wheel/touch rather
 * than "scroll" events, which can still be arriving from a scroll that
 * ended just before the menu opened).
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, entries, onClose }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ left: x, top: y });

  React.useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y]);

  React.useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onClose, { passive: true });
    window.addEventListener('touchmove', onClose, { passive: true });
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onClose);
      window.removeEventListener('touchmove', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        zIndex: 900,
        minWidth: '200px',
        padding: '6px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        boxShadow: '0 8px 30px var(--shadow)',
      }}
    >
      {entries.map((entry) => (
        <button
          key={entry.label}
          role="menuitem"
          disabled={entry.disabled}
          onClick={() => {
            onClose();
            entry.onSelect();
          }}
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
            cursor: entry.disabled ? 'default' : 'pointer',
            opacity: entry.disabled ? 0.45 : 1,
            color: entry.danger ? 'var(--danger)' : 'var(--text-primary)',
          }}
          onMouseEnter={(e) => {
            if (!entry.disabled) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span style={{ display: 'flex', width: '16px' }}>{entry.icon}</span>
          {entry.label}
        </button>
      ))}
    </div>
  );
};
