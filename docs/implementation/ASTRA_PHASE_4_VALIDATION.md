# Resource management — 2026-10-14

Teacher requests and accepted-student lists support literal name search, owned-group filters, matching counts and bounded pages. The group selector supports searching older groups and retaining the selected group. Read authorization preserves active teachers' existing historical access without adding an approval restriction.

Student materials opens a resource finder with title/group search, accepted-group and type filters, counts, and 20-row pages. The Lessons tab retains the previous paginated lesson list. Accepted members retain historical archived-group resources. Resource metadata excludes private storage paths; file buttons reuse the existing authenticated signed-download action.

Validation: 294 unit assertions across 43 files, 26 database regression files, 173 existing real local API assertions, typecheck, lint (zero errors/warnings), and local webpack production build pass. New SQL assertions cover selected groups outside the first 50, accepted versus pending memberships, private metadata projection, owner scoping and existing unapproved-teacher historical access.

Review corrected a missing Lessons pagination control, default service-role RPC grants and invalid SQL fixtures. The local default Turbopack environment limitation remains; webpack provides the local production build and Vercel's default build is checked at release.
