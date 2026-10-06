import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import cors from 'cors';
import sharp from 'sharp';
import apiRouter from '../src/routes';
import { ensureStorageDir, STORAGE_DIR } from '../src/utils/fileUtils';

// Create test app
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const storagePath = (...segments: string[]) => path.join(STORAGE_DIR, ...segments);

async function writeFile(rel: string, content: string | Buffer = 'content') {
  await fs.mkdir(path.dirname(storagePath(rel)), { recursive: true });
  await fs.writeFile(storagePath(rel), content);
}

async function makeImage() {
  return sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();
}

// Collects a binary response body (e.g. a zip) into a Buffer
function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

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
      await writeFile('test.txt', 'Test file content');

      const response = await request(app).get('/api/files');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ type: 'file', name: 'test.txt', path: 'test.txt' });
      expect(response.body[0]).toHaveProperty('size');
      expect(response.body[0]).toHaveProperty('uploadedAt');
    });

    it('should list folders with their item count', async () => {
      await writeFile('Fotos/a.jpg');
      await writeFile('Fotos/b.jpg');
      await fs.mkdir(storagePath('Vacía'));

      const response = await request(app).get('/api/files');
      const byName = Object.fromEntries(response.body.map((item: any) => [item.name, item]));

      expect(byName['Fotos']).toMatchObject({ type: 'folder', path: 'Fotos', itemCount: 2 });
      expect(byName['Vacía']).toMatchObject({ type: 'folder', itemCount: 0 });
    });

    it('should list the contents of a subfolder', async () => {
      await writeFile('Fotos/2026/viaje.jpg');
      await writeFile('raiz.txt');

      const response = await request(app).get('/api/files').query({ dir: 'Fotos/2026' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ name: 'viaje.jpg', path: 'Fotos/2026/viaje.jpg' });
    });

    it('should hide internal hidden entries', async () => {
      await writeFile('visible.txt');
      await writeFile('.order.json', '{}');
      await fs.mkdir(storagePath('.thumbnails'));

      const response = await request(app).get('/api/files');

      expect(response.body.map((item: any) => item.name)).toEqual(['visible.txt']);
    });

    it('should return 404 for a missing folder', async () => {
      const response = await request(app).get('/api/files').query({ dir: 'nope' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Folder not found');
    });

    it('should return 404 when the dir is a file', async () => {
      await writeFile('file.txt');

      const response = await request(app).get('/api/files').query({ dir: 'file.txt' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/files', () => {
    it('should upload a file successfully', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test content'), 'upload-test.txt');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'File uploaded successfully');
      expect(response.body.file).toMatchObject({ name: 'upload-test.txt', path: 'upload-test.txt' });

      // Verify file exists on disk, with no leftover temp file
      expect(existsSync(storagePath('upload-test.txt'))).toBe(true);
      expect(await fs.readdir(STORAGE_DIR)).toEqual(['upload-test.txt']);
    });

    it('should upload into a folder, creating it if needed', async () => {
      const response = await request(app)
        .post('/api/files')
        .query({ dir: 'Docs/2026' })
        .attach('file', Buffer.from('Nested'), 'nested.txt');

      expect(response.status).toBe(201);
      expect(response.body.file.path).toBe('Docs/2026/nested.txt');
      expect(await fs.readFile(storagePath('Docs', '2026', 'nested.txt'), 'utf-8')).toBe('Nested');
    });

    it('should keep both files on a duplicate name, numbering the new one', async () => {
      await request(app).post('/api/files').attach('file', Buffer.from('First'), 'duplicate.txt');
      const second = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Second'), 'duplicate.txt');
      const third = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Third'), 'duplicate.txt');

      expect(second.status).toBe(201);
      expect(second.body.file.name).toBe('duplicate (2).txt');
      expect(third.body.file.name).toBe('duplicate (3).txt');
      expect(await fs.readFile(storagePath('duplicate.txt'), 'utf-8')).toBe('First');
    });

    it('should replace an existing file when asked to', async () => {
      await writeFile('report.txt', 'Old');

      const response = await request(app)
        .post('/api/files')
        .query({ conflict: 'replace' })
        .attach('file', Buffer.from('New'), 'report.txt');

      expect(response.status).toBe(201);
      expect(response.body.file.name).toBe('report.txt');
      expect(await fs.readFile(storagePath('report.txt'), 'utf-8')).toBe('New');
    });

    it('should reject an unknown conflict strategy', async () => {
      const response = await request(app)
        .post('/api/files')
        .query({ conflict: 'overwrite-everything' })
        .attach('file', Buffer.from('x'), 'x.txt');

      expect(response.status).toBe(400);
      expect(await fs.readdir(STORAGE_DIR)).toEqual([]);
    });

    it('should keep UTF-8 filenames intact', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('x'), 'Canción de año.txt');

      expect(response.status).toBe(201);
      expect(response.body.file.name).toBe('Canción de año.txt');
      expect(existsSync(storagePath('Canción de año.txt'))).toBe(true);
    });

    it('should return error when no file provided', async () => {
      const response = await request(app).post('/api/files');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'No file provided');
    });
  });

  describe('POST /api/folders', () => {
    it('should create a folder', async () => {
      const response = await request(app).post('/api/folders').send({ parent: '', name: 'Fotos' });

      expect(response.status).toBe(201);
      expect(response.body.folder).toMatchObject({ type: 'folder', name: 'Fotos', path: 'Fotos' });
      expect((await fs.stat(storagePath('Fotos'))).isDirectory()).toBe(true);
    });

    it('should create a nested folder', async () => {
      await fs.mkdir(storagePath('Fotos'));

      const response = await request(app)
        .post('/api/folders')
        .send({ parent: 'Fotos', name: '2026' });

      expect(response.status).toBe(201);
      expect(response.body.folder.path).toBe('Fotos/2026');
    });

    it('should number a folder whose name is taken', async () => {
      await request(app).post('/api/folders').send({ parent: '', name: 'Nueva carpeta' });
      const response = await request(app)
        .post('/api/folders')
        .send({ parent: '', name: 'Nueva carpeta' });

      expect(response.body.folder.name).toBe('Nueva carpeta (2)');
    });

    it('should not split a dotted folder name like a file extension', async () => {
      await fs.mkdir(storagePath('v1.2'));

      const response = await request(app).post('/api/folders').send({ parent: '', name: 'v1.2' });

      expect(response.body.folder.name).toBe('v1.2 (2)');
    });

    it.each(['', '   ', 'a/b', 'a\\b', '..', '.hidden'])('should reject the invalid name %p', async (name) => {
      const response = await request(app).post('/api/folders').send({ parent: '', name });

      expect(response.status).toBe(400);
    });

    it('should return 404 for a missing parent', async () => {
      const response = await request(app).post('/api/folders').send({ parent: 'nope', name: 'x' });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/items (rename)', () => {
    it('should rename a file', async () => {
      await writeFile('old.txt', 'data');

      const response = await request(app).patch('/api/items').send({ path: 'old.txt', newName: 'new.txt' });

      expect(response.status).toBe(200);
      expect(response.body.item).toMatchObject({ name: 'new.txt', path: 'new.txt' });
      expect(existsSync(storagePath('old.txt'))).toBe(false);
      expect(await fs.readFile(storagePath('new.txt'), 'utf-8')).toBe('data');
    });

    it('should rename a folder with its contents', async () => {
      await writeFile('Fotos/a.jpg');

      const response = await request(app).patch('/api/items').send({ path: 'Fotos', newName: 'Imágenes' });

      expect(response.status).toBe(200);
      expect(existsSync(storagePath('Imágenes', 'a.jpg'))).toBe(true);
    });

    it('should report a name conflict with a suggested name', async () => {
      await writeFile('a.txt', 'A');
      await writeFile('b.txt', 'B');

      const response = await request(app).patch('/api/items').send({ path: 'a.txt', newName: 'b.txt' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ name: 'b.txt', suggestedName: 'b (2).txt' });
      expect(await fs.readFile(storagePath('b.txt'), 'utf-8')).toBe('B');
    });

    it('should keep both on conflict "rename"', async () => {
      await writeFile('a.txt', 'A');
      await writeFile('b.txt', 'B');

      const response = await request(app)
        .patch('/api/items')
        .send({ path: 'a.txt', newName: 'b.txt', conflict: 'rename' });

      expect(response.body.item.name).toBe('b (2).txt');
      expect(await fs.readFile(storagePath('b.txt'), 'utf-8')).toBe('B');
    });

    it('should overwrite on conflict "replace"', async () => {
      await writeFile('a.txt', 'A');
      await writeFile('b.txt', 'B');

      const response = await request(app)
        .patch('/api/items')
        .send({ path: 'a.txt', newName: 'b.txt', conflict: 'replace' });

      expect(response.body.item.name).toBe('b.txt');
      expect(await fs.readFile(storagePath('b.txt'), 'utf-8')).toBe('A');
      expect(existsSync(storagePath('a.txt'))).toBe(false);
    });

    it("should not count the item being renamed as taken when suggesting a name", async () => {
      await writeFile('notas.txt', 'A');
      await writeFile('notas (2).txt', 'B');

      const conflict = await request(app)
        .patch('/api/items')
        .send({ path: 'notas (2).txt', newName: 'notas.txt' });
      const keepBoth = await request(app)
        .patch('/api/items')
        .send({ path: 'notas (2).txt', newName: 'notas.txt', conflict: 'rename' });

      expect(conflict.body.suggestedName).toBe('notas (2).txt');
      expect(keepBoth.status).toBe(200);
      expect(keepBoth.body.item.name).toBe('notas (2).txt');
      expect(await fs.readFile(storagePath('notas (2).txt'), 'utf-8')).toBe('B');
    });

    it('should treat renaming to the same name as a no-op', async () => {
      await writeFile('same.txt');

      const response = await request(app).patch('/api/items').send({ path: 'same.txt', newName: 'same.txt' });

      expect(response.status).toBe(200);
      expect(existsSync(storagePath('same.txt'))).toBe(true);
    });

    it.each(['', 'a/b', '../evil.txt', '.hidden'])('should reject the invalid new name %p', async (newName) => {
      await writeFile('a.txt');

      const response = await request(app).patch('/api/items').send({ path: 'a.txt', newName });

      expect(response.status).toBe(400);
      expect(existsSync(storagePath('a.txt'))).toBe(true);
    });

    it('should return 404 for a missing item', async () => {
      const response = await request(app).patch('/api/items').send({ path: 'ghost.txt', newName: 'x.txt' });

      expect(response.status).toBe(404);
    });

    it('should keep the item in place in the saved order', async () => {
      await writeFile('a.txt');
      await writeFile('b.txt');
      await request(app).put('/api/files/order').send({ dir: '', order: ['b.txt', 'a.txt'] });

      await request(app).patch('/api/items').send({ path: 'b.txt', newName: 'c.txt' });

      const order = await request(app).get('/api/files/order');
      expect(order.body).toEqual(['c.txt', 'a.txt']);
    });

    it("should carry a renamed folder's saved orders along", async () => {
      await writeFile('Fotos/a.jpg');
      await writeFile('Fotos/b.jpg');
      await request(app).put('/api/files/order').send({ dir: 'Fotos', order: ['b.jpg', 'a.jpg'] });

      await request(app).patch('/api/items').send({ path: 'Fotos', newName: 'Pics' });

      const order = await request(app).get('/api/files/order').query({ dir: 'Pics' });
      expect(order.body).toEqual(['b.jpg', 'a.jpg']);
    });
  });

  describe('POST /api/items/move', () => {
    it('should move a file into a folder', async () => {
      await writeFile('doc.txt', 'data');
      await fs.mkdir(storagePath('Docs'));

      const response = await request(app).post('/api/items/move').send({ path: 'doc.txt', toDir: 'Docs' });

      expect(response.status).toBe(200);
      expect(response.body.item.path).toBe('Docs/doc.txt');
      expect(existsSync(storagePath('doc.txt'))).toBe(false);
      expect(existsSync(storagePath('Docs', 'doc.txt'))).toBe(true);
    });

    it('should move an item up to the root', async () => {
      await writeFile('Docs/doc.txt');

      const response = await request(app).post('/api/items/move').send({ path: 'Docs/doc.txt', toDir: '' });

      expect(response.body.item.path).toBe('doc.txt');
    });

    it('should move a folder with its contents', async () => {
      await writeFile('A/inner/file.txt');
      await fs.mkdir(storagePath('B'));

      await request(app).post('/api/items/move').send({ path: 'A', toDir: 'B' });

      expect(existsSync(storagePath('B', 'A', 'inner', 'file.txt'))).toBe(true);
    });

    it('should refuse to move a folder into itself or its subfolders', async () => {
      await fs.mkdir(storagePath('A', 'inner'), { recursive: true });

      const intoSelf = await request(app).post('/api/items/move').send({ path: 'A', toDir: 'A' });
      const intoChild = await request(app).post('/api/items/move').send({ path: 'A', toDir: 'A/inner' });

      expect(intoSelf.status).toBe(400);
      expect(intoChild.status).toBe(400);
      expect(existsSync(storagePath('A', 'inner'))).toBe(true);
    });

    it('should report a conflict at the destination', async () => {
      await writeFile('doc.txt', 'new');
      await writeFile('Docs/doc.txt', 'old');

      const response = await request(app).post('/api/items/move').send({ path: 'doc.txt', toDir: 'Docs' });

      expect(response.status).toBe(409);
      expect(response.body.suggestedName).toBe('doc (2).txt');
    });

    it('should replace at the destination when asked to', async () => {
      await writeFile('doc.txt', 'new');
      await writeFile('Docs/doc.txt', 'old');

      await request(app)
        .post('/api/items/move')
        .send({ path: 'doc.txt', toDir: 'Docs', conflict: 'replace' });

      expect(await fs.readFile(storagePath('Docs', 'doc.txt'), 'utf-8')).toBe('new');
    });

    it('should drop the item from the old folder order', async () => {
      await writeFile('a.txt');
      await writeFile('b.txt');
      await fs.mkdir(storagePath('Docs'));
      await request(app).put('/api/files/order').send({ dir: '', order: ['b.txt', 'a.txt', 'Docs'] });

      await request(app).post('/api/items/move').send({ path: 'b.txt', toDir: 'Docs' });

      const order = await request(app).get('/api/files/order');
      expect(order.body).toEqual(['a.txt', 'Docs']);
    });

    it('should return 404 for a missing destination', async () => {
      await writeFile('doc.txt');

      const response = await request(app).post('/api/items/move').send({ path: 'doc.txt', toDir: 'nope' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/items', () => {
    it('should delete an existing file', async () => {
      await writeFile('delete-test.txt', 'To be deleted');

      const response = await request(app).delete('/api/items').query({ path: 'delete-test.txt' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Deleted successfully');
      expect(existsSync(storagePath('delete-test.txt'))).toBe(false);
    });

    it('should delete a folder with everything inside it', async () => {
      await writeFile('Fotos/2026/a.jpg');

      const response = await request(app).delete('/api/items').query({ path: 'Fotos' });

      expect(response.status).toBe(200);
      expect(existsSync(storagePath('Fotos'))).toBe(false);
    });

    it('should refuse to delete the root folder', async () => {
      await writeFile('keep.txt');

      const response = await request(app).delete('/api/items').query({ path: '' });

      expect(response.status).toBe(400);
      expect(existsSync(storagePath('keep.txt'))).toBe(true);
    });

    it('should return 404 when deleting a non-existent item', async () => {
      const response = await request(app).delete('/api/items').query({ path: 'nonexistent.txt' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Item not found');
    });

    it('should remove a deleted file from the saved order', async () => {
      await writeFile('keep.txt');
      await writeFile('gone.txt');
      await request(app).put('/api/files/order').send({ dir: '', order: ['gone.txt', 'keep.txt'] });

      await request(app).delete('/api/items').query({ path: 'gone.txt' });

      const response = await request(app).get('/api/files/order');
      expect(response.body).toEqual(['keep.txt']);
    });

    it("should drop a deleted folder's nested saved orders", async () => {
      await writeFile('Fotos/a.jpg');
      await writeFile('Fotos/b.jpg');
      await request(app).put('/api/files/order').send({ dir: 'Fotos', order: ['b.jpg', 'a.jpg'] });

      await request(app).delete('/api/items').query({ path: 'Fotos' });
      await writeFile('Fotos/a.jpg');
      await writeFile('Fotos/b.jpg');

      const response = await request(app).get('/api/files/order').query({ dir: 'Fotos' });
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/files/download', () => {
    it('should download an existing file', async () => {
      await writeFile('download-test.txt', 'Download test content');

      const response = await request(app).get('/api/files/download').query({ path: 'download-test.txt' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Download test content');
      expect(response.headers['content-disposition']).toContain('download-test.txt');
    });

    it('should download a file inside a folder', async () => {
      await writeFile('Docs/inner.txt', 'Inner');

      const response = await request(app).get('/api/files/download').query({ path: 'Docs/inner.txt' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Inner');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app).get('/api/files/download').query({ path: 'nonexistent.txt' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'File not found');
    });

    it('should return 404 for a folder', async () => {
      await fs.mkdir(storagePath('Docs'));

      const response = await request(app).get('/api/files/download').query({ path: 'Docs' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/folders/download', () => {
    it('should download a folder as a zip', async () => {
      await writeFile('Fotos/a.txt', 'A');
      await writeFile('Fotos/2026/b.txt', 'B');
      await fs.mkdir(storagePath('Fotos', 'Vacía'));

      const response = await request(app)
        .get('/api/folders/download')
        .query({ path: 'Fotos' })
        .buffer(true)
        .parse(binaryParser);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/zip/);
      expect(response.headers['content-disposition']).toContain('Fotos.zip');

      const body: Buffer = response.body;
      expect(body.subarray(0, 2).toString()).toBe('PK');
      const listing = body.toString('latin1');
      expect(listing).toContain('Fotos/a.txt');
      expect(listing).toContain('Fotos/2026/b.txt');
      expect(listing).toContain('Fotos/Vac');
    });

    it('should download the root folder without internal files', async () => {
      await writeFile('root.txt', 'R');
      await writeFile('.order.json', '{}');

      const response = await request(app)
        .get('/api/folders/download')
        .buffer(true)
        .parse(binaryParser);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('ETHDrop.zip');
      const listing = (response.body as Buffer).toString('latin1');
      expect(listing).toContain('ETHDrop/root.txt');
      expect(listing).not.toContain('.order.json');
    });

    it('should return 404 for a missing folder', async () => {
      const response = await request(app).get('/api/folders/download').query({ path: 'nope' });

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
      await writeFile('a.txt', 'A');
      await writeFile('b.txt', 'B');

      const putResponse = await request(app)
        .put('/api/files/order')
        .send({ dir: '', order: ['b.txt', 'a.txt'] });

      expect(putResponse.status).toBe(200);
      expect(putResponse.body).toEqual(['b.txt', 'a.txt']);

      const getResponse = await request(app).get('/api/files/order');
      expect(getResponse.body).toEqual(['b.txt', 'a.txt']);
    });

    it('should keep a separate order per folder', async () => {
      await writeFile('a.txt');
      await writeFile('b.txt');
      await writeFile('Docs/x.txt');
      await writeFile('Docs/y.txt');

      await request(app).put('/api/files/order').send({ dir: '', order: ['b.txt', 'a.txt'] });
      await request(app).put('/api/files/order').send({ dir: 'Docs', order: ['y.txt', 'x.txt'] });

      expect((await request(app).get('/api/files/order')).body).toEqual(['b.txt', 'a.txt']);
      expect((await request(app).get('/api/files/order').query({ dir: 'Docs' })).body).toEqual([
        'y.txt',
        'x.txt',
      ]);
    });

    it('should read the pre-folders order format as the root order', async () => {
      await writeFile('a.txt');
      await writeFile('.order.json', JSON.stringify(['a.txt']));

      const response = await request(app).get('/api/files/order');

      expect(response.body).toEqual(['a.txt']);
    });

    it('should drop names that do not exist in that folder', async () => {
      await writeFile('real.txt', 'real');

      const response = await request(app)
        .put('/api/files/order')
        .send({ dir: '', order: ['real.txt', 'ghost.txt', '../real.txt'] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(['real.txt']);
    });

    it('should reject a non-array order', async () => {
      const response = await request(app)
        .put('/api/files/order')
        .send({ dir: '', order: 'not-an-array' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/files/thumbnail', () => {
    it('should generate and serve a thumbnail for an image file', async () => {
      await writeFile('thumb-test.jpg', await makeImage());

      const response = await request(app).get('/api/files/thumbnail').query({ path: 'thumb-test.jpg' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('should cache same-named images in different folders separately', async () => {
      await writeFile('A/photo.jpg', await makeImage());
      await writeFile('B/photo.jpg', await makeImage());

      await request(app).get('/api/files/thumbnail').query({ path: 'A/photo.jpg' });
      await request(app).get('/api/files/thumbnail').query({ path: 'B/photo.jpg' });

      expect(await fs.readdir(storagePath('.thumbnails'))).toHaveLength(2);
    });

    it('should carry cached thumbnails along when a folder moves', async () => {
      await writeFile('A/photo.jpg', await makeImage());
      await request(app).get('/api/files/thumbnail').query({ path: 'A/photo.jpg' });
      const before = await fs.readdir(storagePath('.thumbnails'));

      await request(app).patch('/api/items').send({ path: 'A', newName: 'B' });

      const after = await fs.readdir(storagePath('.thumbnails'));
      expect(after).toHaveLength(1);
      expect(after).not.toEqual(before);
    });

    it('should drop cached thumbnails when a folder is deleted', async () => {
      await writeFile('A/photo.jpg', await makeImage());
      await request(app).get('/api/files/thumbnail').query({ path: 'A/photo.jpg' });

      await request(app).delete('/api/items').query({ path: 'A' });

      expect(await fs.readdir(storagePath('.thumbnails'))).toEqual([]);
    });

    it('should return 404 for file types without thumbnail support', async () => {
      await writeFile('thumb-test.txt', 'not an image');

      const response = await request(app).get('/api/files/thumbnail').query({ path: 'thumb-test.txt' });

      expect(response.status).toBe(404);
    });

    it('should return 404 for a non-existent file', async () => {
      const response = await request(app).get('/api/files/thumbnail').query({ path: 'nonexistent.jpg' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should find files and folders in any folder, ignoring case and accents', async () => {
      await writeFile('Música/Canción.mp3');
      await writeFile('Otros/cancion-vieja.txt');
      await writeFile('nada.txt');

      const response = await request(app).get('/api/search').query({ q: 'CANCION' });

      expect(response.status).toBe(200);
      expect(response.body.map((item: any) => item.path).sort()).toEqual([
        'Música/Canción.mp3',
        'Otros/cancion-vieja.txt',
      ]);
    });

    it('should match folders too', async () => {
      await fs.mkdir(storagePath('Proyectos', 'Fotos viaje'), { recursive: true });

      const response = await request(app).get('/api/search').query({ q: 'fotos' });

      expect(response.body).toEqual([expect.objectContaining({ type: 'folder', path: 'Proyectos/Fotos viaje' })]);
    });

    it('should return nothing for an empty query', async () => {
      await writeFile('a.txt');

      const response = await request(app).get('/api/search').query({ q: '  ' });

      expect(response.body).toEqual([]);
    });

    it('should not search internal hidden files', async () => {
      await writeFile('.order.json', '{}');

      const response = await request(app).get('/api/search').query({ q: 'order' });

      expect(response.body).toEqual([]);
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

    it('should strip leading dots so uploads cannot become hidden files', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test'), '.order.json');

      expect(response.body.file.name).toBe('order.json');
      expect(existsSync(storagePath('.order.json'))).toBe(false);
    });

    it('should reject a malformed upload with a null byte in its name', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test'), 'file\0name.txt');

      expect(response.status).toBe(400);
      expect(await fs.readdir(STORAGE_DIR)).toEqual([]);
    });

    it('should handle filenames with control characters', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('Test'), 'file\tname.txt');

      expect(response.status).toBe(201);
      expect(response.body.file.name).toBe('filename.txt');
    });

    const traversalPaths = ['..', '../etc/passwd', 'a/../../etc', '..\\..\\etc', '.thumbnails', 'a/.hidden'];

    it.each(traversalPaths)('should reject the path %p when listing', async (dir) => {
      const response = await request(app).get('/api/files').query({ dir });

      expect(response.status).toBe(400);
    });

    it.each(traversalPaths)('should reject the path %p when downloading', async (filePath) => {
      const response = await request(app).get('/api/files/download').query({ path: filePath });

      expect(response.status).toBe(400);
    });

    it.each(traversalPaths)('should reject the path %p when deleting', async (itemPath) => {
      const response = await request(app).delete('/api/items').query({ path: itemPath });

      expect(response.status).toBe(400);
    });

    it.each(traversalPaths)('should reject the upload folder %p', async (dir) => {
      const response = await request(app)
        .post('/api/files')
        .query({ dir })
        .attach('file', Buffer.from('x'), 'x.txt');

      expect(response.status).toBe(400);
    });

    it.each(traversalPaths)('should reject moving into %p', async (toDir) => {
      await writeFile('a.txt');

      const response = await request(app).post('/api/items/move').send({ path: 'a.txt', toDir });

      expect(response.status).toBe(400);
      expect(existsSync(storagePath('a.txt'))).toBe(true);
    });

    it('should keep absolute-looking paths inside storage', async () => {
      const response = await request(app).get('/api/files/download').query({ path: '/etc/passwd' });

      expect(response.status).toBe(404);
    });

    it('should reject non-string paths', async () => {
      const response = await request(app).get('/api/files').query({ dir: ['a', 'b'] });

      expect(response.status).toBe(400);
    });

    it('should not expose the zip of a folder outside storage', async () => {
      const response = await request(app).get('/api/folders/download').query({ path: '..' });

      expect(response.status).toBe(400);
    });
  });
});
