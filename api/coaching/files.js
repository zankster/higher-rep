/* The coaching file store (trainer-fork, Phase 2d): uploaded PDFs, and from 2e signature images
 * and photos of filled-in pages (JPEG); logos later. A file is kept once, named by its SHA-256, under DATA_DIR/coaching-files. openGym's
 * media clean-up never looks here, and nothing here is served without a route checking who may
 * read it. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_PDF = 10 * 1024 * 1024;
const EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg' };
export const FILE_TYPES = Object.keys(EXT);

export const filesDir = dataDir => path.join(dataDir, 'coaching-files');
export const filePath = (dataDir, hash, type = 'application/pdf') => path.join(filesDir(dataDir), hash + (EXT[type] || ''));

/** Reads a raw request body up to `max` bytes. Resolves the Buffer, or null when it is larger. */
export function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) { req.resume(); return resolve(null); }
    const chunks = []; let size = 0, over = false;
    req.on('data', d => {
      size += d.length;
      if (over) { if (size > 2 * max) req.destroy(); return; }
      if (size > max) { over = true; chunks.length = 0; return; }
      chunks.push(d);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const isPdf = buf => buf.length > 8 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
export const isJpeg = buf => buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
/** The type the bytes really are, of the ones the store keeps, or null. */
export const sniff = buf => isPdf(buf) ? 'application/pdf' : isJpeg(buf) ? 'image/jpeg' : null;

/** Writes the file once (temp then rename) and returns its hash. */
export function storeFile(dataDir, buf, type = 'application/pdf') {
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const dest = filePath(dataDir, hash, type);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(filesDir(dataDir), { recursive: true });
    const tmp = dest + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, dest);
  }
  return hash;
}
