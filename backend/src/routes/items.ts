import express, { Request, Response } from 'express';
import { parentRel, resolveSafePath, baseName } from '../utils/fileUtils';
import { ItemError, deleteItem, parseConflict, relocateItem, statOrNull } from '../utils/items';

const router = express.Router();

function sendItemError(res: Response, error: unknown, action: string) {
  if (error instanceof ItemError) {
    return res.status(error.status).json({ error: error.message, ...error.extra });
  }
  console.error(`Error ${action}:`, error);
  res.status(500).json({ error: `Failed to ${action}` });
}

/**
 * PATCH /api/items
 * Rename a file or folder: { path, newName, conflict? }
 * Responds 409 with a suggestedName if the name is taken and no conflict
 * strategy ("rename" | "replace") was given.
 */
router.patch('/', async (req: Request, res: Response) => {
  try {
    const conflict = parseConflict(req.body.conflict);
    if (conflict === null) {
      return res.status(400).json({ error: 'Invalid conflict strategy' });
    }
    const path = typeof req.body.path === 'string' ? req.body.path : null;
    const item = await relocateItem(path, path === null ? null : parentRel(path), req.body.newName, conflict);
    res.json({ item });
  } catch (error) {
    sendItemError(res, error, 'rename item');
  }
});

/**
 * POST /api/items/move
 * Move a file or folder into another folder: { path, toDir, conflict? }
 * Same 409 behavior as renaming.
 */
router.post('/move', async (req: Request, res: Response) => {
  try {
    const conflict = parseConflict(req.body.conflict);
    if (conflict === null) {
      return res.status(400).json({ error: 'Invalid conflict strategy' });
    }
    const path = typeof req.body.path === 'string' ? req.body.path : null;
    const item = await relocateItem(path, req.body.toDir, path === null ? null : baseName(path), conflict);
    res.json({ item });
  } catch (error) {
    sendItemError(res, error, 'move item');
  }
});

/**
 * DELETE /api/items?path=<item>
 * Delete a file, or a folder with everything inside it
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const item = resolveSafePath(req.query.path);
    if (!item || !item.rel) {
      return res.status(400).json({ error: 'Invalid item path' });
    }
    if (!(await statOrNull(item.full))) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await deleteItem(item);
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    sendItemError(res, error, 'delete item');
  }
});

export default router;
