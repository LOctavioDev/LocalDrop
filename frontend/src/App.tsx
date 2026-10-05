import { useState, useEffect, useCallback } from 'react';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { UploadProgress } from './components/UploadProgress';
import { api } from './services/api';
import { FileInfo, UploadProgress as UploadProgressType } from './types';

function App() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploads, setUploads] = useState<UploadProgressType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      setError(null);
      const fileList = await api.getFiles();
      setFiles(fileList);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load files. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    // Refresh file list every 5 seconds
    const interval = setInterval(loadFiles, 5000);
    return () => clearInterval(interval);
  }, [loadFiles]);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    // Initialize upload progress for each file
    const newUploads: UploadProgressType[] = selectedFiles.map((file) => ({
      filename: file.name,
      progress: 0,
      status: 'uploading',
    }));

    setUploads((prev) => [...prev, ...newUploads]);

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const uploadIndex = uploads.length + i;

      try {
        await api.uploadFile(file, (progress) => {
          setUploads((prev) => {
            const updated = [...prev];
            updated[uploadIndex] = {
              ...updated[uploadIndex],
              progress,
            };
            return updated;
          });
        });

        // Mark as successful
        setUploads((prev) => {
          const updated = [...prev];
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            progress: 100,
            status: 'success',
          };
          return updated;
        });

        // Reload file list
        await loadFiles();
      } catch (err) {
        console.error('Upload failed:', err);
        setUploads((prev) => {
          const updated = [...prev];
          updated[uploadIndex] = {
            ...updated[uploadIndex],
            status: 'error',
            error: 'Upload failed',
          };
          return updated;
        });
      }
    }

    // Clear completed uploads after 3 seconds
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status === 'uploading'));
    }, 3000);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        padding: '20px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <header
          style={{
            textAlign: 'center',
            marginBottom: '40px',
          }}
        >
          <h1
            style={{
              fontSize: '48px',
              margin: '0 0 8px 0',
              color: '#333',
            }}
          >
            LocalDrop
          </h1>
          <p
            style={{
              fontSize: '18px',
              color: '#666',
              margin: 0,
            }}
          >
            Share files across your local network
          </p>
        </header>

        {error && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              marginBottom: '20px',
              border: '1px solid #f5c6cb',
            }}
          >
            {error}
          </div>
        )}

        <DropZone
          onFilesSelected={handleFilesSelected}
          disabled={uploads.some((u) => u.status === 'uploading')}
        />

        <UploadProgress uploads={uploads} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            Loading files...
          </div>
        ) : (
          <FileList files={files} onFileDeleted={loadFiles} />
        )}
      </div>
    </div>
  );
}

export default App;
