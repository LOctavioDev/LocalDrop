export interface FileInfo {
  name: string;
  size: number;
  uploadedAt: string;
}

export interface UploadProgress {
  filename: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}
