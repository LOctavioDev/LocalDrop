import React from 'react';

export interface DialogAction {
  id: string;
  label: string;
  tone?: 'primary' | 'danger' | 'neutral';
}

export interface DialogOptions {
  title: string;
  message?: React.ReactNode;
  actions: DialogAction[];
  /** Label of the dismiss button; omit for no cancel button (e.g. alerts) */
  cancelLabel?: string;
  /** Shows an "apply to all" checkbox with this label */
  applyToAllLabel?: string;
}

export interface DialogResult {
  /** Chosen action id, or null if dismissed */
  action: string | null;
  applyToAll: boolean;
}

interface DialogApi {
  ask: (options: DialogOptions) => Promise<DialogResult>;
  confirm: (title: string, message: React.ReactNode, confirmLabel: string) => Promise<boolean>;
  alert: (title: string, message?: React.ReactNode) => Promise<void>;
}

const DialogContext = React.createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = React.useContext(DialogContext);
  if (!api) throw new Error('useDialog must be used inside a DialogProvider');
  return api;
}

const toneStyles: Record<NonNullable<DialogAction['tone']>, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none' },
  danger: { backgroundColor: 'var(--danger)', color: '#fff', border: 'none' },
  neutral: {
    backgroundColor: 'var(--surface-hover)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  },
};

export const dialogButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '980px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
};

/**
 * Promise-based replacement for alert/confirm, so flows like "this name
 * already exists — replace or keep both?" can await the user's choice.
 */
export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [current, setCurrent] = React.useState<
    (DialogOptions & { resolve: (result: DialogResult) => void }) | null
  >(null);
  const [applyToAll, setApplyToAll] = React.useState(false);
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve());

  const api = React.useMemo<DialogApi>(() => {
    // One dialog at a time: later requests wait for earlier ones
    const ask = (options: DialogOptions) => {
      const result = queueRef.current.then(
        () =>
          new Promise<DialogResult>((resolve) => {
            setApplyToAll(false);
            setCurrent({ ...options, resolve });
          })
      );
      queueRef.current = result;
      return result;
    };

    return {
      ask,
      confirm: async (title, message, confirmLabel) =>
        (
          await ask({
            title,
            message,
            actions: [{ id: 'confirm', label: confirmLabel, tone: 'danger' }],
            cancelLabel: 'Cancelar',
          })
        ).action === 'confirm',
      alert: async (title, message) => {
        await ask({ title, message, actions: [{ id: 'ok', label: 'Aceptar', tone: 'primary' }] });
      },
    };
  }, []);

  const close = React.useCallback(
    (action: string | null) => {
      if (!current) return;
      current.resolve({ action, applyToAll });
      setCurrent(null);
    },
    [current, applyToAll]
  );

  React.useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, close]);

  // A stray Enter shouldn't confirm something destructive, so when the
  // default (last) action is dangerous, start on Cancel instead
  const focusCancel =
    !!current?.cancelLabel && current.actions[current.actions.length - 1]?.tone === 'danger';

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(null);
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
            aria-label={current.title}
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 12px 40px var(--shadow)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '17px' }}>
              {current.title}
            </h3>
            {current.message && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.45 }}>
                {current.message}
              </div>
            )}
            {current.applyToAllLabel && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '14px',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                />
                {current.applyToAllLabel}
              </label>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '20px',
              }}
            >
              {current.cancelLabel && (
                <button
                  autoFocus={focusCancel}
                  onClick={() => close(null)}
                  style={{ ...dialogButtonStyle, ...toneStyles.neutral }}
                >
                  {current.cancelLabel}
                </button>
              )}
              {current.actions.map((action, index) => (
                <button
                  key={action.id}
                  autoFocus={!focusCancel && index === current.actions.length - 1}
                  onClick={() => close(action.id)}
                  style={{ ...dialogButtonStyle, ...toneStyles[action.tone ?? 'neutral'] }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
