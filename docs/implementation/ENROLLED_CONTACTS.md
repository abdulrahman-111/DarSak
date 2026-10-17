# Teacher contact access

Phone, WhatsApp and the separate contact email are visible to active students with an accepted enrollment in any group owned by an active approved teacher. Pending, rejected, cancelled and removed requests do not grant access. Active owners and administrators retain management access. Public professional profile content stays discoverable.

The migration converts historical public choices to enrolled-only. A trigger normalizes legacy clients that still submit public; the read policy independently enforces accepted enrollment. The profile editor and public FAQs explain the rule, previews exclude contact values, and accepted students have a contact-details link on the group page.

Validation: 25 focused profile/domain/rendering tests; TypeScript; targeted ESLint; rollback database contact tests including access revocation; existing API suite and production build (results recorded in the PR). Sol independent source review found no blocking issue.
