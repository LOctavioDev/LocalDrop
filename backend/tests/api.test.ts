import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import cors from 'cors';
import sharp from 'sharp';
import filesRouter from '../src/routes/files';
import { ensureStorageDir, STORAGE_DIR } from '../src/utils/fileUtils';

// Create test app
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/files', filesRouter);

describe('LocalDrop API Tests', () => {
  beforeAll(async () => {
    // Ensure storage directory exists (STORAGE_DIR is an isolated temp dir
    // for tests, set up in tests/setup-env.ts — never the real one)
    await ensureStorageDir();
  });

  afterAll(async () => {
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up test files (and the .thumbnails cache dir) after each test
    try {
      const entries = await fs.readdir(STORAGE_DIR);
      await Promise.all(
        entries.map((entry) =>
          fs.rm(path.join(STORAGE_DIR, entry), { recursive: true, force: true })
        )
      );
    } catch (error) {
      // Ignore errors if directory is empty
    }
  });

  describe('GET /api/files', () => {
    it('should return empty array when no files exist', async () => {
      const response = await request(app).get('/api/files');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should list uploaded files', async () => {
      // Upload a file first
      const testContent = 'Test file content';
      const testFilePath = path.join(STORAGE_DIR, 'test.txt');
      await fs.writeFile(testFilePath, testContent);

      const response = await request(app).get('/api/files');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('name', 'test.txt');
      expect(response.body[0]).toHaveProperty('size');
      expect(response.body[0]).toHaveProperty('uploadedAt');
    });
  });

  describe('POST /api/files', () => {
    it('should upload a file successfully', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test content'), 'upload-test.txt');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'File uploaded successfully');
      expect(response.body.file).toHaveProperty('name', 'upload-test.txt');

      // Verify file exists on disk
      const filePath = path.join(STORAGE_DIR, 'upload-test.txt');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should handle duplicate filenames by adding timestamp', async () => {
      // Upload first file
      await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('First'), 'duplicate.txt');

      // Upload second file with same name
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Second'), 'duplicate.txt');

      expect(response.status).toBe(201);
      // Filename should have timestamp appended
      expect(response.body.file.name).toMatch(/duplicate-\d+\.txt/);
    });

    it('should return error when no file provided', async () => {
      const response = await request(app).post('/api/files');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'No file provided');
    });
  });

  describe('GET /api/files/:filename/download', () => {
    it('should download an existing file', async () => {
      // Create a test file
      const testContent = 'Download test content';
      const testFilePath = path.join(STORAGE_DIR, 'download-test.txt');
      await fs.writeFile(testFilePath, testContent);

      const response = await request(app).get('/api/files/download-test.txt/download');

      expect(response.status).toBe(200);
      expect(response.text).toBe(testContent);
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app).get('/api/files/nonexistent.txt/download');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'File not found');
    });

    it('should prevent path traversal attacks', async () => {
      const response = await request(app).get('/api/files/..%2F..%2Fetc%2Fpasswd/download');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/files/:filename', () => {
    it('should delete an existing file', async () => {
      // Create a test file
      const testFilePath = path.join(STORAGE_DIR, 'delete-test.txt');
      await fs.writeFile(testFilePath, 'To be deleted');

      const response = await request(app).delete('/api/files/delete-test.txt');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'File deleted successfully');

      // Verify file is deleted
      expect(existsSync(testFilePath)).toBe(false);
    });

    it('should return 404 when deleting non-existent file', async () => {
      const response = await request(app).delete('/api/files/nonexistent.txt');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'File not found');
    });

    it('should prevent path traversal in delete operations', async () => {
      const response = await request(app).delete('/api/files/../../../etc/passwd');

      expect(response.status).toBe(404);
    });
  });

  describe('GET and PUT /api/files/order', () => {
    it('should return an empty array when no order has been saved', async () => {
      const response = await request(app).get('/api/files/order');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should save and return a custom order', async () => {
      await fs.writeFile(path.join(STORAGE_DIR, 'a.txt'), 'A');
      await fs.writeFile(path.join(STORAGE_DIR, 'b.txt'), 'B');

      const putResponse = await request(app)
        .put('/api/files/order')
        .send({ order: ['b.txt', 'a.txt'] });

      expect(putResponse.status).toBe(200);
      expect(putResponse.body).toEqual(['b.txt', 'a.txt']);

      const getResponse = await request(app).get('/api/files/order');
      expect(getResponse.body).toEqual(['b.txt', 'a.txt']);
    });

    it('should drop filenames that do not exist on disk', async () => {
      await fs.writeFile(path.join(STORAGE_DIR, 'real.txt'), 'real');

      const response = await request(app)
        .put('/api/files/order')
        .send({ order: ['real.txt', 'ghost.txt'] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(['real.txt']);
    });

    it('should reject a non-array order', async () => {
      const response = await request(app)
        .put('/api/files/order')
        .send({ order: 'not-an-array' });

      expect(response.status).toBe(400);
    });

    it('should remove a deleted file from the saved order', async () => {
      await fs.writeFile(path.join(STORAGE_DIR, 'keep.txt'), 'keep');
      await fs.writeFile(path.join(STORAGE_DIR, 'gone.txt'), 'gone');

      await request(app)
        .put('/api/files/order')
        .send({ order: ['gone.txt', 'keep.txt'] });

      await request(app).delete('/api/files/gone.txt');

      const response = await request(app).get('/api/files/order');
      expect(response.body).toEqual(['keep.txt']);
    });
  });

  describe('GET /api/files/:filename/thumbnail', () => {
    it('should generate and serve a thumbnail for an image file', async () => {
      const imageBuffer = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      await fs.writeFile(path.join(STORAGE_DIR, 'thumb-test.jpg'), imageBuffer);

      const response = await request(app).get('/api/files/thumb-test.jpg/thumbnail');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('should return 404 for file types without thumbnail support', async () => {
      await fs.writeFile(path.join(STORAGE_DIR, 'thumb-test.txt'), 'not an image');

      const response = await request(app).get('/api/files/thumb-test.txt/thumbnail');

      expect(response.status).toBe(404);
    });

    it('should return 404 for a non-existent file', async () => {
      const response = await request(app).get('/api/files/nonexistent.jpg/thumbnail');

      expect(response.status).toBe(404);
    });
  });

  describe('Security Tests', () => {
    it('should sanitize filenames with path separators', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test'), '../../evil.txt');

      expect(response.status).toBe(201);
      // Should remove path separators
      expect(response.body.file.name).toBe('evil.txt');
    });

    it('should handle filenames with null bytes', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test'), 'file\0name.txt');

      expect(response.status).toBe(201);
      // Should remove null bytes
      expect(response.body.file.name).toBe('filename.txt');
    });
  });
});
