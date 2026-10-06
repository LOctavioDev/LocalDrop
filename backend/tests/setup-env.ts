import fs from 'fs';
import os from 'os';
import path from 'path';

// Point the app at an isolated temp directory for the whole test run so
// tests never read from or delete files in the real backend/storage dir.
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'localdrop-test-'));
