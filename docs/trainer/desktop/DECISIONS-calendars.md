# Trainer desktop: features and decisions per screen

All approved by Mike on 2026-11-01. The full spec is in [`SPEC-calendars.md`](SPEC-calendars.md) and the
mock-ups are in [`mockups/`](mockups/).

## Decisions for all four screens

- **One app:** the desktop screens are the same React app as the phones, at `app.higherrep.com`. No
  second app.
- **Desktop first** for trainer screens, with phone versions kept.
- **Style:** the look of Mike's calendar mock-ups. Coach blue #2457E6, #f2f2f7 background, white
  rounded cards, system font, and the WCAG AA contrast from PLAN.md.
- **Main menu:** Dashboard, Clients, Programs, Calendar, Messages, Library.
- **Calendar is one section** with three views: My schedule, All clients, One client.
- **Status is always an icon plus a word:** Done, Missed, Planned, Check-in/task, Rest. Never colour
  alone.
- **Selection:** a highlight and outline, never a round checkbox, because a checkbox looks like
  "done".
- **Think ahead:** usefulness over speed. The data models in Phases 2 and 3 must already support
  dated programs, blocks, appointments, tasks and program versions (SPEC-calendars.md, "Data the
  screens need").

## 1. My schedule

**Features**
- Week view (Mon to Fri by default) and Agenda view.
- A "Show weekend" checkbox.
- A time-zone picker (the trainer's own zone).
- "+ New appointment".
- The "To do this week" strip for tasks with no set time.
- The time grid follows working hours and scrolls for earlier or later times.
- Appointment types: in person, live session (linked to the client's workout), call or video, and a
  meeting with a guardian.
- A details panel for the selected appointment, with Message, Edit appointment and Open workout.

**Decisions**
- Tasks are kept apart from the time grid so they don't clutter it.
- The app adds tasks itself, each with its reason:
  - "Plan <client>'s next block" a week before a block ends;
  - "Review N check-ins";
  - "Message <client>" after missed workouts.
- Colours: blue means in person, grey means call or video.
- **Appointments are in v1** (the trainer enters them). Clients booking times themselves stays after
  v1.

## 2. All clients (week)

**Features**
- Week grid with one row per client and Mon to Sun columns.
- Search, a Show filter (All, Needs attention, Unread, Paused), and a Sort menu.
- Day / Week switch.
- A reason line under each name, and an "Under 18" tag for clients aged 13 to 17.
- A completion column with a bar and the last-4-weeks figure.
- Clicking a client opens their calendar. Clicking a day opens that workout.

**Decisions**
- The completion column is **"This week so far"** (done of those due up to today). Future days never
  count against the client.
- "Last 4 weeks: N%" sits underneath for the trend.
- The bar turns **amber below 70%**.
- Default sort: **Needs attention first** (missed workouts, then program ending, then check-in to
  review, then the rest), the same order as the dashboard.
- A day with nothing shows a single "–".
- A client with nothing due yet shows "0 of 0 so far", not "No workouts due".

## 3. One client (client calendar)

**Features**
- A client picker as the title, with program, block and week underneath.
- Month / Week / Block views.
- "Open in program builder".
- Seven equal day cards, each with "+ Add".
- A selected-workout bar with Open workout, Move to date and More….
- Move to date: pick a date, choose "This workout only" or "Shift the rest of the block", see a
  warning if that day is taken, then Review changes.
- More… menu: Swap with another day, Make it a rest day, Skip, Delete.

**Decisions**
- A workout done in a live session is **one card**: the workout, its result, and "Live with Mike" with
  the time and place. It is never a separate session card.
- **Moving a workout never saves straight away:** "Review changes" lists every date that changes
  first.
- The default is "This workout only". Shifting the rest of the block moves the deload too.
- Done cards show the effort rating. Planned cards show their length.
- The header shows one date range, not the month name as well.

## 4. Program builder

**Features**
- Client and program pickers.
- "All changes saved · N not published", "Preview as <client>", and "Publish to <client>" ("Assign…"
  when there's no client yet).
- A library panel with search, Exercises / Templates tabs and filter chips. Drag exercises onto a
  day, or a template onto a week. A drop spot shows where it will land.
- A blocks bar (for example Hypertrophy, then Strength, then Deload) with "+ Block". The current
  block is filled blue.
- A week bar with navigation, Today, the Program / Calendar switch and "Copy week to…".
- Seven equal day columns with the workout name and length, slot letters (A, B, C1, C2) and the
  prescription.
- A progression panel for the selected exercise, showing every week of the block plus the deload,
  and a row with what the client actually did.

**Decisions**
- **Publish before the client sees edits:** changes to a program a client already follows wait for
  "Publish to <client>". Edits still save automatically. Assigning to a new client keeps the Phase 1
  confirm step.
- **A line between every exercise** in a day (Mike's request), and all columns equal width with
  equal gaps (Mike's layout).
- Rest days are full-height columns with "Rest" and their own "+ Add". There's one "+ Add" per day,
  not two.
- The check-in is a small tag on its day, not a card, so the day still reads as rest.
- The program picker always shows the program's name, never "—".
- **Edits apply to:** This week / Selected weeks / Whole block (Mike's idea).
- The progression table shows the client's actual result next to the target, with "on target"
  when they match.
- The footnote says where the load comes from (% of the client's 1RM) and whether the progression is
  a rule or set by hand.

## Open (not decided yet)

- Agenda, Day, Month and Block views.
- The New and Edit appointment form, and whether appointments repeat.
- The "Selected weeks" picker, the "Copy week to…" dialog, and the Review changes screen.
- Phone versions.
- What the client sees of each item, which depends on the client visibility settings still to be
  mocked.
