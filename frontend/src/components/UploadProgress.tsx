import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { UploadProgress as UploadProgressType } from '../types';

interface UploadProgressProps {
  uploads: UploadProgressType[];
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ uploads }) => {
  if (uploads.length === 0) return null;

  const statusColor = (status: UploadProgressType['status']) =>
    status === 'success' ? 'var(--success)' : status === 'error' ? 'var(--danger)' : 'var(--accent)';

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>Uploading Files</h3>
      {uploads.map((upload) => (
        <div
          key={upload.id}
          style={{
            marginBottom: '12px',
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            backgroundColor: 'var(--surface)',
            transition: 'background-color 0.3s ease, border-color 0.3s ease',
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
            <span
              title={upload.filename}
              style={{
                fontWeight: 'bold',
                color: 'var(--text-primary)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginRight: '12px',
              }}
            >
              {upload.filename}
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: statusColor(upload.status),
                fontSize: '14px',
              }}
            >
              {upload.status === 'success' && (
                <>
                  <CheckCircle2 size={16} /> Complete
                </>
              )}
              {upload.status === 'error' && (
                <>
                  <XCircle size={16} /> Failed
                </>
              )}
              {upload.status === 'uploading' && `${upload.progress}%`}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'var(--thumb-bg)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${upload.progress}%`,
                height: '100%',
                backgroundColor: statusColor(upload.status),
                transition: 'width 0.3s ease, background-color 0.3s ease',
              }}
            />
          </div>
          {upload.error && (
            <div
              style={{
                marginTop: '8px',
                color: 'var(--danger)',
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
