import multer from 'multer';
import path from 'path';
import { STORAGE_DIR, getUniqueFilename } from '../utils/fileUtils';

// Configure multer to use disk storage with streams (no memory buffering)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: async (_req, file, cb) => {
    try {
      const uniqueFilename = await getUniqueFilename(file.originalname);
      cb(null, uniqueFilename);
    } catch (error) {
      cb(error as Error, '');
    }
  },
});

// Create multer instance with file size limit (1GB)
export const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max file size
  },
});
