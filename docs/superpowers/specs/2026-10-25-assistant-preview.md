# DarSak assistant staging contract

Review baseline: remote staging 4ba22ff. Staging work only; no production writes, paid services, new database tables, or external inference calls.

## Product recommendation

Deliver two honest capabilities: (1) interactive English/Arabic platform guidance based on reviewed local help topics and the signed-in viewer's role, and (2) an optional teacher group-writing panel with an explicitly labeled local template preview. State that live AI drafting is unavailable. Do not call the local template AI-generated or pretend a language model answered. A real provider can be integrated later after the deployment/provider eligibility issue is resolved.

Gemini API terms currently prohibit API Clients directed toward, or likely accessed by, people under 18. DarSak includes minors. A teacher-only panel does not establish that the website/API Client is eligible. A supplied API key must not activate Gemini. Eligibility needs an independent permitted deployment or suitable provider path; do not infer clearance from teacher role or a configuration flag.

## Module ownership and exact interfaces

### Task A: domain and guidance contracts (small isolated implementation)

Own `src/features/assistant/domain.ts`, `guidance.ts`, and unit tests for these modules. No TSX/form edits. No server action is required while no external inference exists.

```ts
export type AssistantLocale = 'en' | 'ar';
export type AssistantRole = 'student' | 'teacher' | 'admin';
export type AssistantAccess = { role: AssistantRole; canTeach: boolean };
export type GroupDraftInput = {
  locale: AssistantLocale;
  topic: string; // trim, 2..120 characters
  level: 'beginner' | 'intermediate' | 'advanced';
  format: 'online' | 'in_person' | 'hybrid';
  guidance: string; // trim, <=500 characters, optional via empty string
};
export type GroupDraft = {
  name: string; // 2..120 (existing form calls its title "name")
  description: string; // <=2000
  outcomes: string; // <=2000
  prerequisites: string; // <=1500
};
export type GroupDraftResult =
  | { ok: true; source: 'provider'; draft: GroupDraft }
  | { ok: false; code: 'invalid_input' | 'unauthorized' | 'unavailable' };
export function buildPreviewDraft(input: GroupDraftInput): GroupDraft;
export const LIVE_ASSISTANT_AVAILABLE = false as const;

export type GuidanceLink = { label: string; href: string };
export type GuidanceTopic = {
  id: string;
  title: string;
  answer: string;
  links: GuidanceLink[];
};
export function getGuidanceTopics(
  locale: AssistantLocale,
  access: AssistantAccess,
): GuidanceTopic[];
export function findGuidanceTopics(
  query: string,
  locale: AssistantLocale,
  access: AssistantAccess,
): GuidanceTopic[];
```

Export Zod schemas named `groupDraftInputSchema` and `groupDraftSchema` for input/output, strict objects, trim/length validation. Local preview accepts schema-validated input; deterministic templates vary by topic, level, format, locale, and guidance. They cannot invent prices, schedules, qualifications, or promises. Use plain text only. Input strings remain content, never instructions for tools. No storage/logging. The preview remains in browser memory, including user guidance.

`GroupDraftResult` documents a future server/provider contract only. Do not create an unused server action. The live-provider status is a source-level constant; environment keys do not override it. No provider network call, API key handling, fetch endpoint, quota consumption, or SDK is needed in this stage. Do not add dormant Gemini calls accessible by env switch. A future implementation must validate input, authenticate using cookie-scoped Supabase client and `auth.getUser()`, read only own `profiles` `role,status`, require active teacher and `checkTeachingAccess(db)`, and apply persisted budgets before a provider call. Successful provider result shape is reserved for that later integration.

Guidance supports real conversational interaction through a short question input, ranked local topic matches, suggested follow-ups/topic buttons, and a no-match answer that offers the available topics. Normalize English/Arabic letter forms and strip Arabic diacritics for search; maintain explicit bilingual synonyms for intents. Label this feature "Guided platform help", not live AI. Never echo raw query into URLs. Locale must be `en`/`ar`; every link is constructed from an allowlisted static route.

Reviewed topic/link scope:

- Every active role: account `/account`; password/security `/account/security`; reports `/reports`; notifications `/notifications`; existing help `/help`. Explain never to share passwords/codes.
- Student: discover `/teachers`; profile `/account/learning-profile`; requests/classes `/student/classes`; timetable `/timetable`; materials `/student/materials`; saved `/student/saved`. Explain pending request != accepted enrollment and that teacher contact is unlocked only after acceptance.
- Teacher with teaching access: create `/teacher/groups/new`; manage groups `/teacher/groups`; requests `/teacher/requests`; lessons `/teacher/lessons`; students `/teacher/students`. Explain details -> schedule -> review -> publish. Preview does not create a group.
- Teacher without teaching access: `/account/application`, `/account/teaching-access`, `/account/profile`; do not suggest group-management routes as currently available actions.
- Admin: `/admin/teachers`, `/admin/users`, `/admin/groups`, `/admin/reports`; explain actual review workflows only, no inferred authority or AI automation.

Guidance must not accept role/canTeach from browser as authorization. The page derives these server-side. A filtered static topic list is presentation; existing route guards remain the security boundary. No database records, user identity, contact data, student details, internal reports, private material contents, or auth metadata enter prompts. No remote help inference is implemented.

### Task B: interactive help drawer

Own `src/features/assistant/guided-help.tsx`, `help-drawer.tsx`, and workspace-shell drawer placement only. Import Task A contracts; avoid editing its files or teacher forms. No new sidebar item or assistant page is needed. Put a compact "Help" / "المساعدة" trigger in each workspace shell, opening an accessible drawer/dialog with role-aware interactive guidance. Reuse existing shell role; do not pass identity, full name, email, database records, or auth objects to the help component.

```ts
export function GuidedHelp(props: {
  locale: AssistantLocale;
  access: AssistantAccess;
}): React.JSX.Element;

export function HelpDrawer(props: {
  locale: AssistantLocale;
  access: AssistantAccess;
}): React.JSX.Element;
```

The existing workspace layout already requires the active viewer. Derive `canTeach` server-side from the existing teaching-access result where available; fail false on status read failure. If shell doesn't currently have that information, add optional `canTeach?: boolean` default false and resolve it in the teacher layout, without duplicating a database query already performed there. Student/admin pass false. Drawer has focus management, Escape close, explicit close button, restored trigger focus, appropriate dialog labeling, body-scroll handling, and usable mobile/RTL layout. Prefer an existing dialog primitive if available. Show clear status: guided platform help is local and live AI is unavailable. No user question is stored, logged, or sent over network. Avoid sidebar clutter or a persistent floating overlay.

### Task C: contextual teacher preview and existing form integration

Own `src/features/assistant/group-draft-panel.tsx`, teacher `setup-forms.tsx`, and `group-learning-fields.tsx` changes plus focused UI tests. Import Task A contracts; avoid its files and the shell/drawer files.

```ts
export function GroupDraftPanel(props: {
  locale: AssistantLocale;
  disabled?: boolean;
  onApply: (draft: GroupDraft) => void;
}): React.JSX.Element;
```

Place `GroupDraftPanel` within `GroupDetailsForm`, shown on new/draft group mode only (`!editPublished`) and disabled during save or `learningError`. Use native labels, keyboard access, EN/AR labels, `dir=auto` text areas, and status live region. Controls are `type=button` inside the existing form; do not nest another form.

Panel order: concise explanation; nonpersonal topic/level/format/guidance inputs; "Create template preview" button; editable structured preview; "Apply these four fields" action. Say prominently "Local template preview — not generated by AI. Nothing is saved until you save the group form." Mention existing values are replaced when applying. No automatic application when a preview arrives. Show preview errors and disable apply if edited output fails validation. Avoid loading spinners implying live model work.

GroupDetailsForm currently controls `name` and `description` but GroupLearningFields uses uncontrolled defaults. Add local controlled states for outcomes/prerequisites, initialized once from `learningDetails`. Add optional `values?: Pick<GroupLearningDetails, 'outcomes'|'prerequisites'>` and `onValueChange?: (field: 'outcomes'|'prerequisites', value: string) => void` props to GroupLearningFields. Supply controlled `value/onChange` only when these props exist; preserve its original defaultValue behavior for other callers. Preserve all fee/delivery fields and the original learning `updated_at` optimistic concurrency token. Do not remount the full learning form to apply text.

`onApply` sets all four text states and `dirty=true`; never submits the form or changes IDs/catalogue/capacity/location/fees/delivery mode/schedule. The existing atomic save and review/publish path remains the only persistence path. Warn that suggestions need review. React escaped text nodes only; no Markdown/HTML renderer or `dangerouslySetInnerHTML`.

## Acceptance / review evidence

1. Unit tests: invalid locale/extra fields/overlong text rejected; bilingual preview schema-valid; guidance filters roles/teaching access and returns only static local paths; Arabic intent matching; no-match fallback; presence of arbitrary Gemini/env key never enables network. Existing route guards continue to protect teacher form access. No new server entry point is introduced.
2. UI test: preview and edits alone do not call save; explicit apply changes exactly four fields, marks unsaved state, retains fee/delivery values and concurrency tokens; no automatic submission. Existing save/publish tests remain relevant.
3. Browser: English/Arabic on mobile and desktop; all role drawers show relevant tasks; teacher fills preview, edits, applies, then uses existing draft save and review flow. Unapproved teacher sees access/application help. Confirm no provider request and no misleading AI-generated claim. Keyboard-open/close drawer and verify focus returns to trigger.
4. Standard repo lint/typecheck/unit/build checks. No Supabase migration or production deployment required. Staging deployment only through parent-authorized workflow.

## Future provider work is separate

After explicit provider eligibility resolution, add one server-only bounded inference call with a fixed endpoint/model, hard timeout, strict response schema, conservative token bound, persisted account/global budget reservation, safe structured errors, and no raw prompt or output logging. Built-in fetch is sufficient for one request; a new SDK is not necessary merely to make a single REST call. Neither a key nor the teacher UI resolves the age/access restriction. Production activation remains a separate authorized step.
