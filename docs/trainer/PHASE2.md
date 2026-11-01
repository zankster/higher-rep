# Phase 2: trainer and clients (plan)

Revised 2026-11-01 after Phase 1b and the document library were approved. It replaces the first
Phase 2 plan, which was written before those decisions. Nothing here is built until Mike says
"build". Follows PLAN.md ("Architecture", "Ready for more trainers", "Staying in sync with
upstream").

## What Phase 2 delivers

A trainer can invite a client with a link. The client signs up through the trainer's packet
(about you, intake, health questionnaire, waiver, guardian for 13 to 17). The trainer sees the
client on a roster and on a profile with tags, private notes and records, and can export a record.
Either side can end coaching. Emails go out for invites, password resets, guardian links and
waiver copies.

Not in Phase 2: programs and assignment (Phase 3), the dashboard metrics that need programs
(compliance, workouts today), chat (Phase 5), pain reports and photos (Phases 5 and 6), and
account deletion with the 30-day grace (its data rules are built in now, the screens come later).

## Steps, in build order

Each step ends with its tests passing and is one commit.

### 2a. Server base
- `api/coaching/` with its own modules. `db.js` opens `DATA_DIR/coaching.sqlite` with `node:sqlite`
  (Node 22.23 in the API image), WAL mode, and numbered migrations in a `schema_version` table.
- **Trainer role:** `u.trainer = true` on the user in `db.json`, like `u.admin`, plus a `trainers`
  row (either alone grants nothing). Set by the owner through its own route,
  `POST /api/admin/user/trainer`, so upstream's admin-role route stays untouched; removing it is
  refused while the trainer has clients. `GET /api/admin/users` reports it. Trainer and admin are
  separate: Mike is both.
- **Permission helper** `access.js`, the only door to coaching data:
  `isTrainer(u)`, `activeLink(trainerId, clientId)`, `requireOwnClient(req, clientId)`,
  `requireSelfOrTrainer(req, clientId)`. Every check is "this trainer's own active clients",
  never "the admin".
- Routes registered from `api/coaching/routes.js` into openGym's `routes` object (one hook line),
  each one listed in `openapi.yaml` under the `coaching` tag. Ids go in the query string (`?id=`),
  so openGym's dispatcher stays a plain lookup. 2a routes: `GET /api/coaching/me`,
  `GET /api/coaching/clients`, `GET /api/coaching/client`.
- **Built 2026-11-01** (`api/coaching/db.js`, `access.js`, `routes.js`; tests
  `api/test/coaching-db.test.js`, `coaching-access.test.js`).
- **Tests:** a permission test for every route (client A can't read client B, a trainer can't read
  a non-client or another trainer's client, an ended link reads nothing).

### 2b. Invites, roster, end coaching
- A trainer invite is one of openGym's own invite codes (so `INVITE_ONLY` keeps working) plus a
  coaching row that says which trainer it comes from, the client's first name and email, and when
  it expires (14 days). openGym burns the code only on invite-only instances, so registration is
  not hooked: the join page signs the person up the usual way, then `POST
  /api/coaching/invites/accept` links them (the same route links an existing account). A revoked or
  lapsed invite also revokes its openGym code, so it can't open an account.
- The invite link opens a page that names the trainer ("Mike Smith invited you to Higher Rep")
  with the trainer's branding.
- One active trainer per client in v1 (a unique index), but the tables allow more later.
- **End coaching:** the client can end it at any time (a block: the trainer loses access, no
  messages either way). The trainer can remove a client (access ends, the client keeps their own
  data). Both keep the liability record. Logged in the activity log.
- Minimal roster: search, the filter chips that work without programs (All, Paused), invite status
  (sent, opened, joined, expired) with Resend and Revoke.
- **Built 2026-11-01**, mock-ups approved the same day (inline in chat).
  - API: `api/coaching/routes.js` (invites, invite page, accept, pause, remove, end), migration 2
    (`invites`); tests `api/test/coaching-invites.test.js` with `coaching-harness.mjs`.
  - App: `views/Clients.jsx` (roster, `#/clients`), `components/InviteSheet.jsx`,
    `views/JoinInvite.jsx` (`#/join/<code>`), `views/Coaching.jsx` (client side, End coaching),
    `components/CoachingRow.jsx` (Settings), `lib/coaching.js`; tests `lib/coaching.test.js`,
    `views/Clients.test.jsx`. Marked hooks in `App.jsx`, `Login.jsx` (RegisterSheet exported),
    `Settings.jsx`.
  - Different from the mock-ups: the join page uses openGym's own sign-up sheet (name plus passkey
    or password) instead of email and password fields; "Download my documents and chat" joins the
    End coaching sheet in 2e; "Resend" is "Send new invite" (a fresh link) until email exists (2c).
  - Coaching copy is English only, through `ct()` in `lib/coaching.js`, until Mike picks languages.
  - Added after the build: a "Make trainer" switch in a user's Admin card, for the owner only
    (`components/TrainerRoleButton.jsx`); plain labels for the coaching events in the Admin
    activity log (`lib/coaching-audit.js`); and `scripts/trainer/test-copy.mjs`, which runs a
    local test copy (password sign-in on, the first account is the owner, data in the system temp
    folder; `--fresh` starts over).

### 2c. Email (Resend)
- `api/coaching/email.js` calls Resend's HTTP API with plain `fetch` (no new dependency).
  `RESEND_API_KEY` and `MAIL_FROM` in `.env`. Without a key it writes the email to the log instead,
  so development and tests never send anything.
- Emails: invite, password reset (self-serve "Forgot password", on top of openGym's admin reset
  codes), guardian signing link, waiver copy (waiver only, never health answers).
- The "from" name and the email look come from the trainer's branding.
- **Mike's part:** create the Resend account and add its SPF / DKIM records at Porkbun.
- **Built 2026-11-01**, mock-ups approved the same day (inline in chat).
  - API: `api/coaching/email.js` (the sender and the four emails); in `routes.js` invites with an
    address are emailed on Send and on Send new, `POST /api/coaching/invites/email` ("Email again",
    once per 10 minutes) and `POST /api/coaching/password/forgot`. Tests:
    `api/test/coaching-email.test.js`.
  - Forgot password reuses openGym's own reset code: the email links to `#/reset/<code>`, where
    the person types their email and a new password, and openGym's `POST /api/login/password-reset`
    redeems it. Unlike an admin's reset, asking for one leaves the current password working; an
    admin's pending code is never replaced. The link lives 1 hour; one per inbox per 2 minutes;
    the route answers the same for unknown addresses. Only while `PASSWORD_LOGIN` is on.
  - App: `components/ForgotPassword.jsx` (a marked line under "Sign in with password" in
    `PasswordAuth.jsx`), `views/ResetPassword.jsx`, the invite sheet says "Emailed to …", the
    roster has "Email again". Test: `views/CoachingEmail.test.jsx`.
  - The guardian and waiver emails are written and tested; they are sent from the sign-up packet
    in 2e. Email settings are in `.env.example` (`RESEND_API_KEY`, `MAIL_FROM`, `MAIL_NAME`).

### 2d. Document library (Settings › Documents)
- Per trainer. Three kinds: document to sign (pasted text or an uploaded PDF), form to answer
  (built in the app), PDF to fill and return.
- Drafts never reach clients. Publishing makes a new, frozen version. Each new document needs
  "I wrote this document or have permission to use it" ticked, stored with the time.
- The sign-up packet: an ordered list of documents; the others sit under "Not in the packet".
- Form builder: yes/no, short text, long text, choice, date, number, signature. A question can flag
  a "yes" and have an "if yes" follow-up. Wording kept exactly as typed. Autosave, Preview, Publish.
- Uploaded PDFs go to a coaching file store under `DATA_DIR/coaching-files/`, never swept by
  openGym's media cleanup, each file readable only by the people its row allows.
- Higher Rep ships no third-party forms. Mike adds his ACE PAR-Q and the waiver (marked DRAFT until
  the lawyer has reviewed it).
- **Built 2026-11-01**, mock-ups approved the same day (inline in chat; screens 4 to 6, the
  new-version and send screens, were new).
  - API: migration 3 (`documents`, `document_versions`, `files`, `requests`); `api/coaching/
    documents.js` (library, draft autosave, discard, publish, packet order, delete, recipients,
    send, PDF upload and read), `doc-body.js` (what a body may hold, when it can be published),
    `files.js` (the file store). Tests: `api/test/coaching-documents.test.js`.
  - `requests` is every time a client is asked for a document: the packet (2e), "Send to clients"
    and "ask current clients to do the new version". Open requests move to a new version when it
    is published. 2e marks them done when the client completes them.
  - App: `views/Documents.jsx` (Settings › Documents, packet reordered with openGym's own drag
    handles), `views/DocumentEdit.jsx` (autosaving editors for the three kinds, the form builder,
    packet switch, versions), `components/DocumentSheets.jsx` (Publish, Send, Preview). Test:
    `views/Documents.test.jsx`.
  - Different from the mock-ups: a document joins or leaves the packet with a switch on its own
    page rather than by dragging between the two lists; dragging reorders the packet. The
    client's home to-do (screen 6) comes with signing in 2e.
  - Only a never-published document can be deleted. Uploaded PDFs are capped at 10 MB.

### 2e. Sign-up packet (client)
- About you: date of birth on a neutral screen. Under 13: no account, nothing saved, not even the
  date of birth.
- Then the trainer's packet in order, with the step bar "from <trainer>".
- Flagged "yes" answers show the notice that the trainer will see it before the first session, and
  appear on the trainer's profile view.
- Signing: "I've read and agree", typed full name, finger signature. The record stores the exact
  text or file hash of the version signed, version number, time, time zone, device and app version,
  and the signature image. Records are never edited; a correction is a new record.
- 13 to 17: "A parent or guardian signs next", with name, email and relationship. They sign on the
  same phone, or by an emailed link (one-time, expires). The screen says what the guardian can do.
- "You're all set": waiver copy emailed, PDF download, everything under Settings › My documents.
- PDFs are written by a small plain-JS writer in `api/coaching/pdf.js` (text and the signature
  image, no dependency).
- **Built 2026-11-01.** Mike approved the mock-ups after changing these (all in the build):
  - The date of birth is kept for every client and the trainer sees it (roster shows the age).
    Under 13: no account link and nothing stored.
  - The trainer marks which packet documents are **required before training** (a switch on the
    packet list). A client is cleared only once every required request is done; for a client
    under 18 a document to sign also needs the guardian's signature. A new version or a document
    sent later can be made required again (switch on Publish and on Send, off by default on
    Publish). Optional documents never hold anything up.
  - A PDF to return may also be photos of each page; they are joined into one PDF on the server.
  - The guardian's link works once, for 7 days; a new link replaces the old one.
  - The signed-record PDF holds the exact text (or the PDF's name and SHA-256), version, typed
    name, signature image, date, time and time zone, device and app version, for the client and
    the guardian. Documents to sign are emailed as that PDF; forms never are.
  - API: migration 4 (`clients`, `guardians`, `submissions` insert only by trigger; `required` on
    documents and requests; `guardian_needed` and `client_done_at` on requests).
    `api/coaching/packet.js` (my/about, my/documents, my/files, my/file, my/submit, my/guardian,
    my/record, guardian, guardian/file, guardian/sign), `submission.js` (date of birth, age,
    answers, clearance), `pdf.js` (the writer). The invite accept now takes `dob` and makes the
    packet's requests. `POST /api/coaching/document/required`. Tests:
    `api/test/coaching-packet.test.js`.
  - App: the invite page asks the date of birth first (`components/PacketSteps.jsx`),
    `views/Packet.jsx` (#/packet: the steps, guardian, "You're all set" / "Almost there"),
    `views/MyDocuments.jsx` (Settings › My documents, PDF downloads), `views/GuardianSign.jsx`
    (#/guardian/<token>, no account), `components/SignaturePad.jsx`, the Home card
    (`components/PaperworkCard.jsx`, one marked line in `Home.jsx`), required switches on the
    packet, Publish and Send, and age plus "Waiting on guardian" / "N to sign" on the roster.
    Test: `views/Packet.test.jsx`.
  - "Not cleared" locks nothing yet, because plans and logged sessions for a client come in
    Phase 3; `clearanceOf()` in `packet.js` is what those routes will ask. The client's own
    openGym tracking is never locked.
  - Clients who joined before 2e are asked their date of birth from the Home card, then get the
    packet.
  - Not in 2e: the trainer reading a client's answers and records (2f, client profile), the
    retention table (2f, with the export), branding colours (2g).

### 2f. Client profile (trainer)
Mock-ups shown 2026-11-01 (seven screens). Mike's answers are below. Built 2026-11-01 (see the end of this section).
- **Opening a client:** tapping a roster row opens the profile (`#/clients/:id`). The row's menu
  today (send a document, export, pause, remove) moves to the profile's … button.
  Mike: yes (2026-11-01).
- Header: avatar, name, age and date of birth, start date, paperwork pill (Cleared to train /
  N to sign / Waiting on guardian), "Under 18" pill. Program comes in Phase 3.
- **Tags and notes are the trainer's only (yes).** Never shown or sent to the client, never in
  My documents: the client's routes don't read those tables at all.
- **Warning tags (yes):** a tag can be a warning; warnings are amber on the profile and beside the
  client's name on the roster. "+ tag" sheet: name and a Warning switch.
- **Tags from answers (yes):** a flagged yes answer offers "Make it a tag" (one tap, a warning).
- Notes: newest first, with date and "edited" date; tap to edit or delete.
- **Records (yes):** each signed document with version, signers and date; each form with its yes
  count. A form record lists the answers with flagged yes answers first; every record downloads
  as its PDF (the 2e record PDF, now readable by the trainer), and returned files open too.
- **Clients still waiting (yes):** what's still open, the guardian (name, masked email, when the
  link was sent and when it ends), and "Send <name> a new link" (same 2-minute limit as 2e).
- Injury log section, empty until the pain report (Phase 5). No decision needed now.
- **Export record (ZIP) (yes):** a PDF of every record, the returned files and signed PDFs, the
  same data as JSON and CSV, and a manifest with a SHA-256 for every file. Notes and tags only when
  the "Include my notes and tags" switch is on (off by default). ZIP written with `node:zlib`, no
  dependency. Every export goes in the activity log. Programs, logged workouts and chat join the
  export in later phases.
- **Retention (yes):** records kept 5 years after coaching ends; for a minor, until 5 years after
  their 18th birthday, whichever is later. The profile shows the date records may be deleted.
  Nothing is deleted automatically.
- **Activity log (don't log views):** exports are logged; opening a client's records is not.
- **Pause coaching:** stays where it is today; moves into the profile menu with the rest, but its
  holiday/injury-break version is Phase 3.
- Tables to add: tags, notes, retention (`ended_at` per client relationship, keep-until computed).
- **Built 2026-11-01** after Mike said "build 2f".
  - API: migration 5 (`tags`, `notes`). No `retention` table: the keep-until date is worked out from
    `links.ended_at` and the date of birth (`keepUntil` in `api/coaching/profile.js`).
    `profile.js` holds the trainer's routes: `client/profile`, `client/record`, `client/record/pdf`, tags
    (add, rename or warning, delete), notes (add, edit, delete), `client/guardian/link` and
    `client/export`. `zip.js` writes the ZIP with `node:zlib`. The roster's client rows carry `warnings`.
    `packet.js` now shares `emailGuardianLink` and `recordName`. Tests: `api/test/coaching-profile.test.js`.
  - App: `views/ClientProfile.jsx` (`#/clients/:id`), `components/ClientProfileSheets.jsx` (tag, note,
    record, export, send a document), helpers in `lib/coaching.js`. The roster row opens the profile and
    shows warning tags beside the name. Test: `views/ClientProfile.test.jsx`.
  - "Make it a tag" adds the tag in one tap. Its wording is the follow-up answer when that is short
    (40 characters at most), otherwise the question, shortened. Tap a tag to rename it, switch the
    warning on or off, or remove it.
  - The export ZIP holds `records/` (one PDF per record), `files/` (signed and returned PDFs),
    `records.csv`, `answers.csv`, `client.json`, `README.txt` and `manifest.json` (SHA-256 of every
    file). With the switch on it also holds `tags.csv` and `notes.csv`. CSV cells that a spreadsheet
    would run as a formula are written as text.
  - The guardian's email is masked on the profile (`da•••@example.com`).
  - Logged: exports and a guardian link sent by the trainer. Not logged: opening the profile or a
    record, and tag or note changes.

### 2g. Settings
- Client: My documents (read and download), Privacy (placeholder until photos), End coaching,
  the trainer's contact details.
- Trainer: Branding (name, logo, accent colour, contact details, email "from" name), read through
  one helper with Higher Rep's look as the default. Default client-settings preset.
- Everyone: "Source code" link to the public fork (AGPL).
- **Mock-ups shown 2026-11-01** (inline in chat: trainer Settings, Branding, Branding preview, New
  client defaults, client Settings, Coaching, Privacy; then the per-client phone switch). Mike's answers:
  - **Accent colour** shows only on the invite page, the emails and the trainer card. The rest of the
    app keeps Higher Rep's Coach blue.
  - **Six swatches** only, each with white text at 4.5:1 or better. No custom colour.
  - **Business name:** Mike wasn't sure. Built as an optional field: when it's empty, clients see the
    trainer's own name everywhere. Can be filled in later without anything else changing.
  - **Phone number:** the trainer decides per client. A "Show my phone number" switch on each client's
    profile (section "What <name> sees of you"), off for every new client. Branding shows "Shown to
    N of M clients". Email is shown to every client. Stored on the link (`link_settings`), checked
    by the server; a client with the switch off never receives the number.
  - **Preset descriptions** (Hands-on, Balanced, Independent) as mocked: OK.
  - **Source code** links to `github.com/zankster/higher-rep`: OK. The repository must be public
    before clients use the app; pushing still needs Mike's OK.
  - Privacy is a placeholder that lists only what is true now (signed documents and answers).
- **Built 2026-11-01** after Mike said "build 2g".
  - API: migration 6 (`link_settings.show_phone`, off by default). `api/coaching/branding.js` holds the
    six colours (each checked for white text at 4.5:1), `readBranding` (the one helper everything reads
    branding through, Higher Rep's look as the default) and the routes: `branding` (get, save field by
    field), `branding/logo` (PNG or JPEG, 2 MB, 32 to 4096 px a side), `logo` (public, only a hash that
    is some trainer's current logo), `default-preset`, `client/phone` and `my/trainer` (the client's
    trainer card; the phone number only when switched on). Tests: `api/test/coaching-branding.test.js`.
  - The trainer's own name stays their name everywhere ("Mike Smith invited you"); the business name
    shows beside it, never instead of it. Settings' Coaching row shows the business name when set.
  - New clients start Balanced until the trainer picks another default.
  - Emails: the business name heads them with the trainer's name below, the mark is the logo or the
    initials on the trainer's colour, and the sender reads "<Email from name> via Higher Rep".
  - App: `views/Branding.jsx` (`#/branding`, with the Preview sheet), `views/ClientDefaults.jsx`
    (`#/client-defaults`), `views/CoachingPrivacy.jsx` (`#/coaching/privacy`), the trainer card and contact
    rows in `views/Coaching.jsx`, "What <name> sees of you" on the client profile,
    `components/TrainerBrand.jsx` (mark, invite header), and the Settings rows in `CoachingRow.jsx`.
    The Source code row is on Settings › About & updates, for everyone. Test: `views/Branding.test.jsx`.
  - The invite page keeps Higher Rep's look for a trainer who set nothing. A branded one shows the
    header on the first step (date of birth) too.
  - Text fields save after a short pause; email, phone and website save when the field is left, so a
    half-typed address is not refused while typing.
  - Not logged: branding changes and the phone switch.

## Data model (SQLite, `coaching.sqlite`)

Every row that belongs to a trainer carries `trainer_id`. Times are UTC milliseconds, with the
time zone stored where the local time matters. User ids are openGym's (`db.json`).

| Table | Holds |
|---|---|
| `trainers` | `user_id`, branding (name, logo file, accent, contact, mail-from name), default settings preset |
| `links` | `trainer_id`, `client_id`, status (active, paused, ended, blocked), who ended it and when, started_at |
| `link_settings` | per link: visibility, autonomy, preset name, notify flags (stored now with the trainer's default preset; the screen comes in Phase 3, see SPEC-client-settings.md) |
| `invites` | `trainer_id`, openGym invite code, first name, email, status, expires_at, link_id once joined |
| `clients` | `client_id`, date of birth, time zone, guardian needed (yes/no) |
| `guardians` | `client_id`, name, email, relationship, signing token hash, token expiry, signed_at |
| `tags` | `trainer_id`, `client_id`, text, warning (yes/no) |
| `notes` | `trainer_id`, `client_id`, text, created_at, edited_at |
| `documents` | `trainer_id`, kind (sign, form, pdf_return), title, in_packet, packet_order, rights_confirmed_at |
| `document_versions` | `document_id`, version, status (draft, published), body (text, form JSON or file hash), published_at |
| `submissions` | `trainer_id`, `client_id`, `document_version_id`, answers JSON, flagged yes count, signer (client or guardian), typed name, signature file, device, app version, time zone, signed_at. Insert only. |
| `files` | hash, size, type, owner, who may read (trainer, client, both), created_at. For uploaded PDFs, signature images and logos |
| `retention` | `client_id`, `trainer_id`, coaching_ended_at, keep_until (5 years after, or after the 18th birthday plus 5 for minors) |
| `audit` | who, what, which client, when (exports, ending coaching, record views) |

Thought ahead for later phases, not built now: programs, blocks and week targets (Phase 3),
appointments and tasks (calendars), events for swaps and moves, chat, check-ins, scheduled jobs
and per-client summaries. Each gets its own tables with `trainer_id` in its phase.

## Not mocked yet (show before building those parts)
- Trainer's invite screen (name, email, Send; the link to copy) and the invite page the client opens.
- Roster screen with invite status.
- End coaching confirms (client side and trainer side).
- The four emails (invite, reset, guardian link, waiver copy).
- Sending a document to existing clients, and asking them to sign a new version (already noted in
  PLAN.md as "show it before building").

## Mike's part
- OK this plan, then say "build".
- Create the Resend account and add the DNS records at Porkbun (only needed before real emails go
  out; development logs emails instead).
- Lawyer review of the waiver (it stays DRAFT until then) and the PAR-Q copyright check (PLAN.md,
  "Open before release").
