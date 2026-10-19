# Review queue (observations during implementation, re-check after worker completion)

- Next 16 has no `next lint`; configure ESLint directly and pin installed versions.
- SSR auth middleware must refresh cookies and verify identity; locale middleware alone is insufficient.
- Slot regex currently appears double escaped: test valid `18:00` explicitly.
- Teacher queries must filter to current teacher; RLS also exposes published groups from other teachers.
- Public groups must not rely on a profiles join to access teacher name; use safe RPC projection.
- All server mutations need explicit verified actor, validation and error feedback in addition to RLS.
- Require actual complete lesson/material/profile/admin forms, not placeholder tables or feature-name pages.
- Test student cancellation and teacher removal, recurring/date schedules, authenticated password changes, file upload compensation, avatar handling, and every education CRUD entity.
- Ensure current local proof covers concurrency and role spoofing; test scripts existing alone do not establish success.
