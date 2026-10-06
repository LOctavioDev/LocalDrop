import fs from 'fs/promises';
import path from 'path';
import { STORAGE_DIR } from './fileUtils';

const ORDER_FILE = path.join(STORAGE_DIR, '.order.json');

/**
 * Reads the saved manual file order. Not critical data (just a UI
 * preference), so any missing/corrupt file quietly resolves to [].
 */
export async function readOrder(): Promise<string[]> {
  try {
    const raw = await fs.readFile(ORDER_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export async function writeOrder(order: string[]): Promise<void> {
  await fs.writeFile(ORDER_FILE, JSON.stringify(order), 'utf-8');
}

/**
 * Removes a filename from the saved order, e.g. after it's deleted.
 */
export async function pruneOrder(filename: string): Promise<void> {
  const order = await readOrder();
  const next = order.filter((name) => name !== filename);
  if (next.length !== order.length) {
    await writeOrder(next);
  }
}
