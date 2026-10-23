# DarSak pilot

Status: evidence collection prepared. The maintainer reports existing teacher/student use at their university; see [Adoption](../ADOPTION.md). No new participant enrollment or pilot activity has been performed by this repository task.

## Purpose and scope

Use a small, voluntary pilot to learn whether teachers and students can repeatedly organize groups, request/approve enrollment, follow lessons in the timetable, and open shared resource links. Try both Arabic and English where participants are comfortable doing so. Email workers and email-provider changes are outside this pilot's scope.

A suggested starting group is two teachers and five to ten students over two weeks, plus one developer who has no access to the maintainer's setup. These are practical planning suggestions, not OpenAI eligibility thresholds or actual participant counts.

## Before inviting anyone

- Choose a hosted instance controlled by the operator. Keep the public-password local demo off hosted infrastructure.
- Verify the core workflow with synthetic accounts first. State known limitations and explain how to report a problem privately.
- Recruit consenting adults for the initial pilot. If a later pilot includes minors, establish appropriate guardian/institution permissions and privacy arrangements before collecting any information.
- Explain what participation involves, what minimal information will be collected, how it will be used, and how someone can withdraw. Participation and permission to publish feedback are separate choices.
- Keep participant names and contact details in a private operator-controlled record, never in GitHub. Use aggregate counts in public evidence.

## Suggested schedule

| Stage             | Teacher/student activity                                                           | What to record                                                           |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Preparation       | Confirm access and preferred language; introduce the task list                     | Pilot dates, release version, consented aggregate participant counts     |
| First session     | Teacher publishes a group and lesson; student requests enrollment; teacher accepts | Tasks completed, blockers, language/device context                       |
| Return session    | Student returns on another day, checks the timetable, and opens a resource link    | Aggregate returning participants and task completion                     |
| Feedback          | Ask the questions below; triage reported problems                                  | Dated aggregate feedback, issue links, fixes, and unresolved limitations |
| Independent setup | Developer follows the published guide on their own machine                         | OS/tool versions, commands, problems, and deployment outcome             |

Let the teacher select real lesson dates and materials; do not create artificial activity to increase counts. Operators should provide participant support through a channel participants have agreed to use.

## Participant task cards

**Teacher:** Sign in, check your profile, create a group and schedule slot, publish the group, review an enrollment request, create a lesson, and share a resource link. Return later to inspect the roster and timetable.

**Student:** Sign in, discover the group, request enrollment, check its outcome after approval, find the lesson in your timetable, and open its resource link. Return on a different day and repeat the timetable/resource tasks.

**Independent developer:** Follow [Development](../DEVELOPMENT.md) from a fresh clone without maintainer credentials or workspace scripts. Record your OS and versions, commands used, and whether migrations, demo logins, tests, and both language views work. Use [issue #76](https://github.com/abdulrahman-111/DarSak/issues/76) to report reproducibility problems. A maintainer's automated test does not count as an outside contribution or independent human deployment.

## Feedback questions

1. What were you trying to do, and did you complete it?
2. Which step was confusing or required help?
3. Could you find your next lesson and its resources when you returned?
4. Was the language, right-to-left layout, or mobile view difficult to use?
5. What one change would make you more likely to use DarSak again?

Record responses privately. Publish a quotation only with explicit permission and remove identifying information unless the person separately agrees to attribution.

## Evidence record

Use [aggregate-results.csv](aggregate-results.csv) for dated aggregate observations. It intentionally contains only a header until real results exist. Definitions:

- `teachers_active` and `students_active`: distinct consenting participants who completed at least one relevant task during that observation period.
- `returning_participants`: consenting participants who used the pilot on a later calendar day, based on observations the operator can substantiate.
- `lessons_used` and `resources_opened`: actual observed counts for the period; state whether they came from direct observation, participant reports, or approved analytics in `evidence_method`.
- `independent_deployments`: successful deployments performed by outside developers, with a link or private substantiating record.
- `issues_opened` and `issues_resolved`: links or counts tied to pilot feedback; do not count unrelated maintenance as pilot response.

Leave unknown values blank, identify the observation window and evidence source, and never treat demo accounts, screenshots, CI runs, stars, or invented activity as real adoption. Summarize limitations alongside results before using them in a program application.
