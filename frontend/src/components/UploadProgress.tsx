import React from 'react';
import { UploadProgress as UploadProgressType } from '../types';

interface UploadProgressProps {
  uploads: UploadProgressType[];
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ uploads }) => {
  if (uploads.length === 0) return null;

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ marginBottom: '12px', color: '#333' }}>Uploading Files</h3>
      {uploads.map((upload) => (
        <div
          key={upload.filename}
          style={{
            marginBottom: '12px',
            padding: '12px',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            backgroundColor: '#fff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontWeight: 'bold', color: '#333' }}>
              {upload.filename}
            </span>
            <span
              style={{
                color:
                  upload.status === 'success'
                    ? '#28a745'
                    : upload.status === 'error'
                    ? '#dc3545'
                    : '#007bff',
                fontSize: '14px',
              }}
            >
              {upload.status === 'success' && '✓ Complete'}
              {upload.status === 'error' && '✗ Failed'}
              {upload.status === 'uploading' && `${upload.progress}%`}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e0e0e0',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${upload.progress}%`,
                height: '100%',
                backgroundColor:
                  upload.status === 'success'
                    ? '#28a745'
                    : upload.status === 'error'
                    ? '#dc3545'
                    : '#007bff',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          {upload.error && (
            <div
              style={{
                marginTop: '8px',
                color: '#dc3545',
                fontSize: '14px',
              }}
            >
              {upload.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
