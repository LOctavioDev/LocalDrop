import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { upload } from '../middleware/upload';
import { STORAGE_DIR, validateFilePath, getFileInfo } from '../utils/fileUtils';
import { getOrCreateThumbnail, deleteThumbnail } from '../utils/thumbnails';
import { readOrder, writeOrder, pruneOrder } from '../utils/order';

const router = express.Router();

/**
 * GET /api/files
 * List all files in storage
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Read all files from storage directory, skipping hidden entries
    // like the .thumbnails cache directory
    const entries = await fs.readdir(STORAGE_DIR);
    const files = entries.filter((filename) => !filename.startsWith('.'));

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
 * GET /api/files/order
 * Get the saved manual file order (shared across all devices)
 */
router.get('/order', async (_req: Request, res: Response) => {
  try {
    const order = await readOrder();
    res.json(order);
  } catch (error) {
    console.error('Error reading file order:', error);
    res.status(500).json({ error: 'Failed to read file order' });
  }
});

/**
 * PUT /api/files/order
 * Save a new manual file order (shared across all devices)
 */
router.put('/order', async (req: Request, res: Response) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || !order.every((entry) => typeof entry === 'string')) {
      return res.status(400).json({ error: 'order must be an array of filenames' });
    }

    // Only keep entries that are valid, existing filenames
    const validated = order.filter((filename) => {
      const { valid, fullPath } = validateFilePath(filename);
      return valid && existsSync(fullPath);
    });

    await writeOrder(validated);
    res.json(validated);
  } catch (error) {
    console.error('Error saving file order:', error);
    res.status(500).json({ error: 'Failed to save file order' });
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
 * GET /api/files/:filename/thumbnail
 * Serve a cached (or freshly generated) thumbnail for an image/PDF file
 */
router.get('/:filename/thumbnail', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { valid, fullPath } = validateFilePath(filename);

    if (!valid) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const thumbPath = await getOrCreateThumbnail(filename, fullPath);

    if (!thumbPath) {
      return res.status(404).json({ error: 'No thumbnail available' });
    }

    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(thumbPath);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
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

    // Delete the file and any cached thumbnail / saved order position for it
    await fs.unlink(fullPath);
    await deleteThumbnail(filename);
    await pruneOrder(filename);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
