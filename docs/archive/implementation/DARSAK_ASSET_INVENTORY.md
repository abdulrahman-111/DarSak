# DarSak supplied asset inventory

All 21 SVGs were inspected and rendered for visual review. The three PNG previews generated during review are not additional supplied assets.

## Exact filename to site use

| Supplied filename | Site filename | Intended use / current status |
| --- | --- | --- |
| `Academic Stage.svg` | `academic-stage.svg` | Education-level context in discovery cards and group detail. Used beside the matching stage label. |
| `Academic Subjects.svg` | `academic-subjects.svg` | Landing subject-range item “School subjects” / “المواد الدراسية”. |
| `Accepted Request Toast.svg` | `accepted-request-toast.svg` | Accepted-request confirmation illustration in the sample timetable card. |
| `Available Seats.svg` | `available-seats.svg` | Available seat counts in reusable group cards and group detail. Used beside the matching seat count. |
| `Custom Categories.svg` | `custom-categories.svg` | Landing subject-range item “Custom categories” / “فئات مخصصة”. |
| `English Header Lockup.svg` | `english-header-lockup.svg` | English site header lockup. |
| `Favicon.svg` | `favicon.svg` | Browser favicon and platform sidebar app mark. |
| `Find a Group That Fits You.svg` | `find-a-group-that-fits-you.svg` | Student feature card about discovering a suitable tutoring group. |
| `Find a Group.svg` | `find-a-group.svg` | Alternate discovery/search illustration. Unused because the more specific “fits you” version already represents the landing feature. |
| `Group Discovery Metadata Badges_ Online Mode.svg` | `group-discovery-metadata-badges-online-mode.svg` | Teaching-mode badge on teacher-profile group cards when the public teacher profile explicitly indicates online teaching; omitted elsewhere when no mode data is available. |
| `Hero Badge Icon.svg` | `hero-badge-icon.svg` | Small calendar badge beside the landing eyebrow, reinforcing weekly lesson planning. |
| `Languages.svg` | `languages.svg` | Landing subject-range item “Languages” / “اللغات”. |
| `Manage Each Group.svg` | `manage-each-group.svg` | Teacher feature card for enrollment and group management. |
| `Next Session Time.svg` | `next-session-time.svg` | Next-session time in reusable group cards and group detail. |
| `Organize Classes.svg` | `organize-classes.svg` | Student feature card for keeping accepted lessons organized in a timetable. |
| `Organize Your Classes.svg` | `organize-your-classes.svg` | Alternate calendar illustration. Unused because `Organize Classes.svg` already matches the student timetable card. |
| `Plan Groups Easily.svg` | `plan-groups-easily.svg` | Teacher feature card for group and lesson planning. |
| `Prepare for Class.svg` | `prepare-for-class.svg` | Student feature card for class preparation and shared materials. |
| `Programming.svg` | `programming.svg` | Landing subject-range item “Programming” / “البرمجة”. |
| `Showcase Teaching Style.svg` | `showcase-teaching-style.svg` | Teacher feature card for profile and teaching-style presentation. |
| `The Header Logo_arabic.svg` | `the-header-logo-arabic.svg` | Arabic site header lockup. |

Only `Find a Group.svg` and `Organize Your Classes.svg` remain unused as alternate versions; the context-specific metadata icons are used in group cards, group details, or teacher-profile cards. All decorative images have empty alt text and `aria-hidden`.

## Motion and rendering

The landing introduction and sample timetable preview use short CSS entrance transitions. Feature cards have a small lift and shadow on hover and keyboard focus. These effects only change opacity and transform/shadow; they do not gate content, add JavaScript, or add dependencies. The existing global `prefers-reduced-motion: reduce` rule is supplemented by scoped overrides that set landing animations and transitions to `none` and force card transforms to `none`. Landing SVGs use explicit intrinsic width/height through `next/image` to reserve space and prevent layout shifts.

