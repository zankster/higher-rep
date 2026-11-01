/* Branding and the trainer's own settings (trainer-fork, Phase 2g): business name, tagline, the
 * email "from" name, one of six accent colours, contact details and a logo; the preset new clients
 * start with; and, per client, whether that client sees the trainer's phone number. Spread into
 * coachingRoutes.
 *
 * Everything that shows a trainer to a client reads branding through readBranding(), so Higher
 * Rep's own look is the default whatever is stored. The accent colour is only used on the invite
 * page, in the emails and on the client's trainer card (PHASE2.md, 2g).
 *
 * The phone number is the one detail the trainer gives out client by client: it is stored on the
 * link (link_settings.show_phone, off for every new client) and a client with it off never
 * receives it. The email address is shown to every client.
 */
import fs from 'node:fs';
import { readRaw, sniff, storeFile, filePath } from './files.js';
import { jpegInfo } from './pdf.js';
import { looksLikeEmail } from './email.js';

export const MAX_LOGO = 2 * 1024 * 1024;
export const LIMITS = { business: 60, tagline: 60, mailFrom: 60, phone: 30, website: 200 };
// White text on each reads at 4.5:1 or better (WCAG AA); test/coaching-branding.test.js checks it.
export const SWATCHES = [
  { id: 'blue', name: 'Coach blue', hex: '#2457E6' },
  { id: 'green', name: 'Green', hex: '#1E7B34' },
  { id: 'red', name: 'Red', hex: '#B3261E' },
  { id: 'violet', name: 'Violet', hex: '#6B3FD4' },
  { id: 'teal', name: 'Teal', hex: '#0E6E78' },
  { id: 'graphite', name: 'Graphite', hex: '#3A3A3C' },
];
// What a new client's settings start as (SPEC-client-settings.md). Balanced unless the trainer picks.
export const PRESETS = ['hands_on', 'balanced', 'independent'];
export const DEFAULT_PRESET = 'balanced';
const LOGO_TYPES = ['image/png', 'image/jpeg'];
const LOGO_SIDE = { min: 32, max: 4096 };

const parse = s => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
// One line of text: no control characters, single spaces, cut to `max`.
const line = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** How white text reads on a colour, as the WCAG contrast ratio (1 to 21). */
export function contrastWithWhite(hex) {
  const lin = v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/** Width and height of a PNG, from its header, or null if it is not one. */
export function pngInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || sniff(buf) !== 'image/png' || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w && h ? { w, h } : null;
}

/** A phone number as typed, if it looks like one: digits with + ( ) - . and spaces. '' clears it; null is refused. */
export function cleanPhone(v) {
  const s = line(v, 40);
  if (!s) return '';
  if (s.length > LIMITS.phone || !/^\+?[\d\s().-]+$/.test(s) || s.replace(/\D/g, '').length < 6) return null;
  return s;
}

/** A website as an https:// (or http://) address; "smithstrength.com" gains https://. '' clears it; null is refused. */
export function cleanWebsite(v) {
  let s = line(v, LIMITS.website + 10);
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!['https:', 'http:'].includes(u.protocol) || !/\.[a-z]{2,}$/i.test(u.hostname) || u.username || u.password) return null;
    return u.href.length <= LIMITS.website ? u.href : null;
  } catch { return null; }
}

/** The trainer's branding as clients see it, cleaned, with Higher Rep's look for anything not set. */
export function readBranding(sql, trainerId) {
  const b = parse(sql.prepare('SELECT branding FROM trainers WHERE user_id = ?').get(trainerId)?.branding);
  const accent = SWATCHES.find(s => s.id === b.accent) || SWATCHES[0];
  const logo = b.logo && /^[0-9a-f]{64}$/.test(b.logo.hash) && LOGO_TYPES.includes(b.logo.type) ? { hash: b.logo.hash, type: b.logo.type } : null;
  return {
    business: line(b.business, LIMITS.business) || null,
    tagline: line(b.tagline, LIMITS.tagline) || null,
    mailFrom: line(b.mailFrom, LIMITS.mailFrom) || null,
    accent: accent.id, accentHex: accent.hex,
    contactEmail: looksLikeEmail(b.contactEmail) ? b.contactEmail : null,
    phone: cleanPhone(b.phone) || null,
    website: cleanWebsite(b.website) || null,
    logo,
  };
}

/** The logo's address. `base` is the server's origin for an email, '' inside the app. */
export const logoUrl = (base, logo) => logo ? `${base}/api/coaching/logo?h=${logo.hash}` : null;

export function brandingRoutes({ sql, access, json, readBody, dataDir, now }) {
  const { requireTrainer, requireOwnClient, requireUser, liveLinkOf, userById } = access;
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);
  const stored = id => parse(sql.prepare('SELECT branding FROM trainers WHERE user_id = ?').get(id)?.branding);
  const store = (id, b) => sql.prepare('UPDATE trainers SET branding = ? WHERE user_id = ?').run(JSON.stringify(b), id);
  const presetOf = id => {
    const p = sql.prepare('SELECT default_preset FROM trainers WHERE user_id = ?').get(id)?.default_preset;
    return PRESETS.includes(p) ? p : DEFAULT_PRESET;
  };
  // "Shown to N of M clients": live clients only.
  const phoneShown = id => {
    const r = sql.prepare(
      `SELECT COUNT(l.id) AS of, COALESCE(SUM(s.show_phone), 0) AS shown FROM links l LEFT JOIN link_settings s ON s.link_id = l.id
       WHERE l.trainer_id = ? AND l.status IN ('active', 'paused')`
    ).get(id);
    return { shown: Number(r.shown), of: Number(r.of) };
  };
  const showsPhone = linkId => !!sql.prepare('SELECT show_phone FROM link_settings WHERE link_id = ?').get(linkId)?.show_phone;

  // What the trainer's Branding and New client defaults screens show.
  const settingsOf = trainer => {
    const b = readBranding(sql, trainer.id);
    return {
      branding: { business: b.business, tagline: b.tagline, mailFrom: b.mailFrom, accent: b.accent, contactEmail: b.contactEmail, phone: b.phone, website: b.website, logo: b.logo?.hash || null },
      name: trainer.name || null, signInEmail: looksLikeEmail(trainer.email) ? trainer.email : null,
      swatches: SWATCHES.map(s => ({ ...s, contrast: Math.round(contrastWithWhite(s.hex) * 10) / 10 })),
      phoneShown: phoneShown(trainer.id), preset: presetOf(trainer.id),
    };
  };

  return {
    'GET /api/coaching/branding': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      json(res, 200, settingsOf(trainer));
    },

    // Saved as the trainer types: only the fields sent change. null or '' clears a field; the
    // accent and logo cleared is Higher Rep's look.
    'POST /api/coaching/branding': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const has = k => Object.prototype.hasOwnProperty.call(body, k);
      const b = stored(trainer.id);
      for (const k of ['business', 'tagline', 'mailFrom']) if (has(k)) {
        if (body[k] != null && typeof body[k] !== 'string') return json(res, 400, { error: `${k} must be text`, code: k });
        b[k] = line(body[k], LIMITS[k]);
      }
      if (has('accent')) {
        if (body.accent != null && !SWATCHES.some(s => s.id === body.accent)) return json(res, 400, { error: 'pick one of the colours', code: 'accent' });
        b.accent = body.accent || SWATCHES[0].id;
      }
      if (has('contactEmail')) {
        const e = line(body.contactEmail, 254).toLowerCase();
        if (e && !looksLikeEmail(e)) return json(res, 400, { error: 'that email address does not look right', code: 'email' });
        b.contactEmail = e;
      }
      if (has('phone')) {
        const p = cleanPhone(body.phone);
        if (p === null) return json(res, 400, { error: 'that phone number does not look right', code: 'phone' });
        b.phone = p;
      }
      if (has('website')) {
        const w = cleanWebsite(body.website);
        if (w === null) return json(res, 400, { error: 'that website address does not look right', code: 'website' });
        b.website = w;
      }
      if (has('logo')) {
        if (body.logo !== null) return json(res, 400, { error: 'upload a logo with POST /api/coaching/branding/logo', code: 'logo' });
        delete b.logo;
      }
      store(trainer.id, b);
      json(res, 200, settingsOf(trainer));
    },

    // The logo: the raw PNG or JPEG as the body, up to 2 MB. Shown square, so a square one looks best.
    'POST /api/coaching/branding/logo': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const declared = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!LOGO_TYPES.includes(declared)) { req.resume(); return json(res, 415, { error: 'a PNG or JPEG image', code: 'type' }); }
      const buf = await readRaw(req, MAX_LOGO);
      if (!buf) return json(res, 413, { error: 'the logo is larger than 2 MB', code: 'size' });
      const size = sniff(buf) !== declared ? null : declared === 'image/png' ? pngInfo(buf) : jpegInfo(buf);
      if (!size) return json(res, 400, { error: 'that image could not be read', code: 'type' });
      if (Math.min(size.w, size.h) < LOGO_SIDE.min || Math.max(size.w, size.h) > LOGO_SIDE.max) {
        return json(res, 400, { error: `use an image between ${LOGO_SIDE.min} and ${LOGO_SIDE.max} pixels on a side`, code: 'dims' });
      }
      const hash = storeFile(dataDir, buf, declared);
      sql.prepare('INSERT OR IGNORE INTO files (hash, owner_id, size, type, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, trainer.id, buf.length, declared, now());
      const b = stored(trainer.id);
      b.logo = { hash, type: declared };
      store(trainer.id, b);
      json(res, 200, settingsOf(trainer));
    },

    // A trainer's logo, for the invite page and the emails. No session: an email client loads it
    // without one. Only a hash that is some trainer's current logo is served, so nothing else in
    // the file store can be read through here.
    'GET /api/coaching/logo': async (req, res) => {
      const h = String(query(req, 'h') || '');
      if (!/^[0-9a-f]{64}$/.test(h)) return json(res, 404, { error: 'no such logo' });
      const rows = sql.prepare('SELECT user_id FROM trainers WHERE branding LIKE ?').all(`%${h}%`);
      const logo = rows.map(r => readBranding(sql, r.user_id).logo).find(l => l?.hash === h);
      const p = logo && filePath(dataDir, h, logo.type);
      if (!logo || !fs.existsSync(p)) return json(res, 404, { error: 'no such logo' });
      res.writeHead(200, {
        'Content-Type': logo.type, 'Content-Length': fs.statSync(p).size,
        'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(p).pipe(res);
    },

    // The preset new clients start with. Clients who already joined keep theirs.
    'POST /api/coaching/default-preset': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      if (!PRESETS.includes(body.preset)) return json(res, 400, { error: 'preset must be hands_on, balanced or independent', code: 'preset' });
      sql.prepare('UPDATE trainers SET default_preset = ? WHERE user_id = ?').run(body.preset, trainer.id);
      json(res, 200, { preset: body.preset });
    },

    // Whether this one client sees the trainer's phone number.
    'POST /api/coaching/client/phone': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      if (typeof body.show !== 'boolean') return json(res, 400, { error: 'show must be true or false' });
      const t = now();
      const r = sql.prepare('UPDATE link_settings SET show_phone = ?, updated_at = ? WHERE link_id = ?').run(body.show ? 1 : 0, t, own.link.id);
      if (!r.changes) sql.prepare('INSERT INTO link_settings (link_id, trainer_id, preset, show_phone, updated_at) VALUES (?, ?, ?, ?, ?)').run(own.link.id, own.trainer.id, presetOf(own.trainer.id), body.show ? 1 : 0, t);
      json(res, 200, { showPhone: body.show, phoneShown: phoneShown(own.trainer.id) });
    },

    // The client's Settings › Coaching: who their trainer is and how to reach them. The phone
    // number only when the trainer turned it on for this client.
    'GET /api/coaching/my/trainer': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const link = liveLinkOf(user.id);
      if (!link) return json(res, 404, { error: 'you have no trainer' });
      const t = userById(link.trainer_id);
      const b = readBranding(sql, link.trainer_id);
      json(res, 200, {
        trainer: {
          id: link.trainer_id, name: t?.name || null, business: b.business, tagline: b.tagline,
          accent: b.accentHex, logo: b.logo?.hash || null,
          email: b.contactEmail || (looksLikeEmail(t?.email) ? t.email : null),
          phone: showsPhone(link.id) ? b.phone : null, website: b.website,
          status: link.status, since: link.started_at,
        },
      });
    },
  };
}
