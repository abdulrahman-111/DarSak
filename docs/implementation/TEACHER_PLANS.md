# Upcoming teacher plans and manual subscription operations

## Release behavior

Standard: 100 EGP/month, 5 active groups, 100 retained lesson files, 250 MiB retained lesson-file storage. Pro: 200 EGP/month, 20 groups, 500 files, 1 GiB storage. Both retain the 10 MiB single-file safety cap and the same teaching tools. Students pay no platform subscription; teachers set their own lesson fees, paid directly to them.

Draft and published groups count; archived/cancelled groups do not. Files in archived groups still count until deleted. External links and text notes do not consume file quotas. Limits count retained objects, not a monthly upload allowance. Existing over-limit content is retained; quota guards target increases rather than deleting content. Active subscribed teachers can reduce usage even when over their plan limits. Expired teaching access retains the existing authorization restrictions; the account and admin-confirmed renewal route remain available, and expiry does not delete content.

The free launch includes 14 November 2026 in Africa/Cairo. Earliest activation is 15 November 2026 00:00 Cairo (`2026-11-14T22:00:00Z`). Quota policy ships **disabled**; the date alone does not activate payments or limits. No automated charge, checkout, subscription renewal request, or payment-recipient account is introduced by this release.

Public pricing compares plans without describing payment methods, fee collection or support coordination. Only authenticated teachers see the after-signup notice that support will contact them to complete registration and arrange fees when paid plans begin. This is a manual support process; the release does not automatically contact teachers or process website payments.

Teacher WhatsApp remains enrolled-student-only by default. Publishing contact details requires an explicit teacher selection. Platform billing does not reuse private teacher contact information.

## Manual collection design for a later activation

1. Confirm the operator's applicable registration/tax obligations, bank-approved receiving account, recipient identity, subscription terms, receipt process, and refund terms before collecting funds.
2. After signup, support contacts the teacher privately to complete registration. When paid plans begin, support shares the actual approved recipient/IPA, amount, subscription period, reference instructions and refund/support terms directly with that teacher. Do not publish WhatsApp collection instructions or recipient details on public site pages. These values are deliberately not invented or populated now.
3. Use WhatsApp only to coordinate. Teachers transfer their platform subscription fee directly to the operator through InstaPay or an ordinary bank transfer. DarSak does not receive student tuition for onward settlement to teachers.
4. An active admin independently verifies the transaction in the bank ledger: recipient, amount, timestamp, and unique transaction reference. A screenshot or WhatsApp message alone is insufficient.
5. Record the verified reference and plan through the guarded admin control. A reference cannot activate another teacher or be counted twice. Only the admin can record a plan; this does not approve an unreviewed teacher account.
6. Show the confirmed plan, period and usage to its owner. Any refund is handled manually to the verified original sender; the application performs no automatic refund or recurring charge.

## Egyptian compliance assessment (17 October 2026)

An incorporated company is not necessarily the only route: the Egyptian Tax Authority explicitly discusses online service activity by natural persons and sole proprietors. That does **not** mean recurring business receipts into an arbitrary personal account are automatically permitted or tax-free. The appropriate individual/sole-proprietor registration, commercial registration where applicable, permitted account use, VAT treatment, invoicing/e-receipt obligations and any activity-specific licensing depend on the actual business. A bank and qualified Egyptian accountant/legal adviser must confirm these before paid activation. No blanket legal-compliance guarantee is made.

Primary references consulted:

- [Egyptian Tax Authority: e-commerce, natural persons and sole proprietorships](https://portal.eta.gov.eg/en/node/313). Online activity remains subject to applicable tax obligations; an educational marketplace subscription must not be assumed to share an exemption for tuition. ETA e-commerce unit: 16395; e.commerce@eta.gov.eg.
- [Internal Trade Development Authority: registration work guide](https://www.itda.gov.eg/Workguide.aspx). Lists the sole-trader registration route and supporting documents.
- [Egyptian Tax Authority: Law 6/2025 simplified small-business regime](https://www.eta.gov.eg/en/node/1271). Eligibility and obligations must be assessed; this release does not automatically claim the regime or a VAT exemption.
- [Official InstaPay](https://www.instapay.eg/?lang=en). Bank-to-bank transfer functionality does not itself establish permission to use a particular personal account for commercial collections. Confirm with the receiving bank.

If a bank does not permit business collections into the existing personal account, use the bank-approved individual/sole-proprietor business account route. A licensed payment provider may be considered later under its actual onboarding requirements; changing providers does not remove tax or registration duties.

## Validation

Independent GPT-6.1 Sol source review resolved the identified authorization, legacy-renewal, storage-move, and accounting issues. Full unit suite: 500 tests in 82 files passed; lint, typecheck and webpack production build passed. The existing local API suite passed 173 real assertions. The new database enforcement suite passed 30 assertions, and the default-policy contract suite passed 6 assertions. A real Storage REST upload returned 200, its raw object was counted, and deletion returned 200. Two simultaneous inserts at Standard’s final group slot produced one success and one quota rejection, leaving exactly five active groups; the harness initially expected a different psql failure exit code and was corrected before the passing rerun. All temporary policy/fixtures were restored/cleaned and the existing guardian admin remained active. Browser checks passed for public pricing in English/Arabic at 390px and 1440px, and authenticated teacher/admin plan pages in both languages at 390px, with no horizontal overflow and admin assignment disabled. Local fixtures were cleaned.

Runtime verification caught and fixed SUM(bigint) returning numeric in the usage RPCs. A separate browser fixture promotion attempt was correctly blocked by existing role authorization; the harness switched to the service API and passed. The private post-signup notice changed the setup page child structure: two recovery tests initially failed on their old single-child assumption, then were updated to locate the wizard and assert teacher-only notice visibility; the focused rerun passed.

The old admin monthly-renewal screen now redirects to the guarded teacher list; plan administration is on each teacher detail page. Same-plan manual renewal extends the existing period by one Cairo calendar month. Changing plans waits until the current period expires, avoiding implicit proration or double charging.

Production must retain disabled quota policy and no configured collection recipient in this release.
