import React, { useCallback, useState } from 'react';
import { FolderOpen, UploadCloud } from 'lucide-react';
import { UploadBatch, batchFromDataTransfer, batchFromFileList } from '../utils/droppedFiles';

interface DropZoneProps {
  /** Receives the dropped/picked files, including whole folder trees */
  onFilesSelected: (batch: Promise<UploadBatch>) => void;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      if (e.dataTransfer.files.length > 0) {
        onFilesSelected(batchFromDataTransfer(e.dataTransfer));
      }
    },
    [onFilesSelected, disabled]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;

      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesSelected(Promise.resolve(batchFromFileList(files)));
      }
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    },
    [onFilesSelected, disabled]
  );

  return (
    <div
      style={{
        border: isDragging ? '3px dashed var(--accent)' : '2px dashed var(--border)',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: isDragging ? 'var(--surface-hover)' : disabled ? 'var(--surface-hover)' : 'var(--surface)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s ease',
        marginBottom: '20px',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
          color: isDragging ? 'var(--accent)' : 'var(--text-secondary)',
          transition: 'color 0.3s ease',
        }}
      >
        {isDragging ? <UploadCloud size={48} /> : <FolderOpen size={48} />}
      </div>
      <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
        {isDragging ? 'Drop files here' : 'Drag & Drop Files or Folders'}
      </h2>
      <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
        or
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <label style={pickerStyle(disabled, true)}>
          Select Files
          <input
            type="file"
            multiple
            onChange={handleFileInputChange}
            disabled={disabled}
            style={{ display: 'none' }}
          />
        </label>
        <label style={pickerStyle(disabled, false)}>
          Select Folder
          <input
            type="file"
            // Folder picker: uploads the whole tree, keeping its structure
            {...{ webkitdirectory: '', directory: '' }}
            onChange={handleFileInputChange}
            disabled={disabled}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
};

function pickerStyle(disabled: boolean | undefined, primary: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: disabled ? 'var(--disabled)' : primary ? 'var(--accent)' : 'var(--surface-hover)',
    color: primary || disabled ? 'var(--accent-contrast)' : 'var(--text-primary)',
    border: primary ? 'none' : '1px solid var(--border)',
    borderRadius: '980px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    transition: 'background-color 0.2s ease',
  };
}
