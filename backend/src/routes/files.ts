import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { upload } from '../middleware/upload';
import { STORAGE_DIR, validateFilePath, getFileInfo } from '../utils/fileUtils';

const router = express.Router();

/**
 * GET /api/files
 * List all files in storage
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Read all files from storage directory
    const files = await fs.readdir(STORAGE_DIR);

    // Get file information for each file
    const fileInfoPromises = files.map(async (filename) => {
      try {
        return await getFileInfo(filename);
      } catch (error) {
        console.error(`Error reading file info for ${filename}:`, error);
        return null;
      }
    });

    const filesInfo = (await Promise.all(fileInfoPromises)).filter(
      (info) => info !== null
    );

    res.json(filesInfo);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * POST /api/files
 * Upload a new file
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get file information
    const fileInfo = await getFileInfo(req.file.filename);

    res.status(201).json({
      message: 'File uploaded successfully',
      file: fileInfo,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * GET /api/files/:filename/download
 * Download a specific file
 */
router.get('/:filename/download', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { valid, fullPath } = validateFilePath(filename);

    if (!valid) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Send file for download
    res.download(fullPath, filename, (error) => {
      if (error) {
        console.error('Error downloading file:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * DELETE /api/files/:filename
 * Delete a specific file
 */
router.delete('/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { valid, fullPath } = validateFilePath(filename);

    if (!valid) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file
    await fs.unlink(fullPath);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
