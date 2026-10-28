# Screenshots

The current route gallery, provenance, and generated coverage report are in [docs/screenshots/README.md](screenshots/README.md). Regenerate the gallery after adding capture manifests with `node scripts/screenshots/build-gallery.mjs`.

To browse the interactive contact sheet locally, open [index.html](screenshots/index.html) from a cloned or downloaded repository. If the browser blocks `file://` previews, run `python3 -m http.server 4173 --bind 127.0.0.1 --directory docs/screenshots` from the repository root and open `http://127.0.0.1:4173/`. GitHub displays the HTML source instead of running its filters.

Current captures are local renders using synthetic fixtures, labeled with the code revision they represent. They are not screenshots taken from live production or staging deployments. Missing routes and provider-dependent states are reported separately from successful captures.

## Historical captures

The 24 PNGs below are the earlier curated screenshot set from 23 October 2026. They remain available under `docs/images/`, separate from the current route inventory and its coverage counts.

| View                     | English desktop                                       | Arabic desktop                                        | English mobile                                      | Arabic mobile                                       |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Teacher dashboard        | [EN desktop](images/teacher-dashboard-en-desktop.png) | [AR desktop](images/teacher-dashboard-ar-desktop.png) | [EN mobile](images/teacher-dashboard-en-mobile.png) | [AR mobile](images/teacher-dashboard-ar-mobile.png) |
| Teacher group management | [EN desktop](images/teacher-group-en-desktop.png)     | [AR desktop](images/teacher-group-ar-desktop.png)     | [EN mobile](images/teacher-group-en-mobile.png)     | [AR mobile](images/teacher-group-ar-mobile.png)     |
| Student dashboard        | [EN desktop](images/student-dashboard-en-desktop.png) | [AR desktop](images/student-dashboard-ar-desktop.png) | [EN mobile](images/student-dashboard-en-mobile.png) | [AR mobile](images/student-dashboard-ar-mobile.png) |
| Student timetable        | [EN desktop](images/student-timetable-en-desktop.png) | [AR desktop](images/student-timetable-ar-desktop.png) | [EN mobile](images/student-timetable-en-mobile.png) | [AR mobile](images/student-timetable-ar-mobile.png) |
| Public discovery         | [EN desktop](images/discovery-en-desktop.png)         | [AR desktop](images/discovery-ar-desktop.png)         | [EN mobile](images/discovery-en-mobile.png)         | [AR mobile](images/discovery-ar-mobile.png)         |
| Landing page             | [EN desktop](images/home-en-desktop.png)              | [AR desktop](images/home-ar-desktop.png)              | [EN mobile](images/home-en-mobile.png)              | [AR mobile](images/home-ar-mobile.png)              |

See the [validation record](releases/0.1.0-validation.md) for the original tested flows and exclusions.
