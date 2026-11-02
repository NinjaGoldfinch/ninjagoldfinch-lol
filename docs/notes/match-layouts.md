# Match page layouts

The match page has to fit two team scoreboards and a build into as little height as possible. Three layouts were mocked up on 2026-10-10, at 1440 × 900 against the recorded match `OC1_712351051`. This note keeps only the decision. The screenshots and mock-up CSS were removed in RV-11: the side-by-side layouts are rejected for good, and the stacked screenshots predate the Timeline tab (#48) and the chart changes (#50).

## Chosen: stacked scoreboards, build in a popup (A)

The two team tables stay full width, one above the other. No build is on the page until a visitor clicks a champion or the header's build link; the build then opens as a modal dialog over the page. Without JavaScript the same link loads `?build=N#build`, and the build renders below the scoreboards. This is what was built (ADR-028). The timeline charts later went in a tab, not on the same page (ADR-029).

## Rejected: teams side by side (B, and B with the build underneath)

Blue on the left and Red on the right, each in half the width, with the Gold, CS and Vision columns dropped and smaller items; one variant put the build full width below both teams. The owner found side-by-side tables less attractive than stacked ones, and rejected them for good. Do not offer them again, as a default or as a layout a visitor picks. For more density, use popups or tabs for secondary content.
