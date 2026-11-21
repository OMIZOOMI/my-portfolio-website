# Screen view text clarity correction

The reported blur was in Screen view. Inspection found identity scaling on the desktop, permanent window compositor promotion, shadowed window titles, and Glisse Button foregrounds sharing the refracted control surface. These are plausible causes of perceived softness; the visitor's native Safari rendering has not been measured.

Changes:

- Render the desktop with `transform: none` at interface scale 1; preserve actual larger-text scales and the existing view-change animation.
- Remove idle window `will-change: transform` and title text shadows.
- Use native semantic buttons with forwarded refs and an independent Glisse backing. Labels/icons are a foreground sibling; only the backing changes on press.
- Reduce backing frost to 2px on controls, 4px on title/tab plates, and 12px on menu/Dock materials.
- Separate menu bar, dropdown, context-menu and Dock backings from their foregrounds. Menu items scroll independently so their decorative surface stays fixed; keyboard focus targets the inner scroller.
- Put the prefixed backdrop declaration before the canonical property. The production CSS optimizer previously retained only the prefixed form in these rules; generated CSS now retains both.

Production Chrome 157 checks on macOS 27.2, 1200 × 683 CSS px, DPR 2:

- Desktop transform `none`; idle window `will-change: auto`.
- Browser button and foreground label: no filter, backdrop filter or transform. Decorative backing: 2px blur plus the Glisse lens.
- Menu semantic host: no backdrop filter; its pseudo backing: 12px blur. A constrained 56px item list scrolls 40px to its final item with Home/End while the outer menu scroll stays 0. Escape dismisses normally.
- No console errors in the exercised flow.
- Production build, TypeScript, lint and regression checks pass (see `checks.log`).

`before-screen.png` and `after-screen.png` use the same viewport and Browser content. The before capture also contains other open apps behind Browser; these are not identical pixel-comparison fixtures. No numeric sharpness improvement or native Safari parity is claimed.

Native Safari and Windows visual verification remain outstanding. Original glass source and license are documented in `../glass-review/README.md`; this note supersedes its description of the Button wrapper, which now uses a native foreground over Glisse's decorative Glass component.
