# Dars feature recommendations

Date: 2026-10-09

## Goal

Help a teacher go from **“I signed up” to “my group is ready for students”** with fewer steps. Dars currently separates creating a group, adding its schedule, and creating lessons.

The requested improvements are teacher phone numbers and email addresses, easier group and lesson creation, and a smoother website experience.

## Recommended priorities

| Priority | Improvement | What it would do |
|---|---|---|
| **1** | **Teacher profile and contact details** | Add photo, bio, subjects, phone number, WhatsApp, and a separate contact email. Let teachers choose whether contact details are public or visible only to enrolled students. |
| **2** | **Guided group creation** | One flow: **Group details → Weekly schedule → Review and publish**. Use readable subject/grade selectors, sensible defaults, and saved drafts. |
| **3** | **Automatic lesson creation** | Generate lessons from the weekly schedule for a selected date range. Preview dates, flag conflicts, and allow holidays to be excluded. First fix the recurring-lesson bug found during setup. |
| **4** | **Easier everyday teaching** | Add “Duplicate group,” “Copy lesson,” and quick actions for rescheduling, cancelling, and uploading materials. |
| **5** | **A useful teacher dashboard** | Put today’s lessons, pending enrollment requests, and unfinished setup tasks first, with clear “Create group” and “Add lesson” buttons. |
| **6** | **Better student discovery** | Filter groups by subject, grade, teacher, day, and available seats. Show the next lesson and a clear enrollment button on each group page. |
| **7** | **Consistent website UX** | Improve mobile navigation, Arabic layouts, loading states, inline validation, success messages, and empty screens that explain the next action. |

## Later additions

- Attendance tracking.
- In-app schedule-change notifications.
- Calendar export.
- Email or WhatsApp reminders once delivery services are configured.

## Recommended first release

**Teacher profiles + guided group creation + reliable lesson generation + dashboard improvements.** These directly address the requested changes and make the existing platform easier to use.

## Open decision: contact visibility

Should teacher phone numbers and contact emails be public, or visible only to enrolled students?

**Recommendation:** enrolled students by default, with a teacher-controlled option to make them public. This remains a proposal awaiting a decision.

## Known prerequisite

During environment setup, the API integration suite passed 31 assertions before recurring lesson generation failed with PostgreSQL error `42P10`. The `generate_lessons` function’s `ON CONFLICT(group_id,slot_id,local_date)` clause does not match the predicate of the `lessons_generated_once` partial unique index. Fix this before building the automatic lesson-generation experience.

These are feature recommendations, not implemented changes or an approved implementation specification.
