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

export type SortBy = 'name' | 'date' | 'size' | 'type' | 'custom';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';
