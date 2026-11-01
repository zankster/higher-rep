/* Email for coaching (trainer-fork, Phase 2c): the sender and the four emails.
 *
 * Sent through Resend's HTTP API with plain fetch, so there is no new dependency. Without
 * RESEND_API_KEY nothing leaves the server: the email is written to the log instead, links
 * included, so development and tests never send anything. Health answers never go in an email.
 *
 * Env: RESEND_API_KEY, MAIL_FROM (the address, default hello@higherrep.com), MAIL_NAME (the
 * product name in the sender, default Higher Rep).
 */

import { maskEmail } from '../password.js';

const RESEND_URL = 'https://api.resend.com/emails';
const ACCENT = '#2457E6';

// A display name goes into a header, so no quotes, angle brackets or line breaks.
const headerName = s => String(s || '').replace(/[\r\n"<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const EMAIL = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;
export const looksLikeEmail = s => typeof s === 'string' && s.length <= 254 && EMAIL.test(s);

export function makeMailer({ apiKey = '', from = 'hello@higherrep.com', product = 'Higher Rep', fetch: f = globalThis.fetch, log = console.log } = {}) {
  const live = !!apiKey;
  /** Sends one email. Resolves { ok, id?, logged? }; never throws, so a failed email does not
   *  fail the request that triggered it. `via` is the trainer's name, shown as "X via Higher Rep". */
  async function send({ to, via, replyTo, subject, html, text, attachments }) {
    if (!looksLikeEmail(to)) return { ok: false, error: 'bad-address' };
    const name = via ? `${headerName(via)} via ${headerName(product)}` : headerName(product);
    const msg = {
      from: `"${name}" <${from}>`, to: [to], subject: headerName(subject).slice(0, 200) || product, html, text,
      ...(looksLikeEmail(replyTo) ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments: attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}),
    };
    if (!live) {
      log(`[email not sent: no RESEND_API_KEY] to ${maskEmail(to)} | ${msg.subject}\n${text}${attachments?.length ? `\n(attachments: ${attachments.map(a => a.filename).join(', ')})` : ''}`);
      return { ok: true, logged: true };
    }
    try {
      const r = await f(RESEND_URL, {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(msg), signal: AbortSignal.timeout(10000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { log(`[email failed] ${r.status} to ${maskEmail(to)}: ${body.message || body.name || 'unknown'}`); return { ok: false, error: 'provider', status: r.status }; }
      return { ok: true, id: body.id || null };
    } catch (e) {
      log(`[email failed] to ${maskEmail(to)}: ${e.message}`);
      return { ok: false, error: 'network' };
    }
  }
  return { send, live };
}

/* ---------- the emails ---------- */

const fmtDay = (ms, tz) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(tz ? { timeZone: tz } : {}) });
const fmtWhen = (ms, tz) => {
  const opts = tz ? { timeZone: tz } : {};
  const day = new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...opts });
  const time = new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...opts });
  return `${day} at ${time}`;
};
const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'HR';

// One layout for all four: the sender's mark and name, the body, one button, the small print.
function layout({ mark, title, subtitle, blocks, button, notes = [], footer }) {
  const p = s => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1c1c1e">${s}</p>`;
  const small = s => `<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#6c6c70">${s}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px"><tr><td style="padding:24px 28px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px"><tr>
<td style="width:36px;height:36px;border-radius:9px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;text-align:center;vertical-align:middle">${esc(mark)}</td>
<td style="padding-left:10px"><div style="font-size:15px;font-weight:600;color:#1c1c1e">${esc(title)}</div>${subtitle ? `<div style="font-size:13px;color:#6c6c70">${esc(subtitle)}</div>` : ''}</td>
</tr></table>
${blocks.map(b => b.html ?? p(b)).join('\n')}
${button ? `<p style="margin:6px 0 16px"><a href="${esc(button.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:10px">${esc(button.label)}</a></p>` : ''}
${notes.map(small).join('\n')}
<p style="margin:18px 0 0;padding-top:12px;border-top:1px solid #e5e5ea;font-size:12px;line-height:1.5;color:#8e8e93">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
  return html;
}
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** The sender block every trainer email shares. `trainer` = { name, contactEmail?, tagline? }. */
const fromTrainer = (trainer, product) => ({
  mark: initials(trainer.name), title: trainer.name, subtitle: trainer.tagline || 'Personal training',
  footer: `Sent by ${esc(product)} for ${esc(trainer.name)}${trainer.contactEmail ? ` · ${esc(trainer.contactEmail)}` : ''}`,
});

export function inviteEmail({ trainer, firstName, note, url, expires, tz, product = 'Higher Rep' }) {
  const t = fromTrainer(trainer, product);
  const blocks = [
    `Hi ${esc(firstName)},`,
    `${esc(trainer.name)} invited you to ${esc(product)}, the app they use to plan your training, track your progress and stay in touch.`,
    ...(note ? [{ html: `<p style="margin:4px 0 14px;padding:10px 14px;border:1px solid #e5e5ea;border-radius:10px;font-size:15px;line-height:1.5;font-style:italic;color:#1c1c1e">“${esc(note)}”</p>` }] : []),
  ];
  const notes = [
    `You'll create an account and fill in a few forms ${esc(trainer.name)} needs before your first session. The link works until ${esc(fmtDay(expires, tz))}.`,
    'Not expecting this? Ignore this email and nothing happens.',
  ];
  const footer = t.footer + (trainer.contactEmail ? ` · Reply to this email to reach ${esc(trainer.name)}.` : '');
  return {
    subject: `${trainer.name} invited you to train with them`,
    html: layout({ ...t, blocks, button: { label: 'Accept invite', url }, notes, footer }),
    text: [`Hi ${firstName},`, '', `${trainer.name} invited you to ${product}, the app they use to plan your training, track your progress and stay in touch.`,
      ...(note ? ['', `"${note}"`] : []), '', `Accept invite: ${url}`, '', ...notes.map(strip), '', strip(footer)].join('\n'),
  };
}

export function resetEmail({ name, url, minutes = 60, product = 'Higher Rep', support = 'support@higherrep.com' }) {
  const life = minutes % 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  const blocks = [`Hi ${esc(name)},`, 'Someone asked to reset the password for your account. If it was you, choose a new one:'];
  const notes = [`The link works once, for ${life}. Your passkeys keep working either way.`, "Didn't ask for this? Ignore this email. Your password stays the same."];
  const footer = `${esc(product)} · ${esc(support)}`;
  return {
    subject: `Reset your ${product} password`,
    html: layout({ mark: initials(product), title: product, blocks, button: { label: 'Choose a new password', url }, notes, footer }),
    text: [`Hi ${name},`, '', blocks[1], '', `Choose a new password: ${url}`, '', ...notes, '', strip(footer)].join('\n'),
  };
}

export function guardianEmail({ trainer, guardianName, clientName, url, days = 7, product = 'Higher Rep' }) {
  const t = fromTrainer(trainer, product);
  const can = [`read and sign ${esc(trainer.name)}'s documents for ${esc(clientName)}`, `read the messages between ${esc(clientName)} and ${esc(trainer.name)}`];
  const blocks = [
    `Hi ${esc(guardianName)},`,
    `${esc(clientName)} is signing up to train with ${esc(trainer.name)} on ${esc(product)} and named you as their parent or guardian. Because ${esc(clientName)} is under 18, you need to sign too.`,
    { html: `<p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1c1c1e">As ${esc(clientName)}'s guardian you can</p><ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;color:#1c1c1e">${can.map(c => `<li>${c}</li>`).join('')}</ul>` },
  ];
  const notes = [
    'Progress photos are off for clients under 18.',
    `The link works once, for ${days} days. Not ${esc(clientName)}'s parent or guardian? Ignore this email. Nothing is signed.`,
  ];
  return {
    subject: `Please sign for ${clientName}'s training with ${trainer.name}`,
    html: layout({ ...t, blocks, button: { label: 'Review and sign', url }, notes, footer: t.footer }),
    text: [`Hi ${guardianName},`, '', strip(blocks[1]), '', `As ${clientName}'s guardian you can:`, ...can.map(c => '- ' + strip(c)), '',
      `Review and sign: ${url}`, '', ...notes.map(strip), '', strip(t.footer)].join('\n'),
  };
}

/** The signed copy of a waiver: the document, never any health answers. `pdf` = { filename, content }. */
export function waiverEmail({ trainer, recipientName, signerName, title, version, signedAt, tz, tzLabel, pdf, product = 'Higher Rep' }) {
  const t = fromTrainer(trainer, product);
  const when = `${fmtWhen(signedAt, tz)}${tzLabel ? ` (${tzLabel} time)` : ''}`;
  const blocks = [
    `Hi ${esc(recipientName)},`,
    'Here is your copy of what you signed:',
    { html: `<p style="margin:0 0 2px;font-size:15px;color:#1c1c1e"><b>${esc(title)}</b>, version ${esc(version)}</p><p style="margin:0 0 12px;font-size:13px;color:#6c6c70">Signed by ${esc(signerName)} on ${esc(when)}</p>` },
    ...(pdf ? [{ html: `<p style="margin:0 0 12px;font-size:13px;color:#1c1c1e">Attached: ${esc(pdf.filename)}</p>` }] : []),
  ];
  const notes = ['Your health answers are never sent by email. Everything you signed is also in the app under Settings, My documents.'];
  return {
    subject: `Your signed ${title.toLowerCase()} with ${trainer.name}`,
    html: layout({ ...t, blocks, notes, footer: t.footer }),
    text: [`Hi ${recipientName},`, '', 'Here is your copy of what you signed:', `${title}, version ${version}`, `Signed by ${signerName} on ${when}`,
      ...(pdf ? [`Attached: ${pdf.filename}`] : []), '', ...notes, '', strip(t.footer)].join('\n'),
    attachments: pdf ? [pdf] : [],
  };
}
