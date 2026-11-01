# Trainer app: features

Inspired by Everfit, Trainerize, FitPros, QuickCoach, Hevy Coach, Kahunas and CoachRx. ✅ means openGym already has it.

## People
- **Trainer** (Mike): manages clients, builds and assigns programs, reviews workouts, chats.
- **Client:** joins from Mike's invite, follows the assigned program, logs workouts, checks in, chats with Mike.

## Permissions (plain English; the API implements exactly these)
- A client sees and edits only their own data.
- A trainer sees their own clients' workouts, programs, measurements and check-ins, and nobody else's.
- Progress photos are private to the client by default. The trainer sees only the photos the client chose to share, and the client can stop sharing at any time, which removes the trainer's access.
- Only the trainer can assign or change a client's program. The client can still log or skip exercises during a workout, and swap only within the limits the trainer set (the listed alternates, or any exercise if the trainer allows it).
- The trainer's private notes and tags on a client are never visible to that client.
- The trainer can log a workout on a client's behalf during a live session. It's saved to the client's history and marked "Logged by Mike".
- Intake answers, the health questionnaire and the signed waiver are visible to the client and their trainer only, and are kept after the client is removed (liability record).
- A chat thread is visible only to its trainer and that client (and, for a client under 18, their guardian; see Safety).
- Clients can never find, see or message other clients. Nothing in the app is public.
- Messages are never silently deleted. An edit shows "edited" and the original is kept. Either side can export the full thread.
- The trainer can't download or export a client's progress photos. Every time the trainer views a shared photo is logged, and the client can see that log.
- A client can end the coaching link at any time. That works as a block: the trainer loses access, and neither side can message the other.
- Removing a client ends the trainer's access. The client keeps their own data.
- Server admin (Mike) keeps openGym's admin tools: invites, disable or delete accounts, activity log.

## Safety and appropriate content
No automatic word or image filters: they would flag legitimate progress photos and injury talk ("groin strain", slang), and scanning would send private photos to a third party. Safety comes from design, consent and a record.
- **Who can talk:** invite-only. Chat is only ever one client with their trainer.
- **Progress photos:**
  - The camera screen shows a photo guide ("fitted workout clothes: shorts and a sports bra or tank top, same spot, same light") and a pose outline for front, side and back.
  - Optional face blur or crop before sharing.
  - Photos stay inside the app: never saved to the phone's camera roll, never shown in notifications or lock-screen previews.
  - Android blocks screenshots on photo screens. iPhone detects a screenshot and tells the client.
  - Stopping sharing or deleting a photo removes it from the trainer's view immediately.
- **Notifications** never show message text or images. They say only "New message from Mike" or "New message from <client>".
- **Report a message:** both sides can report one. The reporter gets a copy of the thread by email, so a client's report doesn't depend on the trainer, who is also the admin.
- **Report pain or injury:** a structured form, available in chat and after a workout.
  - On openGym's body map (`lib/body-paths.js`), the client taps where it hurts, picks a pain level (0–10), what it feels like (sharp, dull, tight, swelling) and when it happens.
  - The report is saved to the client's injury log and shown on their profile and in the program builder.
  - Warning signs (chest pain, numbness or tingling, dizziness, pain above 7, sudden swelling) show "Please see a doctor or physio before training this area". The app never gives a diagnosis.
- **Clients under 18:**
  - Date of birth is collected at sign-up.
  - A parent or guardian signs the waiver and PAR-Q+.
  - Progress photos are off by default, and only fully clothed photos are allowed.
  - The guardian is linked to the account and can read the chat (or receives copies), so there's no private one-to-one messaging with a minor.
- **Terms of use and conduct:** zero tolerance for abusive or sexual content. Mike's contact details are in Settings. All coaching communication stays in the app.
- **App store notes:** App Review notes explain that chat is invite-only and trainer-to-client only, and show where reporting and blocking are.

## V1 features
**Programs and logging**
- ✅ Exercise library: 5,632 exercises plus custom ones with your own photo or video.
- ✅ Guided workout, rest timer, supersets, PRs, estimated 1RM, progression rules.
- Program builder: weeks → days → exercises with sets, reps, load, RPE / %1RM, tempo, rest and notes. Works well on a computer as well as a phone.
- Workout formats beyond straight sets and supersets: circuits, AMRAP, EMOM and intervals.
- Alternate exercises per slot ("if the bench is taken, do dumbbell press"), plus a per-client setting for how freely they may swap.
- Templates. Copy a program to another client. Assign with a start date, which fills the client's calendar.
- **Live session mode:** the trainer runs a client's workout on the trainer's phone in the gym, and it lands in the client's history.
- After each workout the client rates effort (1–10) and adds an optional note.
- Trainer feed of completed workouts, with comments, PRs, effort ratings, and compliance % per client.

**Clients and onboarding**
- Intake form at sign-up: goals, training history, injuries, schedule, equipment.
- Health questionnaire (PAR-Q+) and a waiver the client signs in the app, stored with a date.
- Assessments and fitness tests (e.g. 1RM, push-ups, plank, timed mile, movement screen), with a retest reminder every 4–8 weeks and results charted over time.
- Private trainer notes and tags on each client (e.g. "knee: no deep lunges", "athlete", "online").

**Communication**
- One chat thread per client: text, photos, voice notes, and form-check videos. Plus comments on a workout.
- Push notifications for new messages, new programs and check-in reminders.
- Scheduled messages (write now, send later) and automatic check-in reminders.
- Alerts on the trainer dashboard: missed workouts, check-in overdue, program ending within 7 days.

**Progress**
- ✅ Body weight and measurements.
- Progress photos (front, side, back) with a side-by-side compare.
- Weekly check-in forms the trainer designs. A daily habits checklist.
- Charts per client: strength, body weight, measurements, assessments, compliance.
- **Weekly progress report**, sent to each client automatically (push + in the chat thread): workouts done vs planned, PRs, effort, weight and measurement changes, check-in status, and a short note from the trainer. The trainer can preview it and add the note before it goes out, or let it send as is.

## Next phases (after v1)
- **Booking and session packages:** book sessions and track "8 of 12 sessions left", synced with the trainer's calendar.
- **Habits with streaks and badges** (steps, water, sleep, protein). Badges for PRs and streaks.
- **Wearables:** sleep, steps, heart rate and HRV from Apple Health or Google Health Connect (openGym already reads Health data: `lib/health-*.js`, recovery model in `lib/recovery.js`).
- **Periodization view:** training blocks, deload and test weeks on a timeline.
- **Resource library:** guides, PDFs and articles for clients.
- **Groups:** group programs, group chat, challenges and leaderboards.
- **Import a client's history** from other apps (openGym already imports Hevy and Strong: `lib/import-*.js`).

## Later
Nutrition (macro targets, meal plans, photo meal logging), Stripe payments, onboarding sequences and other automations, AI-drafted programs (openGym has an AI coach).

## Not planned
Branded-app tiers (this is the branded app), video calls (use FaceTime or Zoom), lab reports, supplement plans, website builder, marketplace, multi-trainer teams, cycle tracking (revisit if needed).
