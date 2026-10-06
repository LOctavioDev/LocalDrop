import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { SafePath, resolveSafePath } from '../utils/fileUtils';

/**
 * Validates the `dir` query param an upload goes into and stores the
 * resolved folder in res.locals.uploadDir. Missing folders are created,
 * so whole folder trees can be uploaded file by file.
 */
export async function resolveUploadDir(req: Request, res: Response, next: NextFunction) {
  const dir = resolveSafePath(req.query.dir);
  if (!dir) {
    return res.status(400).json({ error: 'Invalid folder path' });
  }

  try {
    await fs.mkdir(dir.full, { recursive: true });
  } catch {
    return res.status(409).json({ error: 'Cannot create folder there' });
  }

  res.locals.uploadDir = dir;
  next();
}

// Uploads stream to disk (no memory buffering) under a hidden temporary
// name; the route renames them into place once complete, which is where
// name conflicts get resolved.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, (req.res!.locals.uploadDir as SafePath).full);
  },
  filename: (_req, _file, cb) => {
    cb(null, `.upload-${randomUUID()}`);
  },
});

// Create multer instance with file size limit (1GB)
const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max file size
  },
});

/**
 * Receives a single "file" field, answering malformed uploads with a 400
 * (413 when over the size limit) instead of falling through as a 500.
 */
export function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    console.error('Rejected upload:', error);
    res.status(400).json({ error: 'Malformed upload' });
  });
}
