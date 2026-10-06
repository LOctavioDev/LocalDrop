import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import archiver from 'archiver';
import {
  getItemInfo,
  isValidName,
  joinRel,
  resolveSafePath,
  uniqueName,
  walk,
} from '../utils/fileUtils';
import { statOrNull } from '../utils/items';

const router = express.Router();

// Name of the zip (and its top-level folder) when downloading the root
const ROOT_ZIP_NAME = 'ETHDrop';

/**
 * POST /api/folders
 * Create a folder: { parent, name }. A taken name gets "name (2)" etc.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const parent = resolveSafePath(req.body.parent);
    if (!parent) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }
    if (!(await statOrNull(parent.full))?.isDirectory()) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const requested = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!isValidName(requested)) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    const name = uniqueName(parent.full, requested, true);
    const folder = resolveSafePath(joinRel(parent.rel, name))!;
    await fs.mkdir(folder.full);

    res.status(201).json({ folder: await getItemInfo(folder.rel) });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * GET /api/folders/download?path=<folder>
 * Download a folder (the root by default) as a zip, streamed on the fly
 */
router.get('/download', async (req: Request, res: Response) => {
  try {
    const folder = resolveSafePath(req.query.path);
    if (!folder) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }
    if (!(await statOrNull(folder.full))?.isDirectory()) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const zipRoot = folder.rel ? folder.rel.slice(folder.rel.lastIndexOf('/') + 1) : ROOT_ZIP_NAME;
    const prefixLength = folder.rel ? folder.rel.length + 1 : 0;

    // Most shared files (photos, videos, PDFs) are already compressed, so
    // a light level keeps zipping fast without making it much bigger
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('warning', (error) => console.warn('Zip warning:', error));
    archive.on('error', (error) => {
      console.error('Error zipping folder:', error);
      res.destroy(error);
    });

    res.attachment(`${zipRoot}.zip`);
    archive.pipe(res);

    archive.append(Buffer.alloc(0), { name: `${zipRoot}/` });
    for await (const entry of walk(folder.rel)) {
      const name = `${zipRoot}/${entry.rel.slice(prefixLength)}`;
      if (entry.isFolder) {
        archive.append(Buffer.alloc(0), { name: `${name}/` });
      } else {
        archive.file(resolveSafePath(entry.rel)!.full, { name });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error downloading folder:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download folder' });
    }
  }
});

export default router;
