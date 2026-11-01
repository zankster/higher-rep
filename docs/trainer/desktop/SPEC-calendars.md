# Trainer desktop: calendars and program builder (spec)

Approved by Mike on 2026-11-01 (Phase 1b, trainer desktop design). Nothing here is built yet.
Mock-ups: [`mockups/`](mockups/). Open the `.html` files in a browser; `canvas-source/` holds the
editable originals. Live canvas (private to Mike): https://claude.ai/artifact/7VDeE7WcT7zeACN6hrU9sz.
Feature and decision list: [`DECISIONS-calendars.md`](DECISIONS-calendars.md).

## Scope

- These are the trainer's screens in a desktop browser at `app.higherrep.com`. It's the same React
  app as the phone apps, not a second app.
- They're laid out for mouse and keyboard first. Each one still has to work at phone width: the menu
  wraps, and wide grids scroll sideways inside their own box.
- They cover four screens: **My schedule**, **All clients**, **One client** (client calendar), and the
  **Program builder**.
- Not covered yet: the client's own phone screens for these, analytics, client settings, and the
  full periodization view. Those are the remaining parts of Phase 1b.

## Shared look (all four screens)

- **Base:** openGym's iOS-style look with the approved Coach blue.
  - Page background #f2f2f7, white cards with 12 to 14 px corners, system font.
  - Accent #2457E6 with white text on it.
- **Text colours:** primary #1c1c1e and secondary rgba(60,60,67,.82). Text that carries meaning must
  reach 4.5:1 contrast (PLAN.md, Contrast).
- **Controls:** buttons and fields are at least 40 px tall.
  - Primary: blue fill. Secondary: white with a grey border.
  - Segmented switches have the selected part filled blue.
- **Main menu**, along the top: Dashboard, Clients, Programs, Calendar, Messages (with an unread
  count), Library, and the account avatar. The current section is blue and underlined.
- **Calendar section:** a grey switch under the menu with My schedule / All clients / One client.
- **Status language, always an icon plus a word, never colour alone:**

  | Status | Icon | Colour |
  |---|---|---|
  | Done | Check in a circle | Green #1E7B34 |
  | Missed | Warning triangle | Red #b3261e |
  | Planned | Calendar | Blue #2457E6 |
  | Check-in or task | Clipboard | Amber text #8a5300 on #fff4e0 |
  | Rest | Bed | Grey |

- **Today:** today's column or card has a blue header ("Wed 11 · Today") and a light blue tint
  (#f4f7fe), or a blue outline.
- **Selection:** the selected item gets a light blue fill and a blue outline or left bar. Round
  checkboxes are never used for selection, because they look like "done".
- **Week navigation, the same everywhere:** ‹, the date range, ›, and Today.
- **Example data:** all four mock-ups show the same week (Nov 9 to 15, 2026, today Wednesday the
  11th) and the same clients, so they agree with each other.

## 1. My schedule

The trainer's own time: in-person sessions, calls, and tasks.

- **Header:** title, week navigation, Week / Agenda switch, "Show weekend" checkbox (off by default,
  so Mon to Fri), time-zone picker (the trainer's own zone), and "+ New appointment".
- **To do this week strip:** tasks with a due day but no set time, shown as cards. Each card has an
  icon, a title, and a reason line.
  - Some tasks the app adds itself, for example:
    - "Review 3 check-ins · Due today · Ava, Chloe, Dev"
    - "Plan Ava's next block · Due Fri · added because Block 2 ends in 7 days"
    - "Message Ben · 2 missed workouts this week"
  - The trainer can also add tasks.
- **Time grid:**
  - Day columns with hour rows. The rows follow the trainer's working hours (the mock-up shows 7 AM
    to 8 PM) and the grid scrolls for earlier or later times.
  - Each appointment sits at its real start time and length.
  - Blue means in person, grey means call or video.
- **Appointment types:**
  - in person with a client, with a place (for example "Gym");
  - a live session, an in-person session where the trainer logs the workout. It links to that
    client's workout ("Ava · Upper A, live session");
  - a call or video;
  - a meeting with a client and their guardian ("Dev + guardian").
- **Details panel**, shown when an appointment is selected:
  - avatar, client, workout, date, time, place, block and week, status ("Done, logged by Mike");
  - buttons: Message, Edit appointment, Open workout.
  - With nothing selected it says "Select an appointment to see details".
- **Agenda view:** the same items as a list by day (not mocked yet).
- **Not in v1:** clients booking times themselves (after v1, PLAN.md). Here the trainer enters
  appointments.

## 2. All clients (week)

Who's on track this week, one row per client.

- **Header:** week navigation, client search, "Show" filter, "Sort" menu, Day / Week switch.
  - Show: All clients, Needs attention, Unread, Paused.
  - Sort: Needs attention first (the default), Lowest completion, Program ending, Name.
- **Table:** Client | Mon to Sun | This week so far.
  - **Client cell:** the name links to that client's calendar. Under it is one reason line
    coloured by status:
    - "2 missed workouts" (red)
    - "Program ends in 7 days" (amber)
    - "Check-in awaiting review" (amber)
    - "On track" (green)
  - Clients aged 13 to 17 get an "Under 18" tag.
  - **Day cells:** the workout or check-in with its status (icon and word). A day with nothing shows
    "–". Clicking a cell opens that workout.
  - **This week so far:**
    - workouts done of those due up to today ("0 of 2 · 0%");
    - a bar that turns amber below 70%;
    - "Last 4 weeks: 61%" underneath.
    - Future days don't count against the client.
- **Needs attention order:** missed workouts, then program ending within 7 days, then check-ins to
  review, then everyone else. This matches the dashboard's "Needs attention" order.
- **Day view:** today across all clients, as a list (not mocked yet).

## 3. One client (client calendar)

One client's plan by date, and the place to move workouts.

- **Header:**
  - a client picker that doubles as the title;
  - a subtitle with program, block and week ("Strength 2026 · Block 2, Strength · week 6 of 9");
  - week navigation, the Month / Week / Block switch, and "Open in program builder".
- **Week view:** seven equal day cards, each with its items and a "+ Add" at the bottom.
  - A workout done in a live session is **one card**: "Upper A · Done · 1 PR", then "Live with Mike,
    6:00 to 7:00 PM · Gym". It is never shown as two separate items.
  - A done card shows the effort rating ("Done · effort 8"). A planned card shows its length.
  - Rest days show "Rest". A check-in shows as an amber card ("Weekly check-in · Due").
- **Selecting a workout** highlights it and opens a bar under the grid:
  - the workout name and date, a one-line summary of its exercises, and its length;
  - buttons: Open workout, Move to date, More….
- **Move to date** opens a small panel:
  - a new date;
  - "What else moves":
    - **This workout only** (the default). Other workouts stay where they are.
    - **Shift the rest of the block** by the same number of days. Everything after it moves,
      deload included.
  - A warning when the new day already has a workout ("Fri 13 already has Upper B, so Ava would
    have 2 workouts that day").
  - **Review changes** shows every date that would change before anything is saved.
- **More… menu (agreed, not drawn):** Swap with another day, Make it a rest day, Skip, Delete.
- **Month view:** a month grid with the same cards, shortened. **Block view:** the block's weeks as
  rows. Neither is mocked yet.

## 4. Program builder

Building and editing a program, desktop first.

- **Top bar:**
  - Client and Program pickers;
  - save state: "All changes saved · 3 not published";
  - "Preview as <client>" and "Publish to <client>".
  - On a program with no client yet, the main button is "Assign…".
- **Saving and publishing (decided):**
  - Edits save automatically.
  - For a program a client already follows, **nothing reaches the client until the trainer taps
    Publish**. The bar counts the unpublished changes.
  - Assigning a program to a new client keeps the confirm step from Phase 1 (client, start date,
    Assign).
- **Library (left panel):**
  - search, Exercises / Templates tabs, and filter chips (body part, equipment, "Mine");
  - exercises listed with a drag handle;
  - drag an exercise onto a day, or a template onto a week to fill it;
  - a drop spot appears where the item will land.
- **Blocks bar:** the program's blocks as cards with name, weeks and status ("Block 2 · Strength ·
  Weeks 5 to 8 · now in week 6"). The current block is filled blue. "+ Block" adds one.
- **Week bar:** week navigation ("Week 6 · Nov 9 to 15, 2026"), Today, a Program / Calendar switch
  (Calendar opens the One client view), and "Copy week to…".
- **Day columns:**
  - Seven equal columns with the same gap between them. Rest days are the same height as workout
    days.
  - Each day has a header (date, plus "Done" once logged), then a workout bar (name and length, for
    example "Lower A · 55 min").
  - Then the exercises, **with a line between each one**: the slot letter and name ("A · Back
    squat", "C1 · Split squat" for a superset pair), and under it the prescription ("4×5 · 80% ·
    RPE 8").
  - "+ Add" at the bottom of every day.
  - The check-in shows as a small tag on its day.
  - Today has a blue outline.
- **Progression panel** (below the week, for the selected exercise):
  - the title ("Back squat · Block 2 progression") and where it was selected from;
  - **Edits apply to:** This week / Selected weeks / Whole block, plus "Edit sets";
  - a table with one column per week of the block plus the deload, this week tinted. Rows:
    - Sets × reps;
    - Load (% of 1RM);
    - Effort (RPE);
    - **"<Client> did"**: the actual result, with RPE and "on target" when it matches.
  - A footnote says how the load is worked out ("from Ava's 1RM (128 kg)") and whether the
    progression is a rule or set by hand.

## Data the screens need (for Phases 2 and 3)

These follow PLAN.md's rule that early data models must not block later features.

- **Every item belongs to a trainer** (`trainer_id`) and, where relevant, a client.
- **Programs** are made of blocks, blocks of weeks, weeks of days, and days of workouts with
  exercise slots. A slot has a label (A, B, C1, C2), an exercise, and targets **per week** (sets,
  reps, load as % of 1RM or weight, RPE, tempo, rest).
  - A progression rule can fill the targets, or they can be set by hand. The table stores the
    resulting numbers.
- **Scheduled workouts** have a real calendar date for each client, from the assignment's start
  date. Moving one changes its date. "Shift the rest of the block" changes the date of every later
  workout. Logged results link back to the scheduled workout.
- **Appointments:** trainer, optional client, start and end (stored in UTC with a time zone), type
  (in person, live session, call, video), place, an optional linked scheduled workout, and notes.
  They're needed in v1 because My schedule shows them.
- **Tasks:** trainer, optional client, title, reason, due date, done, and whether the app made it
  (and from what rule, for example "block ends in 7 days").
- **Program versions:** edits to an assigned program are kept as unpublished changes until Publish.
  Each publish is a version, so a client's history always points at what they were actually given.
- **Weekly summaries** per client (done of due so far, last 4 weeks, reason line) are computed on
  the server from the per-client summaries (PLAN.md, Architecture). The All clients grid reads only
  summaries.
- **Time zones:** workouts are dates in the client's time zone, and appointments are times shown in
  the viewer's time zone.

## Still to design

- Agenda (My schedule), Day (All clients), and Month and Block views (One client).
- The New and Edit appointment form, including whether appointments can repeat.
- The "Selected weeks" picker in the progression panel, and the "Copy week to…" dialog.
- The "Review changes" screen for moved workouts.
- The phone versions of the four screens.
- What the client sees of all this, which depends on the client visibility settings still to be
  mocked.
