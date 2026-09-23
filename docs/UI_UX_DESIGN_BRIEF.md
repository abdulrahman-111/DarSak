# Dars / درس — Complete UI/UX Design Brief

Version: 1.0

Audience: Product designer / UI/UX designer

Platforms: Responsive web application, mobile first

Languages: Arabic and English

Primary market: Egypt

## 1. The product in one sentence

Dars is a bilingual platform where private teachers organize their teaching groups, schedules, students, lessons, and learning materials, while students discover suitable teachers and groups, request enrollment, follow a personal timetable, and access the resources for classes they have joined.

## 2. Product vision

Private tutoring is often managed through scattered WhatsApp chats, spreadsheets, paper schedules, cloud-drive links, and verbal agreements. Dars brings the core workflow into one calm, trustworthy place without trying to replace the teacher.

The product should feel:

- Organized enough for a professional teacher managing many groups.
- Simple enough for a secondary-school student using it from a phone.
- Trustworthy enough for private schedules and learning materials.
- Familiar to Egyptian users in both Arabic and English.
- Flexible enough for National, IG/British, and university education.

The main success story is:

> A teacher creates and publishes a group, a student discovers it and requests to join, the teacher accepts the request, and the group automatically appears in the student's timetable. The teacher then creates lessons and uploads resources that only accepted students can access.

## 3. Product principles

1. **The next action should always be obvious.** Dashboards should answer “What needs my attention?” before showing analytics.
2. **Timetables are a primary interface.** Schedules should be readable at a glance on a phone and powerful enough on desktop.
3. **Status must be visible.** Enrollment, teacher approval, group publication, lessons, reports, and accounts all have states that should never be hidden.
4. **Privacy should be understandable.** Clearly distinguish public teacher/group information from private rosters and materials.
5. **Arabic is a first-class experience.** RTL must be designed intentionally rather than produced by mirroring English at the end.
6. **Dense management screens still need calm hierarchy.** Use progressive disclosure, filters, and focused detail pages instead of putting every control on one dashboard.
7. **The system should feel useful even with little data.** Empty states should explain the benefit and provide a clear action.

## 4. Users and roles

### Student

Students may be in National education, IG/British education, or university. They mainly use a phone. They want to find the right teacher/group, understand when lessons happen, know whether their request was accepted, and quickly open lesson materials.

Primary student needs:

- Create and edit a profile.
- Select an education context.
- Discover relevant teachers and groups.
- Request enrollment and follow its status.
- See enrolled classes and a personal timetable.
- Open lesson details and private resources.
- Receive in-app updates.
- Report a problem.

### Teacher

Teachers may serve multiple education systems, grades, or university courses. They need a professional command center for groups, enrollment, schedules, lessons, and resources.

Primary teacher needs:

- Build a public teaching profile.
- Select several specializations.
- Create, edit, publish, archive, and inspect groups.
- Define recurring weekly schedule slots without conflicts.
- Review enrollment requests and group capacity.
- View group rosters and remove students when needed.
- Create dated lesson occurrences.
- Reschedule, cancel, or complete a lesson.
- Attach PDFs, images, notes, and safe web links.
- See a combined weekly timetable.
- Receive actionable notifications.

Teacher accounts require administrator approval before they can publish publicly. The design must explain the pending-approval state without making the product feel broken.

### Administrator

Administrators maintain platform integrity and the academic catalogue. They need clear, efficient management interfaces rather than a marketing-style dashboard.

Primary administrator needs:

- Approve teachers.
- Activate or suspend accounts.
- Maintain education systems, levels, grades, universities, faculties, departments, years, subjects, courses, and offerings.
- Inspect groups.
- Review and resolve reports.
- Manage platform settings.
- See basic operational analytics.

## 5. Academic model the UI must explain

The product must not hardcode one school system into the group experience. A group refers to a reusable academic offering.

### School path

Education system → level → grade/year → subject

Examples:

- National → Secondary → Secondary 3 → Mathematics
- IG/British → IGCSE → Year 10 → Physics

### University path

University → faculty → department/program → academic year → course

Example:

- Assiut University → Engineering → Electrical Engineering → Year 3 → Control Systems

The catalogue must also support general university courses that are not tied to one institution, such as Calculus I or Programming Fundamentals.

For users, this should appear as guided selection and understandable breadcrumbs. Avoid exposing database-like terminology such as “nodes” or “offerings.” Use human labels such as Education system, Level, Grade, University, Faculty, Program, Academic year, and Subject/Course.

## 6. Information architecture

```text
Public
├── Home
├── Discover teachers
├── Teacher profile
├── Discover groups
├── Group details
├── Sign in
└── Create account

Shared authenticated
├── Role dashboard
├── My profile
├── Notifications
├── Report a problem
├── Language switcher
└── Sign out

Student
├── My classes
├── Enrollment requests
├── My timetable
├── Lesson details
└── My materials

Teacher
├── Overview
├── Public profile and specializations
├── My groups
│   ├── Create/edit group
│   └── Group workspace
│       ├── Overview
│       ├── Weekly schedule
│       ├── Enrollment requests
│       ├── Students
│       └── Lessons
├── All requests
├── All students
├── My timetable
├── All lessons
└── Lesson workspace

Administrator
├── Overview and analytics
├── Users
├── Teacher approvals
├── Academic catalogue
├── Groups
├── Reports
└── Platform settings
```

## 7. Navigation model

### Public navigation

- Dars / درس logo.
- Discover teachers.
- Discover groups.
- Language switcher.
- Sign in.
- Create account as the primary action.

### Authenticated desktop navigation

Use a persistent sidebar for role-specific navigation and a top bar for page context, language, notifications, and account menu. The sidebar may collapse to icons but should never hide the current section.

### Authenticated mobile navigation

Use a compact top bar plus a bottom navigation containing the four most-used destinations for the current role. Put less frequent destinations in a “More” sheet or drawer.

Suggested student bottom navigation:

- Home
- Discover
- Timetable
- My classes
- More

Suggested teacher bottom navigation:

- Home
- Groups
- Timetable
- Requests
- More

Admin can use a drawer-based mobile navigation because administration is expected to be desktop-heavy, but core approval and suspension actions must remain usable on a phone.

## 8. Complete page inventory and requirements

### 8.1 Public pages

#### P01 — Home / landing page

Goal: explain the value quickly and direct users to discovery or registration.

Sections:

- Hero with a direct headline, short explanation, “Find a class” primary CTA, and “I am a teacher” secondary CTA.
- Search/discovery entry using education system, level, and subject/course.
- How it works in three steps for students.
- Teacher value proposition.
- Supported learning paths: National, IG/British, University.
- Featured or recently published groups when real data exists.
- Trust and privacy message.
- Arabic/English footer with navigation and platform status/help links.

Avoid stock-photo-heavy education clichés. A distinctive schedule or class-card composition is more useful than a generic student-with-laptop hero.

#### P02 — Discover teachers

Goal: help a student compare approved active teachers.

Components:

- Search field.
- Filters for education system, level/year, subject/course, and university context when relevant.
- Active filter chips and clear-all action.
- Teacher cards with name, headline, specializations, education paths, number of published groups, and profile action.
- Sort by relevance or name; do not invent ratings because reviews are outside MVP.
- Loading skeleton, no-results state, error state, and pagination/load-more behavior.

#### P03 — Public teacher profile

Goal: establish trust and show what the teacher currently offers.

Sections:

- Avatar/initial, full name, headline, biography, and specialization chips.
- Education paths shown as readable grouped labels.
- Published groups with subject, academic context, schedule summary, location, capacity availability, and details CTA.
- Empty state when an approved teacher currently has no published groups.
- Share action may copy the current page link.

Do not show teacher email, private statistics, student names, or internal approval metadata.

#### P04 — Discover groups/classes

Goal: let students search the actual unit they can join.

Components:

- Search plus filters for education system, level/year, subject/course, teacher, day, and location.
- Mobile filter sheet and desktop filter sidebar/top row.
- Group cards showing name, teacher, academic breadcrumb, weekly schedule summary, location, capacity indicator, and status relevant to the viewer.
- Grid/list toggle is optional; prioritize one excellent card layout first.
- No-results suggestions that preserve or relax filters deliberately.

#### P05 — Public group details

Goal: give enough information for a student to make an enrollment decision.

Sections:

- Group name and academic breadcrumb.
- Teacher summary linking to the teacher profile.
- Description, location, capacity/availability, and published status.
- Weekly schedule in Cairo time.
- Enrollment CTA with state-specific behavior:
  - Guest: Sign in to request enrollment.
  - Student with no request: Request to join.
  - Pending: Request pending, with cancel action.
  - Accepted: Open my class.
  - Rejected: Explain status and allow a new request only if the product permits it.
  - Full: Show unavailable/full; future waitlist is not part of MVP.
- Clearly state that lesson details and materials are private to accepted students.

#### P06 — Sign in

- Email and password.
- Show/hide password.
- Validation, server error, loading, and disabled states.
- Link to registration.
- No “forgot password email” experience at this stage because email delivery is intentionally deferred.
- Explain operator-assisted recovery through a small help link if required.

#### P07 — Create account

- Full name.
- Email.
- Password and password guidance.
- Choose Student or Teacher using explanatory role cards rather than a plain technical dropdown.
- Language preference inferred from current locale and editable later.
- Teacher message: public publishing requires administrator approval.
- Successful registration routes to the relevant onboarding/dashboard because email confirmation is disabled for the pilot.

### 8.2 Shared authenticated pages

#### S01 — Role-aware dashboard shell

Every role receives a different dashboard, but the shell remains consistent:

- Greeting and current date.
- One primary recommended action.
- Alerts requiring attention.
- Upcoming lessons/timetable preview.
- Quick links.
- Role-appropriate counts.

#### S02 — My profile and account

Shared account section:

- Full name.
- Preferred language.
- Account role shown as read-only.
- Account status messaging if suspended.
- Change password using current password and new password.
- Sign out.

Role-specific profile fields appear in their own sections rather than mixing everything into one long form.

#### S03 — Notifications

- Tabs or filters for All and Unread.
- Notification row/card with icon, bilingual title, time, unread marker, and contextual link.
- Mark one as read and Mark all as read.
- Important notification types: enrollment requested, accepted, rejected, removed, lesson rescheduled, lesson cancelled, and teacher approval.
- Empty and error states.

#### S04 — Report a problem

- Subject.
- Description.
- Submission success state and previous reports with Open/Resolved status where appropriate.
- No chat-like support promise.

#### S05 — Access and system states

Design dedicated full-page or card states for:

- Missing application configuration.
- Not signed in.
- Wrong role / access denied.
- Suspended account.
- Teacher awaiting approval.
- Resource not found.
- General service error with retry.
- Offline/connection problem where practical.

### 8.3 Student pages

#### ST01 — Student dashboard

Priority order:

1. Today’s lessons with time, group, teacher, location, and open action.
2. Pending or recently decided enrollment requests.
3. Next upcoming lessons.
4. My classes summary.
5. Recent materials or notifications.

Use a friendly, focused layout rather than analytics-heavy charts.

#### ST02 — Student profile / learning context

- Current education path selection.
- National/IG flow: system → level → grade → subject interests.
- University flow: university → faculty → program → year, with support for general university courses.
- Explain that this context improves discovery filters; it should not prevent browsing other public groups.

#### ST03 — My classes

- Separate Accepted, Pending, and Previous/Closed states.
- Accepted class cards show next lesson and quick access to timetable/materials.
- Pending cards show request date and Cancel request.
- Rejected/cancelled/removed records explain their status without exposing internal notes.
- Search/filter when the list grows.

#### ST04 — Enrollment requests

A focused status timeline/list for all requests:

- Group and teacher.
- Submitted date.
- Pending/Accepted/Rejected/Cancelled/Removed badge.
- Available action based on state.
- Clear explanation of what each status means.

#### ST05 — Student timetable

Provide two views:

- Week view: compact schedule blocks, designed carefully for mobile horizontal navigation and desktop grid.
- Agenda view: chronological list, the default on small screens if it is clearer.

Requirements:

- Sunday-first Egyptian week convention.
- Cairo time displayed explicitly where helpful.
- Color categories based on subject or group, while retaining text labels for accessibility.
- Dated lesson status: scheduled, rescheduled, cancelled, completed.
- Conflict warning if two accepted groups overlap; the system warns rather than silently blocking enrollment.
- Selecting a lesson opens its lesson detail page.

#### ST06 — Student lesson details

- Lesson title, group, teacher, date/time, location, and status.
- Cancellation/reschedule treatment must be highly visible.
- Teacher notes.
- Materials grouped as Documents, Images, Links, and Notes.
- Download/open actions with file type and size.
- Empty materials state.
- Link back to group and adjacent lessons if useful.

The interface should not imply that a signed file link is permanent or publicly shareable.

#### ST07 — My materials

- Search all accessible resources.
- Filter by class, resource type, and lesson/date.
- Resource rows/cards show title, source lesson, class, type, file size when available, and open/download action.
- Removed students should no longer receive new access; design an honest unavailable state for stale links/bookmarks.

### 8.4 Teacher pages

#### T01 — Teacher dashboard

Priority order:

1. Today’s lessons.
2. Pending enrollment requests.
3. Schedule conflicts or unpublished/approval warnings.
4. Group capacity summary.
5. Upcoming lessons.
6. Useful counts: active groups, accepted students, pending requests, lessons this week.

Do not lead with decorative charts. Operational cards and actions are more valuable.

#### T02 — Teacher public profile editor

- Public preview mode alongside or after editing.
- Avatar/initial treatment.
- Headline.
- Biography.
- Preferred language/account fields where appropriate.
- Approval status banner.
- Save feedback.

#### T03 — Teacher specializations

- Add more than one specialization.
- Guided academic-path selector.
- Group selected specializations by National, IG/British, and University.
- Remove with confirmation only when it does not destroy group data; otherwise explain why it cannot be removed.
- Avoid enormous unstructured multi-select menus.

#### T04 — My groups

- Search and filters for Draft, Published, and Archived.
- Summary cards/table with academic context, schedule, accepted/capacity, next lesson, status, and quick actions.
- Create group CTA.
- Helpful empty state for a new teacher.

#### T05 — Create/edit group

Use a clear form or short stepper:

1. Academic offering: education path and subject/course.
2. Group basics: name, description, location, capacity.
3. Weekly schedule: one or more recurring slots.
4. Review and save as Draft or Publish.

Rules to express in the UI:

- Capacity is 1–500.
- Schedule slots cannot cross midnight.
- Conflicts with any of the teacher’s other groups must be shown near the conflicting time.
- An unapproved teacher can save drafts but cannot publish.
- Editing future schedules must explain how dated lessons are affected; past lessons remain historical.

#### T06 — Group workspace / overview

Header:

- Group name, academic breadcrumb, status, capacity, and actions.

Tabs/sections:

- Overview.
- Schedule.
- Requests.
- Students.
- Lessons.

Overview content:

- Next lesson.
- Weekly schedule.
- Enrollment counts.
- Capacity progress.
- Recent activity.
- Public page preview/link.

#### T07 — Group schedule manager

- Weekly schedule visualization plus editable slot list.
- Add/edit/remove recurring slot.
- Day, start, end, and Cairo timezone.
- Conflict display with the other group and conflicting interval.
- Confirmation/explanation for changes that affect future generated lessons.

#### T08 — Enrollment requests

- Teacher-wide page with group filter and group-specific tab.
- Request card/table: student name, group, requested date, current capacity, and status.
- Accept and Reject actions.
- Capacity warning before accepting the final seat.
- Optimistic-feeling feedback while still reflecting server confirmation.
- Bulk acceptance is not required for MVP because capacity and deliberate review matter.

#### T09 — Students

- Teacher-wide list with group filters and group-specific roster.
- Student name, group, enrollment date/status, and next lesson context.
- Remove from group action with a clear consequence: the student loses future access to private lesson resources.
- Do not expose unnecessary student account data.

#### T10 — Teacher timetable

- Combined schedule for all owned groups.
- Week and agenda views.
- Color key by group.
- Recurring slots visually distinguished from actual dated lessons where both are shown.
- Selecting an occurrence opens the lesson workspace.
- Create lesson action from a time slot/date.

#### T11 — All lessons

- Filters for date range, group, and Scheduled/Cancelled/Completed.
- Upcoming and Previous sections.
- Generate lesson occurrences for a selected group and limited date range.
- Create one individual lesson.
- Row/card shows status, resource count, and edit action.

#### T12 — Create/edit lesson

- Group.
- Lesson title/topic.
- Date.
- Start and end time in Cairo.
- Notes.
- Status.
- Conflict feedback.
- Save, cancel lesson, mark completed, and reschedule actions with appropriate confirmation.

#### T13 — Lesson workspace and materials

Top section:

- Lesson identity, group, date/time, status, and edit actions.

Materials:

- Upload PDF or image, maximum 10 MB.
- Add safe website link.
- Add plain-text note.
- Show upload progress, validation errors, success, and retry.
- Material card/row: icon/thumbnail, title, type, size, upload date, preview/download, rename if supported, delete.
- Explain allowed formats before selection.
- Design a recovery state when file upload succeeds but saving metadata fails.

### 8.5 Administrator pages

#### A01 — Admin overview

Operational summary:

- Total active students.
- Total active/awaiting-approval teachers.
- Published/draft/archived groups.
- Lessons this week.
- Pending enrollment requests.
- Open reports.
- New users over time.
- Most active subjects and education systems.

Include shortcuts to items requiring action. Charts should be readable and modest; counts and queues matter more than visual spectacle.

#### A02 — User management

- Tabs/filters for Students, Teachers, Active, Suspended, Awaiting approval.
- Search by name; email visibility depends on administrative access and need.
- User detail drawer/page with role, status, joined date, teacher approval, and related group counts.
- Activate/Suspend action with confirmation and consequence messaging.
- Do not allow casual role changes through this screen.

#### A03 — Teacher approvals

- Dedicated queue for fast review.
- Teacher profile preview, headline, biography, specializations, registration date, and approval status.
- Approve action and ability to suspend when appropriate.
- Empty queue state.

#### A04 — Academic catalogue

This is the most complex admin design. Provide a hierarchy browser rather than one giant table.

Suggested desktop structure:

- Left: hierarchy tree/navigation.
- Center: children/items at selected level.
- Right: details/edit panel.

Mobile can use drill-down screens with breadcrumbs.

Functions:

- Create/edit/delete education systems, levels, grades, universities, faculties, departments/programs, and years.
- Create/edit/delete subjects/courses.
- Connect a subject/course to an academic context as an offering.
- Show where an item is used before deletion and prevent destructive actions when dependent groups exist.
- Arabic and English name fields side by side on desktop, stacked on mobile.
- Slug may be auto-generated and placed under advanced details rather than presented as the main field.

#### A05 — Group oversight

- Search/filter every group by teacher, academic context, status, and date.
- Read-only group detail with teacher, capacity, schedule, enrollment counts, and lesson counts.
- Admin intervention should be deliberate; routine group editing remains the teacher’s responsibility.

#### A06 — Reports and issues

- Open and Resolved tabs.
- Reporter, subject, description, submitted date, and contextual account/group links when available.
- Admin note.
- Resolve/reopen action.
- Empty, loading, error, and long-description states.

#### A07 — Platform settings

- Small key/value-driven settings surface presented as understandable product controls.
- Save feedback and audit-minded confirmation for consequential changes.
- Do not expose raw JSON to ordinary administrators unless it is under an advanced developer section.

## 9. Critical end-to-end flows to prototype

The designer should produce connected prototypes for these flows, not only isolated screens.

### Flow 1 — Student enrollment

Home → Discover groups → Apply filters → Group details → Sign in/register if needed → Request to join → Pending state → Accepted notification → My classes → Timetable.

### Flow 2 — Teacher creates and publishes a group

Teacher dashboard → Approval state check → My groups → Create group → Choose academic path → Add details/capacity → Add weekly slots → Resolve conflict if shown → Review → Save draft/publish → Public group page.

### Flow 3 — Teacher handles enrollment

Notification/dashboard queue → Enrollment requests → Inspect group capacity → Accept/reject → Success state → Group roster → Student receives notification and timetable update.

### Flow 4 — Lesson and resources

Teacher timetable/group → Create or open lesson → Add topic and time → Upload PDF/image → Add link/note → Student timetable → Lesson details → Authorized download/open.

### Flow 5 — Administrator approves a teacher

Admin dashboard → Teacher approval queue → Inspect profile and specializations → Approve → Teacher sees approved state → Teacher can publish group.

### Flow 6 — Account suspension

Admin user management → Suspend user with confirmation → Suspended user’s existing session reaches a clear access-blocked state → Reactivation restores access appropriately.

## 10. Visual direction

Working brand: **Dars / درس**.

The visual identity should feel modern, warm, capable, and locally relevant. It should avoid both childish primary-school styling and cold enterprise software.

### Proposed palette

- Deep teal: primary navigation, important headings, trust, selected states.
- Warm orange: primary actions, attention, highlights.
- Warm cream: page background and large surfaces.
- White: content cards and form surfaces.
- Charcoal: body text.
- Muted sand/gray: borders and secondary text.
- Semantic green, amber, red, and blue: success, warning, destructive/error, and informational states.

The designer may refine exact accessible color values while preserving this character. All text and controls must meet WCAG AA contrast.

### Typography

- Choose Arabic and Latin fonts designed to coexist in weight, x-height, and tone.
- Arabic should remain highly readable at small mobile sizes.
- Prefer clear educational/product typography over decorative calligraphy for functional UI.
- Use a strong but friendly display treatment only for marketing headlines.

### Shape and spacing

- Medium rounded corners, approximately 12–18 px depending on component size.
- Soft borders and restrained shadows.
- Generous touch targets and breathing room.
- Denser tables are acceptable for admin desktop screens, with cards or stacked rows on mobile.

### Iconography and imagery

- Use a consistent outline icon system.
- Icons must reinforce labels, never replace critical labels.
- Prefer abstract academic patterns, timetables, notebooks, and subject cues over generic graduation-cap repetition.
- Real teacher avatars can be supported; provide a polished initials fallback.

## 11. Core reusable components

The design system should include:

- Buttons: primary, secondary, outline, text, destructive, icon, loading, disabled.
- Text fields, password fields, search, textarea, selects, comboboxes, time/date inputs, checkboxes, radios, and role cards.
- Guided academic-path selector and breadcrumb.
- Filter bar, chips, mobile filter sheet, pagination/load more.
- Public teacher card and profile header.
- Group card, capacity indicator, schedule summary, and status badge.
- Enrollment status badge and request card.
- Lesson card/agenda row and timetable block.
- Material/file row with file type and size.
- Notification row and unread marker.
- Statistics card and compact chart pattern.
- Table, responsive stacked row, bulk-selection pattern where actually used.
- Tabs, sidebar, top bar, bottom navigation, drawer, dropdown, and breadcrumbs.
- Modal/confirmation dialog and non-blocking toast.
- Empty state, loading skeleton, inline error, page error, success state, and setup-required state.
- Avatar/initials, tooltip, progress bar, and stepper.

For each component, design hover, focus, pressed, selected, disabled, loading, error, and RTL behavior where relevant.

## 12. Status vocabulary

Use consistent visual semantics across the product.

### Enrollment

- Pending
- Accepted
- Rejected
- Cancelled by student
- Removed by teacher/admin

### Group

- Draft
- Published
- Archived

### Lesson

- Scheduled
- Cancelled
- Completed
- Rescheduled should be communicated as a visible change even if it remains technically scheduled.

### Account/teacher

- Active
- Suspended
- Teacher approval pending
- Teacher approved

### Report

- Open
- Resolved

Never rely on color alone. Pair color with a label and, when useful, an icon.

## 13. Bilingual and RTL requirements

- Design every key screen in Arabic RTL and at least representative screens in English LTR.
- Navigation order, alignment, breadcrumbs, arrows, drawers, table flow, and directional icons must adapt correctly.
- Dates, times, numbers, and email addresses need intentional mixed-direction handling.
- Arabic copy should be natural Egyptian-friendly Modern Standard Arabic, not literal word-for-word translation.
- Avoid embedding text inside images.
- Ensure layouts survive labels that are 30–50% longer in the other language.
- Let users switch language without losing the page or task they are performing.
- Week layout begins Sunday. Times are displayed in the Africa/Cairo timezone.

Suggested product labels:

| English | Arabic |
| --- | --- |
| Dashboard | لوحة التحكم |
| Discover teachers | اكتشف المدرسين |
| Discover groups | اكتشف المجموعات |
| My classes | مجموعاتي |
| My timetable | جدولي |
| Enrollment requests | طلبات الانضمام |
| Lessons | الحصص |
| Materials | المواد التعليمية |
| Pending | قيد المراجعة |
| Accepted | مقبول |
| Rejected | مرفوض |

The final Arabic copy should be reviewed by a native speaker in the intended Egyptian context.

## 14. Responsive requirements

Design at minimum for:

- Mobile: 360–390 px width.
- Tablet: approximately 768 px.
- Desktop: 1280–1440 px.

Important adaptations:

- Sidebar becomes bottom navigation/drawer.
- Tables become stacked rows or focused detail flows.
- Filter bars become sheets.
- Timetable defaults to agenda or scrollable week view.
- Multi-column forms become one column.
- Sticky primary actions may be used on mobile creation/edit screens.
- Dialogs with substantial content become full-screen sheets on mobile.

## 15. Accessibility requirements

- WCAG AA color contrast.
- Visible keyboard focus states.
- Complete keyboard operation on desktop.
- Minimum comfortable touch target around 44×44 px.
- Real field labels and useful error association.
- Status and timetable meaning cannot depend only on color.
- Logical heading order.
- Clear destructive-action wording.
- Reduced-motion-friendly transitions.
- Screen-reader names for icon buttons.
- Empty, loading, and error states announced appropriately in implementation.

## 16. Important edge cases to design

- A new account with no profile context selected yet.
- Teacher awaiting approval.
- Teacher with no groups.
- Published group at full capacity.
- Student already pending or accepted.
- Teacher attempts to accept a student after the final seat was filled elsewhere.
- Two schedule slots conflict.
- A student has overlapping accepted classes.
- Lesson is cancelled or rescheduled.
- Lesson has no materials.
- Upload is too large or the wrong file type.
- Upload completed but saving its record failed.
- Removed student opens an old material link.
- User is suspended during an existing session.
- Catalogue item cannot be deleted because it is in use.
- Long Arabic teacher/group names.
- Empty search results after several filters.
- Service/configuration failure.

## 17. Content and tone

Tone should be clear, respectful, reassuring, and concise. Avoid playful slang in operational or error messages. Use direct actions.

Examples:

- Good: “Your request was sent to the teacher.”
- Good: “This group is full. You cannot request enrollment right now.”
- Good: “This time overlaps with Secondary 3 Mathematics, Sunday 6:00–8:00 PM.”
- Good: “Removing Ahmed will stop his access to future class materials.”
- Avoid: “Oops! Something went super wrong.”

## 18. MVP boundary

Design now:

- Authentication and role onboarding.
- Arabic/English system.
- Public teacher/group discovery.
- Profiles and teacher approval.
- Academic catalogue.
- Groups and recurring schedules.
- Enrollment requests and decisions.
- Student/teacher timetables.
- Dated lessons.
- PDFs, images, links, and notes.
- In-app notifications.
- Reports/issues.
- Admin management and basic analytics.

Leave for later, but make the design system extensible:

- Payments and subscriptions.
- Attendance.
- Homework submission.
- Quizzes and exams.
- Teacher reviews and ratings.
- Parent accounts.
- Chat.
- Live classes.
- Email, WhatsApp, and SMS notifications.
- AI and recommendation features.

Do not place disabled “coming soon” entries for all future features in the MVP navigation. Future concepts may be explored separately without cluttering the current product.

## 19. Requested design deliverables

The UI/UX designer should provide:

1. Sitemap and refined role-based navigation.
2. User-flow diagrams for the six critical flows in this brief.
3. Low-fidelity wireframes for the full page inventory.
4. A responsive design system with color, typography, spacing, grid, icons, and reusable components.
5. High-fidelity designs for all MVP pages and meaningful states.
6. Arabic RTL and English LTR variants for key screens.
7. Desktop, tablet, and mobile behavior for dashboards, forms, management lists, and timetables.
8. Clickable prototypes for enrollment, group creation, enrollment review, lesson materials, and teacher approval.
9. Empty, loading, validation, error, success, access-denied, suspended, and approval-pending states.
10. Component documentation including interaction and responsive behavior.
11. Developer handoff with inspectable tokens, component variants, icons/assets, and export rules.

## 20. Priority high-fidelity screens

If the designer needs to work in phases, start with these because they establish most of the design language:

1. Home page.
2. Discover groups and group details.
3. Sign up with role choice.
4. Student dashboard and timetable.
5. Teacher dashboard.
6. My groups and group workspace.
7. Create/edit group with schedule conflict.
8. Enrollment request queue.
9. Lesson workspace with materials.
10. Admin dashboard.
11. User/teacher approval management.
12. Academic catalogue hierarchy.

Then extend the established patterns across the remaining screens.

## 21. Acceptance criteria for the design

The design is ready for implementation when:

- Every MVP page in this brief has a defined layout or explicitly reuses a documented pattern.
- The six critical flows can be completed in the prototype without unexplained jumps.
- Arabic RTL is deliberately designed, not merely mirrored.
- Mobile teacher and student workflows remain practical.
- Every important status and permission state is visible.
- Empty, loading, validation, error, and success behavior is specified.
- The timetable works for both a few and many lessons.
- The academic selector supports National, IG/British, university-specific, and general university offerings.
- Components and tokens are reusable rather than one-off screen styling.
- Developer handoff includes exact responsive behavior and component states.

## 22. Short copy-ready prompt for the designer

> Design a complete responsive web product called Dars / درس for private tutoring and academic class management in Egypt. It serves students, teachers, and administrators across National, IG/British, and university education. Teachers create groups, define recurring schedules, approve enrollment, manage students, create dated lessons, and attach private PDFs, images, links, and notes. Students discover teachers and groups, request enrollment, see accepted classes automatically in their timetable, and access resources for their lessons. Administrators approve teachers, manage accounts and the academic catalogue, inspect groups, resolve reports, and view basic analytics. The product is Arabic-first with full RTL and also supports English LTR. Use a warm, modern visual system built around deep teal, warm orange, cream backgrounds, white cards, clear typography, accessible statuses, mobile-first workflows, and calm information hierarchy. Avoid generic LMS clichés, excessive dashboards, ratings, payments, chat, and other features outside the MVP. Produce the sitemap, user flows, wireframes, design system, responsive high-fidelity screens, complete states, and clickable prototypes described in this brief.

## 23. Source of truth

This brief translates the approved product proposal and implementation contract into a design handoff. Where a visual decision is not specified, preserve the product principles: clear next action, visible status, privacy by default, mobile usability, and equal-quality Arabic and English experiences.
