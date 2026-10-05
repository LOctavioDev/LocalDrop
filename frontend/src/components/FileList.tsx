import React from 'react';
import { FileInfo } from '../types';
import { api } from '../services/api';

interface FileListProps {
  files: FileInfo[];
  onFileDeleted: () => void;
}

export const FileList: React.FC<FileListProps> = ({ files, onFileDeleted }) => {
  const [deletingFiles, setDeletingFiles] = React.useState<Set<string>>(new Set());

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
          color: '#999',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
        }}
      >
        <p style={{ fontSize: '18px', margin: 0 }}>
          No files uploaded yet. Drop some files to get started!
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: '16px', color: '#333' }}>
        Available Files ({files.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {files.map((file) => (
          <div
            key={file.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 'bold',
                  color: '#333',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '4px',
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                {api.formatFileSize(file.size)} • {api.formatDate(file.uploadedAt)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
              <button
                onClick={() => handleDownload(file.name)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0056b3';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#007bff';
                }}
              >
                Download
              </button>
              <button
                onClick={() => handleDelete(file.name)}
                disabled={deletingFiles.has(file.name)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: deletingFiles.has(file.name) ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: deletingFiles.has(file.name) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
                onMouseEnter={(e) => {
                  if (!deletingFiles.has(file.name)) {
                    e.currentTarget.style.backgroundColor = '#c82333';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!deletingFiles.has(file.name)) {
                    e.currentTarget.style.backgroundColor = '#dc3545';
                  }
                }}
              >
                {deletingFiles.has(file.name) ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
