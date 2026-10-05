import React, { useCallback, useState } from 'react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
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

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected, disabled]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;

      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesSelected(Array.from(files));
      }
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    },
    [onFilesSelected, disabled]
  );

  return (
    <div
      style={{
        border: isDragging ? '3px dashed #007bff' : '2px dashed #ccc',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: isDragging ? '#f0f8ff' : disabled ? '#f5f5f5' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s ease',
        marginBottom: '20px',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>
        {isDragging ? '📥' : '📁'}
      </div>
      <h2 style={{ margin: '0 0 16px 0', color: '#333' }}>
        {isDragging ? 'Drop files here' : 'Drag & Drop Files'}
      </h2>
      <p style={{ margin: '0 0 16px 0', color: '#666' }}>
        or
      </p>
      <label
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: disabled ? '#ccc' : '#007bff',
          color: 'white',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
      >
        Select Files
        <input
          type="file"
          multiple
          onChange={handleFileInputChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
};
