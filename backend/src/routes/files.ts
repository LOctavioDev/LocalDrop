import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import { uploadSingleFile, resolveUploadDir } from '../middleware/upload';
import {
  SafePath,
  getItemInfo,
  isValidName,
  joinRel,
  listDir,
  resolveSafePath,
  sanitizeName,
  uniqueName,
} from '../utils/fileUtils';
import { getOrCreateThumbnail, deleteThumbnail } from '../utils/thumbnails';
import { readOrder, writeOrder } from '../utils/order';
import { deleteItem, parseConflict, statOrNull } from '../utils/items';

const router = express.Router();

/**
 * Multer (via busboy) decodes the multipart filename as latin1, which
 * mangles the UTF-8 names browsers actually send ("Año" -> "AÃ±o").
 * Re-decodes them, leaving anything that isn't valid UTF-8 untouched.
 */
function decodeOriginalName(name: string): string {
  if (/[^\x00-\xff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/**
 * Resolves a `dir` query param to an existing folder, or sends the error
 * response and returns null.
 */
async function resolveExistingDir(dirParam: unknown, res: Response): Promise<SafePath | null> {
  const dir = resolveSafePath(dirParam);
  if (!dir) {
    res.status(400).json({ error: 'Invalid folder path' });
    return null;
  }
  if (!(await statOrNull(dir.full))?.isDirectory()) {
    res.status(404).json({ error: 'Folder not found' });
    return null;
  }
  return dir;
}

/**
 * Resolves a `path` query param to an existing file, or sends the error
 * response and returns null.
 */
async function resolveExistingFile(pathParam: unknown, res: Response): Promise<SafePath | null> {
  const file = resolveSafePath(pathParam);
  if (!file || !file.rel) {
    res.status(400).json({ error: 'Invalid file path' });
    return null;
  }
  if (!(await statOrNull(file.full))?.isFile()) {
    res.status(404).json({ error: 'File not found' });
    return null;
  }
  return file;
}

/**
 * GET /api/files?dir=<folder>
 * List the files and folders inside a folder (the root by default)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const dir = await resolveExistingDir(req.query.dir, res);
    if (!dir) return;

    res.json(await listDir(dir.rel));
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * POST /api/files?dir=<folder>&conflict=rename|replace
 * Upload a new file into a folder (created if missing). If the name is
 * taken, "replace" overwrites it; otherwise it's saved as "name (2)" etc.
 */
router.post('/', resolveUploadDir, uploadSingleFile, async (req: Request, res: Response) => {
  const tempPath = req.file?.path;

  try {
    if (!req.file || !tempPath) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const conflict = parseConflict(req.query.conflict);
    if (conflict === null) {
      await fs.unlink(tempPath).catch(() => {});
      return res.status(400).json({ error: 'Invalid conflict strategy' });
    }

    const dir = res.locals.uploadDir as SafePath;
    let name = sanitizeName(decodeOriginalName(req.file.originalname));
    let target = resolveSafePath(joinRel(dir.rel, name))!;

    if (await statOrNull(target.full)) {
      if (conflict === 'replace') {
        await deleteItem(target);
      } else {
        name = uniqueName(dir.full, name);
        target = resolveSafePath(joinRel(dir.rel, name))!;
      }
    }

    await fs.rename(tempPath, target.full);
    await deleteThumbnail(target.rel);

    res.status(201).json({
      message: 'File uploaded successfully',
      file: await getItemInfo(target.rel),
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    if (tempPath) await fs.unlink(tempPath).catch(() => {});
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * GET /api/files/order?dir=<folder>
 * Get a folder's saved manual order (shared across all devices)
 */
router.get('/order', async (req: Request, res: Response) => {
  try {
    const dir = resolveSafePath(req.query.dir);
    if (!dir) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }
    res.json(await readOrder(dir.rel));
  } catch (error) {
    console.error('Error reading file order:', error);
    res.status(500).json({ error: 'Failed to read file order' });
  }
});

/**
 * PUT /api/files/order
 * Save a folder's manual order: { dir, order: [names...] }
 */
router.put('/order', async (req: Request, res: Response) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || !order.every((entry) => typeof entry === 'string')) {
      return res.status(400).json({ error: 'order must be an array of names' });
    }

    const dir = await resolveExistingDir(req.body.dir, res);
    if (!dir) return;

    // Only keep entries that are valid, existing items in that folder
    const existing = new Set(await fs.readdir(dir.full));
    const validated = order.filter((name) => isValidName(name) && existing.has(name));

    await writeOrder(dir.rel, validated);
    res.json(validated);
  } catch (error) {
    console.error('Error saving file order:', error);
    res.status(500).json({ error: 'Failed to save file order' });
  }
});

/**
 * GET /api/files/download?path=<file>
 * Download a specific file
 */
router.get('/download', async (req: Request, res: Response) => {
  try {
    const file = await resolveExistingFile(req.query.path, res);
    if (!file) return;

    res.download(file.full, file.rel.slice(file.rel.lastIndexOf('/') + 1), (error) => {
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
 * GET /api/files/thumbnail?path=<file>
 * Serve a cached (or freshly generated) thumbnail for an image/PDF file
 */
router.get('/thumbnail', async (req: Request, res: Response) => {
  try {
    const file = await resolveExistingFile(req.query.path, res);
    if (!file) return;

    const thumbPath = await getOrCreateThumbnail(file.rel, file.full);

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

export default router;
