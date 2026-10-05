import axios from 'axios';
import { FileInfo } from '../types';

const API_BASE_URL = '/api';

export const api = {
  /**
   * Get list of all files
   */
  async getFiles(): Promise<FileInfo[]> {
    const response = await axios.get(`${API_BASE_URL}/files`);
    return response.data;
  },

  /**
   * Upload a file with progress tracking
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<FileInfo> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_BASE_URL}/files`, formData, {
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
   * Download a file
   */
  async downloadFile(filename: string): Promise<void> {
    const response = await axios.get(
      `${API_BASE_URL}/files/${encodeURIComponent(filename)}/download`,
      {
        responseType: 'blob',
      }
    );

    // Create a download link and trigger it
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Delete a file
   */
  async deleteFile(filename: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/files/${encodeURIComponent(filename)}`);
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
};
