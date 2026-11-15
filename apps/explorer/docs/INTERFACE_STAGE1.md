# Interface redesign, Stage 1: tokens, fonts, glass, governor

Scope: design tokens, the two fonts, glass recipes, an optional re-skin of the current interface, and a frame-time governor.
Not in this stage: the shell, edge panels, HUD, LSI sizes and Analysis Mode (Stages 2 to 5 of the approved proposal).

## Files (all new; no existing file is overwritten)
| File | Purpose |
|---|---|
| `src/styles/tokens.css` | `--lg-*` colour, type, shape, motion and glass tokens; `@font-face`; surface tiers `.lg-g1/.lg-g2/.lg-g3`; type roles; focus ring; status shapes |
| `src/styles/themeBridge.css` | Optional. Maps the existing variables to the new palette and replaces the cyan and navy colours in `app.css` and `solar.css`. Remove the import to undo. |
| `src/assets/fonts/Inter-Bold.otf`, `Inter-OFL.txt` | Inter Bold, unmodified, with its licence |
| `src/ui/glassGovernor.ts` | Pure logic: rolling frame windows, percentile, solid-or-glass decision |
| `src/ui/useGlassGovernor.ts` | React hook: measures frames, sets `<html data-glass>`; `?glass=auto|on|off`, `?perf=1` readout |
| `src/ui/glassGovernor.test.ts`, `src/ui/designTokens.test.ts` | 24 tests |
| `scripts/check-fonts.ts` | Checks the font files by reading their own name tables |

## Rules the tests enforce
- The six approved colours are exact.
- Text colours reach 4.5:1 on the panel and ground colours. Control borders reach 3:1.
- Glass G1 (80 percent panel colour, backdrop dimmed to 55 percent) keeps primary, lifted secondary, blue and amber text at 4.5:1 or more over a pure white backdrop. The original secondary grey does not, so the lifted grey is used on glass.
- Exactly two font families: Inter at 700, Economica at 400 and 700. Economica text sizes are 14 px or more.
- No cyan in the bridge; every `--lg-` variable that is used is defined; a solid fallback exists for every glass surface.

## Governor rules
Auto mode compares the 95th-percentile frame interval with glass visible against the interval with no glass visible. It switches to the near-solid tier only if glass is slower than 22 ms and at least 4 ms slower than the baseline (or slower than 22 ms when there is no baseline). It stays solid once switched. These thresholds are my starting values, not measured on your computer.
