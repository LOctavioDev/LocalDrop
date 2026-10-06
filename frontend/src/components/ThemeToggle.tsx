import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      style={{
        position: 'relative',
        width: '56px',
        height: '30px',
        borderRadius: '999px',
        border: 'none',
        padding: '3px',
        cursor: 'pointer',
        backgroundColor: isDark ? 'var(--accent)' : 'var(--border)',
        transition: 'background-color 0.3s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transform: isDark ? 'translateX(26px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isDark ? <Moon size={14} color="#1c1c1e" /> : <Sun size={14} color="#f5a623" />}
      </span>
    </button>
  );
};
