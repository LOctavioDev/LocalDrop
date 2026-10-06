import express, { Request, Response } from 'express';
import { ItemInfo, baseName, getItemInfo, walk } from '../utils/fileUtils';

const router = express.Router();

const MAX_RESULTS = 200;

// Case- and accent-insensitive, so "cancion" finds "Canción.mp3"
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * GET /api/search?q=<text>
 * Find files and folders anywhere in storage whose name contains `q`
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? normalize(req.query.q.trim()) : '';
    if (!query) {
      return res.json([]);
    }

    const results: ItemInfo[] = [];
    for await (const entry of walk('')) {
      if (!normalize(baseName(entry.rel)).includes(query)) continue;
      try {
        results.push(await getItemInfo(entry.rel));
      } catch {
        // Vanished mid-search
      }
      if (results.length >= MAX_RESULTS) break;
    }

    res.json(results);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

export default router;
