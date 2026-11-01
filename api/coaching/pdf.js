/* A small PDF writer (trainer-fork, Phase 2e): A4 pages of wrapped text in Helvetica, rules, and
 * JPEG images (signatures, photos of a filled-in form). No dependency: PDF is text plus byte
 * offsets, and a JPEG goes in as it is (DCTDecode), so nothing has to be decoded.
 *
 * Text is WinAnsi (Latin-1 plus curly quotes and dashes); anything outside it prints as "?".
 * Line widths use Helvetica's own character widths, so wrapping matches what is drawn.
 */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;

// Helvetica widths (1/1000 em) for 32..126, from the standard AFM.
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// The WinAnsi codes for the few characters above Latin-1 that people type.
const WIN = { '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85, '€': 0x80, '™': 0x99 };

/** One character's WinAnsi code, or "?" for what Helvetica here cannot print. */
function code(ch) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 160 && c <= 255) return c;
  return WIN[ch] ?? 63;
}
const charWidth = (c, bold) => ((c >= 32 && c <= 126) ? W[c - 32] : 556) * (bold ? 1.06 : 1);
export const textWidth = (s, size, bold = false) => [...s].reduce((n, ch) => n + charWidth(code(ch), bold), 0) * size / 1000;

/** The words of `text` broken into lines no wider than `width`. Keeps blank lines. */
export function wrap(text, size, width, bold = false) {
  const out = [];
  for (const para of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (textWidth(next, size, bold) <= width) { line = next; continue; }
      if (line) out.push(line);
      // A word longer than the line (a hash, a link) is cut where it has to be.
      let w = word;
      while (textWidth(w, size, bold) > width) {
        let n = w.length;
        while (n > 1 && textWidth(w.slice(0, n), size, bold) > width) n--;
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

const pdfString = s => '(' + Buffer.from([...s].map(code)).toString('latin1').replace(/[\\()]/g, m => '\\' + m) + ')';
const num = n => (Math.round(n * 100) / 100).toString();

/** Width, height and colour space of a baseline or progressive JPEG, or null if it is not one. */
export function jpegInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      const h = buf.readUInt16BE(i + 5), w = buf.readUInt16BE(i + 7), comps = buf[i + 9];
      if (!w || !h) return null;
      return { w, h, space: comps === 1 ? '/DeviceGray' : comps === 4 ? '/DeviceCMYK' : '/DeviceRGB', cmyk: comps === 4 };
    }
    i += 2 + len;
  }
  return null;
}

/** A document under construction. Every call adds to the current page and starts a new one when
 *  the content would run off the bottom. */
export function makePdf({ title = '' } = {}) {
  const pages = [];   // { ops: [], images: [] }
  const images = [];  // { buf, info }
  let page, y;
  const width = A4.w - 2 * MARGIN;
  const newPage = () => { page = { ops: [], images: new Set() }; pages.push(page); y = A4.h - MARGIN; };
  newPage();
  const room = h => { if (y - h < MARGIN) newPage(); };

  const doc = {
    width,
    /** Wrapped text. `color` is a grey level 0..1. */
    text(s, { size = 10.5, bold = false, color = 0, gap = 1.35, indent = 0 } = {}) {
      const lead = size * gap;
      for (const line of wrap(s, size, width - indent, bold)) {
        room(lead);
        y -= lead;
        if (line) page.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(color)} g ${num(MARGIN + indent)} ${num(y + size * 0.25)} Td ${pdfString(line)} Tj ET`);
      }
      return doc;
    },
    /** A label and its value on one line, the value wrapped under itself. */
    pair(label, value, { size = 9.5 } = {}) {
      const lw = 110;
      const lines = wrap(value, size, width - lw);
      lines.forEach((line, i) => {
        const lead = size * 1.4;
        room(lead); y -= lead;
        if (!i) page.ops.push(`BT /F2 ${num(size)} Tf 0.35 g ${num(MARGIN)} ${num(y + size * 0.25)} Td ${pdfString(label)} Tj ET`);
        if (line) page.ops.push(`BT /F1 ${num(size)} Tf 0 g ${num(MARGIN + lw)} ${num(y + size * 0.25)} Td ${pdfString(line)} Tj ET`);
      });
      return doc;
    },
    gap(h = 8) { y -= h; if (y < MARGIN) newPage(); return doc; },
    rule() { room(10); y -= 6; page.ops.push(`0.8 G 0.5 w ${num(MARGIN)} ${num(y)} m ${num(MARGIN + width)} ${num(y)} l S`); y -= 6; return doc; },
    /** A JPEG at most `maxW` x `maxH` points, kept in proportion, in a light frame when `frame`. */
    image(buf, { maxW = 220, maxH = 90, frame = false } = {}) {
      const info = jpegInfo(buf);
      if (!info) return doc.text('[image could not be read]', { size: 9, color: 0.4 });
      const s = Math.min(maxW / info.w, maxH / info.h, 1);
      const w = info.w * s, h = info.h * s;
      room(h + 6);
      y -= h + 3;
      const n = images.push({ buf, info }) - 1;
      page.images.add(n);
      page.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(MARGIN)} ${num(y)} cm /Im${n} Do Q`);
      if (frame) page.ops.push(`0.8 G 0.5 w ${num(MARGIN - 2)} ${num(y - 2)} ${num(w + 4)} ${num(h + 4)} re S`);
      y -= 3;
      return doc;
    },
    /** A page holding only this JPEG, as large as fits: a photo of a filled-in page. */
    photoPage(buf) {
      const info = jpegInfo(buf);
      if (!info) return doc;
      if (page.ops.length) newPage();
      const s = Math.min(width / info.w, (A4.h - 2 * MARGIN) / info.h);
      const w = info.w * s, h = info.h * s;
      const n = images.push({ buf, info }) - 1;
      page.images.add(n);
      page.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(MARGIN + (width - w) / 2)} ${num(A4.h - MARGIN - h)} cm /Im${n} Do Q`);
      y = MARGIN;
      return doc;
    },
    newPage() { if (page.ops.length) newPage(); return doc; },
    toBuffer() { return serialize(pages, images, title); },
  };
  return doc;
}

/** Writes the objects, the cross-reference table and the trailer. */
function serialize(pages, images, title) {
  const objs = [];  // Buffer per object, index + 1 is its number
  const add = b => objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'));
  // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then images, then page + content pairs.
  add('');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  add(`<< /Producer (Higher Rep) /Title ${pdfString(title)} >>`);
  const imageObj = images.map(({ buf, info }) => {
    add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace ${info.space} /BitsPerComponent 8 /Filter /DCTDecode${info.cmyk ? ' /Decode [1 0 1 0 1 0 1 0]' : ''} /Length ${buf.length} >>\nstream\n`, 'latin1'),
      buf, Buffer.from('\nendstream', 'latin1')]));
    return objs.length;
  });
  const kids = [];
  for (const p of pages) {
    const content = Buffer.from(p.ops.join('\n'), 'latin1');
    add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
    const contentNo = objs.length;
    const xo = [...p.images].map(n => `/Im${n} ${imageObj[n]} 0 R`).join(' ');
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${contentNo} 0 R >>`);
    kids.push(objs.length);
  }
  objs[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`, 'latin1');

  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0].length;
  const offsets = [];
  objs.forEach((b, i) => {
    offsets.push(offset);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), b, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(chunk); offset += chunk.length;
  });
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offsets.map(o => String(o).padStart(10, '0') + ' 00000 n ')].join('\n');
  parts.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

/** One PDF of photos, a page each, in order: what a client returns instead of a filled-in PDF. */
export function photosToPdf(jpegs, title = '') {
  const doc = makePdf({ title });
  for (const j of jpegs) doc.photoPage(j);
  return doc.toBuffer();
}
