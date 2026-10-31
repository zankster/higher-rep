# Trainer app: features

Inspired by Everfit, Trainerize, FitPros, QuickCoach, Hevy Coach, Kahunas and CoachRx. ✅ means openGym already has it.

## People
- **Trainer** (Mike): manages clients, builds and assigns programs, reviews workouts, chats.
- **Client:** joins from Mike's invite, follows the assigned program, logs workouts, checks in, chats with Mike.

## Permissions (plain English; the API implements exactly these)
- A client sees and edits only their own data.
- A trainer sees their own clients' workouts, programs, measurements, photos and check-ins, and nobody else's.
- Only the trainer can assign or change a client's program. The client can still log, swap or skip exercises during a workout.
- A chat thread is visible only to its trainer and that client.
- Removing a client ends the trainer's access. The client keeps their own data.
- Server admin (Mike) keeps openGym's admin tools: invites, disable or delete accounts, activity log.

## V1 features
**Programs and logging**
- ✅ Exercise library: 5,632 exercises plus custom ones with your own photo or video.
- ✅ Guided workout, rest timer, supersets, PRs, estimated 1RM, progression rules.
- Program builder: weeks → days → exercises with sets, reps, load, RPE / %1RM, tempo, rest and notes.
- Templates. Copy a program to another client. Assign with a start date, which fills the client's calendar.
- Trainer feed of completed workouts, with comments, PRs, and compliance % per client.

**Communication**
- One chat thread per client (text and photos), plus comments on a workout.
- Push notifications for new messages, new programs and check-in reminders.

**Progress**
- ✅ Body weight and measurements.
- Progress photos (front, side, back) with a side-by-side compare.
- Weekly check-in forms the trainer designs. A daily habits checklist.
- Charts per client: strength, body weight, measurements, compliance.

## Later
Nutrition (macro targets, meal logging), Stripe payments and packages, automations (scheduled messages, onboarding sequences), group programs and challenges, AI-drafted programs.
