import axios from 'axios';
import { ConflictStrategy, FolderItem, Item } from '../types';

const API_BASE_URL = '/api';

/**
 * Thrown when a rename/move target name is already taken and no conflict
 * strategy was given, so the UI can ask the user what to do.
 */
export class ConflictError extends Error {
  constructor(public itemName: string, public suggestedName: string) {
    super(`"${itemName}" already exists`);
  }
}

async function withConflict<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const { name, suggestedName } = error.response.data ?? {};
      throw new ConflictError(name, suggestedName);
    }
    throw error;
  }
}

/** Best-effort human-readable message out of a failed request */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No se pudo conectar con el servidor.';
    const message = error.response.data?.error;
    if (typeof message === 'string') return `${fallback} (${message})`;
  }
  return fallback;
}

/**
 * Starts a browser download of a URL the server serves as an attachment.
 * Navigating to it (rather than fetching into a Blob) streams straight to
 * disk, so large files and zips never have to fit in memory.
 */
function triggerDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', '');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const api = {
  /**
   * List the files and folders inside a folder ("" is the root)
   */
  async list(dir: string): Promise<Item[]> {
    const response = await axios.get(`${API_BASE_URL}/files`, { params: { dir } });
    return response.data;
  },

  /**
   * Find files and folders anywhere whose name contains `query`
   */
  async search(query: string): Promise<Item[]> {
    const response = await axios.get(`${API_BASE_URL}/search`, { params: { q: query } });
    return response.data;
  },

  /**
   * Upload a file into a folder (created if missing) with progress tracking.
   * A taken name is kept as "name (2)" unless `conflict` is "replace".
   */
  async uploadFile(
    file: File,
    dir: string,
    conflict: ConflictStrategy = 'rename',
    onProgress?: (progress: number) => void
  ): Promise<Item> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_BASE_URL}/files`, formData, {
      params: { dir, conflict },
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });

    return response.data.file;
  },

  /**
   * Create a folder; a taken name gets "name (2)" etc. Returns the folder
   * actually created.
   */
  async createFolder(parent: string, name: string): Promise<FolderItem> {
    const response = await axios.post(`${API_BASE_URL}/folders`, { parent, name });
    return response.data.folder;
  },

  /**
   * Rename a file or folder. Throws ConflictError if the name is taken
   * and no `conflict` strategy was given.
   */
  async renameItem(path: string, newName: string, conflict?: ConflictStrategy): Promise<Item> {
    const response = await withConflict(
      axios.patch(`${API_BASE_URL}/items`, { path, newName, conflict })
    );
    return response.data.item;
  },

  /**
   * Move a file or folder into another folder. Throws ConflictError like
   * renameItem.
   */
  async moveItem(path: string, toDir: string, conflict?: ConflictStrategy): Promise<Item> {
    const response = await withConflict(
      axios.post(`${API_BASE_URL}/items/move`, { path, toDir, conflict })
    );
    return response.data.item;
  },

  /**
   * Delete a file, or a folder with everything inside it
   */
  async deleteItem(path: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/items`, { params: { path } });
  },

  downloadFile(path: string): void {
    triggerDownload(`${API_BASE_URL}/files/download?path=${encodeURIComponent(path)}`);
  },

  /**
   * Download a folder (the root for "") as a zip
   */
  downloadFolder(path: string): void {
    triggerDownload(`${API_BASE_URL}/folders/download?path=${encodeURIComponent(path)}`);
  },

  /**
   * Thumbnail URL for a file; versioned by modification time so a replaced
   * file doesn't keep showing its old cached thumbnail.
   */
  thumbnailUrl(path: string, uploadedAt: string): string {
    const version = new Date(uploadedAt).getTime();
    return `${API_BASE_URL}/files/thumbnail?path=${encodeURIComponent(path)}&v=${version}`;
  },

  /**
   * Get a folder's saved manual order (shared across all devices)
   */
  async getOrder(dir: string): Promise<string[]> {
    const response = await axios.get(`${API_BASE_URL}/files/order`, { params: { dir } });
    return response.data;
  },

  /**
   * Save a folder's manual order (shared across all devices)
   */
  async saveOrder(dir: string, order: string[]): Promise<void> {
    await axios.put(`${API_BASE_URL}/files/order`, { dir, order });
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  },

  formatItemCount(count: number): string {
    return count === 1 ? '1 elemento' : `${count} elementos`;
  },
};
