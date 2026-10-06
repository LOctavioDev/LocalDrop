/**
 * Files (and folder trees) the user dropped or picked, flattened so each
 * file knows which subfolder it goes in, relative to the upload target.
 */
export interface UploadBatch {
  files: { file: File; dir: string }[];
  /** Every folder in the batch (so empty ones get created too), e.g. "Fotos", "Fotos/2026" */
  dirs: string[];
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function addEntry(entry: FileSystemEntry, dir: string, batch: UploadBatch): Promise<void> {
  if (entry.isFile) {
    batch.files.push({ file: await entryFile(entry as FileSystemFileEntry), dir });
    return;
  }
  if (!entry.isDirectory) return;

  const path = dir ? `${dir}/${entry.name}` : entry.name;
  batch.dirs.push(path);

  // readEntries returns results in chunks (~100 in Chrome) until empty
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const children = await readEntries(reader);
    if (children.length === 0) break;
    for (const child of children) {
      await addEntry(child, path, batch);
    }
  }
}

/**
 * Reads a drop's files, walking into dropped folders where the browser
 * supports it. Must be called synchronously from the drop handler: the
 * DataTransfer is emptied once the event finishes.
 */
export function batchFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadBatch> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  const plainFiles = Array.from(dataTransfer.files);

  return (async () => {
    const batch: UploadBatch = { files: [], dirs: [] };
    if (entries.length === 0) {
      batch.files = plainFiles.map((file) => ({ file, dir: '' }));
      return batch;
    }
    for (const entry of entries) {
      await addEntry(entry, '', batch);
    }
    return batch;
  })();
}

/**
 * Builds a batch from an <input type="file">, including folder pickers
 * (webkitdirectory), whose files carry their path in webkitRelativePath.
 */
export function batchFromFileList(fileList: FileList): UploadBatch {
  const batch: UploadBatch = { files: [], dirs: [] };
  const dirs = new Set<string>();

  for (const file of Array.from(fileList)) {
    const segments = (file.webkitRelativePath || file.name).split('/').slice(0, -1);
    const dir = segments.join('/');
    batch.files.push({ file, dir });
    for (let i = 1; i <= segments.length; i++) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  }

  batch.dirs = Array.from(dirs);
  return batch;
}
