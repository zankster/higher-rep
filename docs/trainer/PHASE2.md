# Phase 2: trainer and clients (built)

Built 2026-11-01, steps 2a to 2g, each after Mike approved its mock-ups. This file records what
exists and the rules behind it. Code comments point here by step (for example "PHASE2.md, 2f").

A trainer invites a client with a link. The client signs up through the trainer's packet (date of
birth, the trainer's documents, a guardian for 13 to 17). The trainer sees the client on a roster
and a profile with tags, private notes and records, and can export them. Either side can end
coaching. Emails go out for invites, password resets, guardian links and signed copies.

Not in Phase 2: programs (Phase 3), dashboard metrics that need programs, chat (Phase 5), pain
reports and photos (Phases 5 and 6), account deletion screens.

## Code map
- **API:** `api/coaching/`, spread into openGym's `routes` from `routes.js` (one marked hook).
  Every route is in `openapi.yaml` under the `coaching` tag, ids in the query string or body.
  - `db.js` (SQLite, numbered migrations), `access.js` (the only door: "this trainer's own live
    clients", every refusal a 404), `routes.js` (me, roster, invites, accept, pause, remove, end,
    forgot password), `email.js`, `documents.js` + `doc-body.js`, `files.js`, `packet.js` +
    `submission.js` + `pdf.js`, `profile.js` + `zip.js`, `branding.js`.
  - Tests: `api/test/coaching-*.test.js`, run through a real `server.js` (`coaching-harness.mjs`).
- **App:** `lib/coaching.js` (every coaching call and pure helper; copy through `ct()`, English
  only for now), views `Clients`, `ClientProfile`, `Documents`, `DocumentEdit`, `JoinInvite`,
  `Packet`, `MyDocuments`, `GuardianSign`, `ResetPassword`, `Coaching`, `CoachingPrivacy`,
  `Branding`, `ClientDefaults`; Settings rows in `components/CoachingRow.jsx`.
- **Try it:** `node scripts/trainer/test-copy.mjs` (password sign-in, first account is the owner,
  `--fresh` starts over). Without `RESEND_API_KEY` emails go to the api log.

## Steps

### 2a. Server base
- Trainer role: `u.trainer` in `db.json` plus a `trainers` row (either alone grants nothing). Set
  by the owner (`POST /api/admin/user/trainer`, or "Make trainer" in Admin); removing is refused
  while the trainer has clients. Trainer and admin are separate roles.

### 2b. Invites, roster, end coaching
- A coaching invite is also an openGym invite code, so `INVITE_ONLY` keeps working. Lives 14 days;
  a revoked or lapsed one revokes its openGym code too.
- One live trainer per client (unique index); the tables allow more later.
- The client ends coaching as a block (no access, no messages). The trainer removes a client
  (access ends, the client keeps their data). Both keep the record. Pause stops alerts only.

### 2c. Email (Resend)
- Plain `fetch` to Resend. Env: `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_NAME`.
- Invite, Forgot password (reuses openGym's reset code; the old password keeps working; 1 hour;
  same answer for unknown addresses; only with `PASSWORD_LOGIN`), guardian link, signed copy.
- Health answers are never emailed.

### 2d. Document library
- Per trainer. Kinds: document to sign (text or PDF), form to answer, PDF to fill and return.
  Each new document needs the "I wrote this or have permission" tick.
- Drafts never reach clients; publishing freezes a version. Only never-published documents can be
  deleted. PDFs up to 10 MB in `DATA_DIR/coaching-files/` (by SHA-256, never swept by openGym).
- The sign-up packet is an ordered list. Sending a document, or asking current clients to do a
  new version, creates a request; open requests move to a new version when it is published.
- Higher Rep ships no third-party forms.

### 2e. Sign-up packet
- Date of birth first. Under 13: nothing is stored, no link is made.
- Required documents hold up "Cleared to train"; for a client under 18 a document to sign also
  needs the guardian. `clearanceOf()` in `packet.js` is what Phase 3 routes will ask. Nothing in
  the client's own tracking is ever locked.
- A record stores the exact text or file hash, version, typed name, signature image, time, time
  zone, device and app version. Records are insert only; a correction is a new record.
- Guardian signs on the same phone or by an emailed link (once, 7 days; a new link replaces it).
- A returned PDF may be photos of each page, joined into one PDF on the server.

### 2f. Client profile (trainer)
- `#/clients/:id`: header (age, start, paperwork), tags (warnings show in amber and on the
  roster), flagged answers ("Make it a tag"), still waiting with the guardian (email masked),
  private notes, injury log (empty until Phase 5), records with PDFs.
- Tags and notes are the trainer's only: no client route reads those tables.
- Export record (ZIP): a PDF per record, the signed and returned files, CSV and JSON, a SHA-256
  manifest; notes and tags only with the switch on.
- Retention: 5 years after coaching ends, for a minor at least 5 years after their 18th birthday.
  Shown, never deleted automatically.
- Logged: exports and guardian links sent. Not logged: opening a profile or record.

### 2g. Settings
- Trainer Branding: logo (PNG or JPEG, 2 MB), business name (optional; the trainer's own name is
  always shown too), tagline, email "from" name, six accent colours (white text 4.5:1 or better),
  contact email, phone, website. The accent is used only on the invite page, the emails and the
  client's trainer card. Read through `readBranding()`, Higher Rep's look as the default.
- New client defaults: Hands-on, Balanced (default) or Independent, stored on each new link.
- Phone number per client: a switch on the client profile, off for every new client, checked by
  the server. Email is shown to every client.
- Client: Coaching (trainer card and contact), My documents, Privacy (placeholder listing only
  what is true now). Everyone: Source code on Settings › About.

## Data model (`DATA_DIR/coaching.sqlite`, 6 migrations)

Every trainer-owned row carries `trainer_id`. Times are UTC ms; user ids are openGym's.

| Table | Holds |
|---|---|
| `trainers` | `user_id`, `branding` (JSON), `default_preset` |
| `links` | `trainer_id`, `client_id`, status (active, paused, ended, blocked), started, ended, ended by |
| `link_settings` | per link: preset, visibility, autonomy, notify (screen in Phase 3), `show_phone` |
| `invites` | code (also in `db.json`), first name, email, note, expires, opened, status, link |
| `clients` | date of birth, time zone |
| `guardians` | name, email, relationship, link token hash and expiry, signed |
| `documents`, `document_versions` | the library; versions frozen once published |
| `requests` | each time a client is asked for a document, required or not, done |
| `submissions` | answers, signature, signer, device, time zone (insert only) |
| `files` | hash, owner, type, size (PDFs, signatures, photos, logos) |
| `tags`, `notes` | the trainer's own, per client |

Activity log events go to openGym's audit log (`lib/coaching-audit.js` has the labels).

## Still open (Mike)
- Create the Resend account and add its DNS records at Porkbun (before real emails go out).
- Lawyer review of the waiver (it stays DRAFT until then) and the PAR-Q copyright check
  (PLAN.md, "Open before release").
- Which languages the coaching text ships in (English only for now).
