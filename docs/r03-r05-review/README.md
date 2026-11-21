# R03–R05 review evidence

Chrome 156 captures at 1440 × 1000 unless noted. The before images are the
same-size R01/R02 baseline captures from immediately before this coordinated
menu/window/Terminal update.

## R03 — menu bar and dropdown density

- `before-laptop-menu.png` — prior laptop-view menu baseline.
- `after-laptop-menu.png` — compact laptop-view row using the measured 44px
  logical row for the projected screen.
- `before-screen-menu.png` — prior Screen-view menu baseline.
- `after-screen-menu.png` — compact 28px Screen-view row.
- `menu-density-laptop-view.png` — compact 3-item `View` dropdown in laptop view.
- `menu-density-laptop-file.png` — 5-item `File` dropdown in laptop view.
- `menu-density-screen-view.png` — compact 3-item `View` dropdown in Screen view.
- `menu-density-screen-file.png` — 5-item `File` dropdown in Screen view.
- `menu-density-large-narrow-file.png` — `File` dropdown at 390 × 844 with 145%
  interface scale.
- `menu-density-touch-view.png` — coarse-pointer `View` dropdown preserving 44px
  minimum touch item targets.
- `menu-dropdown-glass.png` — frosted dropdown popup over overlapping windows.

The menu row remains connected to the shared desktop measurement and window
work-area path; it does not use a separate window offset. Dropdown popups use
`width: max-content` with a 220px floor, 32px pointer row height (44px on coarse
pointers), and frosted dark glass (`backdrop-filter: blur(22px) saturate(1.25)`).

## R04 — title-bar glass

- `overlapping-windows-title-glass.png` — Notes and Terminal with glass title
  strips and opaque app surfaces.

The production browser check confirms `backdrop-filter: blur(14px)` on title
bars, no backdrop filter on the outer frame, and non-transparent app surfaces.
The solid title-bar/frame colors remain the fallback when filtering is not
available.

## R05 — Terminal and welcome layering

- `welcome-layered-right-folders.png` — delayed welcome notification layered
  cleanly in the top-right desktop space after the 2-second entrance settle.
- `terminal-initial.png` — calm opening screen with Projects, Skills and About.
- `terminal-project-response.png` — streamed project response with verified
  repository links.
- `terminal-narrow-large-reduced.png` — narrow 390 × 844, 145% text/interface,
  reduced-motion view.

The browser scenarios also exercised typed Skills and `project veyra`, Escape
interruption, Show now, project links, menu keyboard dismissal, maximize/
restore, light/dark-capable styles, reduced motion, and the existing welcome
entry point.

Native Safari, Windows, and physical trackpad hardware were not exercised.
