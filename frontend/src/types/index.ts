export interface FileItem {
  type: 'file';
  name: string;
  /** Path relative to the storage root, "/"-separated */
  path: string;
  size: number;
  uploadedAt: string;
}

export interface FolderItem {
  type: 'folder';
  name: string;
  path: string;
  /** Number of files and folders directly inside it */
  itemCount: number;
  uploadedAt: string;
}

export type Item = FileItem | FolderItem;

/** How to resolve a name that's already taken: keep both, or overwrite */
export type ConflictStrategy = 'rename' | 'replace';

export interface UploadProgress {
  id: number;
  filename: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export type SortBy = 'name' | 'date' | 'size' | 'type' | 'custom';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';
