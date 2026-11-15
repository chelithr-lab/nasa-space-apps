# Elevation mode: what the colours mean, and what they cannot tell you

## What you see
Pick **Elevation** in the Visualisation mode box (bottom right). The same Moon mesh, camera, clock, terrain, markers and dossier stay as they are; only the surface material changes. Switching back to Normal restores the photographic texture exactly. Pick any not-yet-built mode and the Moon returns to Normal, as that mode's label says.

## The data and the datum
Source: NASA SVS CGI Moon Kit `ldem_16`, a repackaging of the LRO LOLA LDEM_16 elevation grid (5760 x 2880, about 1.9 km per cell, each cell an area mean). Height in metres = (count - 20000) / 2, **above a reference sphere of radius 1737.4 km**. This is not sea level and not a geoid: the Moon has neither. "0 km" is a convention.

## How a colour is chosen
1. The raster is box-averaged to 4096 x 2048 (the mean of counts, so mean height is preserved). Colouring happens AFTER averaging.
2. Each averaged height is converted to a position between two limits (the **display range**) and looked up on a palette. The stretch is linear in height; no gamma, no histogram equalisation, no relation to imagery or lighting.
3. Heights outside the range take the end colours and are called **clipped** in the legend. Limits are rounded outward to 100 m.
4. The legend bar, tick labels and the Moon use the same lookup table, so they cannot disagree.

Display ranges: *Full data range* (lowest to highest cell mean, nothing clipped) and *Contrast* (2nd to 98th percentile of cell-mean height, area-weighted, default; the legend states the clipping). The small grey histogram above the bar shows the share of the Moon's surface at each height, so you can see why the contrast range is the default: most of the surface lies in a narrow band, and a full-range stretch would squeeze the maria and highlands into a few similar colours.

## Palettes
- **Hypsometric (blue to red):** designed for this app: deep violet, blue, cyan, green, yellow, orange, red, white (highest). Easy to read as low/middle/high. It is a rainbow-type ramp: lightness is not monotonic and it is not safe for every kind of colour-blindness.
- **Viridis:** matplotlib's perceptually uniform colormap (Smith and van der Walt), 17 sample points read from matplotlib 3.11.2. Lightness rises steadily (tested), and it is readable by most colour-blind viewers.
Both are blended in Oklab (Ottosson, 2020) so intermediate colours are perceptually even. Colour boundaries are equal height steps and have no geological meaning. Optional **1 km steps** group heights into bands for easier reading.

## Lighting and exaggeration
Colours are drawn **unlit**, so brightness cannot be mistaken for height. "Add Sun lighting" overlays the simulated Sun; then brightness also reflects sunlight and the legend warns you. The 3D relief is exaggerated (default 1.5x, see the Terrain chip; add `?exaggeration=1` for true scale), but the colours and the "Surface point" height always use the true heights.

## Limitations (also in the app)
- Cells are 1.9 km means: craters, rims and ridges smaller than a few cells are smoothed; the lowest/highest values shown are cell means, not the published point extremes (for example +10,786 m for the highest point).
- No vertical accuracy for LDEM_16 cells was found in the sources read, so none is shown. Where LOLA ground tracks are sparse the grid is interpolated; the count maps that flag this are not loaded.
- The orientation of the file is checked only against published landmarks. Run `node scripts/check-orientation.ts` and compare with the texture before presenting positions as verified.
- The averaged texture is 4096 x 2048 (3.5 km cells at the equator), coarser than the raw 1.9 km cells, to save memory. The mesh (256 x 128) is coarser still.
- Banding, percentiles and palettes are display choices; the underlying numbers are never changed.

## Cost
Built once, the first time Elevation is chosen: statistics (about 70 ms), averaging (about 0.3 to 0.4 s), colouring (about 50 ms), measured in Node on a synthetic full-size raster in my sandbox, NOT on your laptop (expect up to about twice as long once). Memory: about 17 MB averaged counts + 34 MB colour bytes kept in the browser, about 45 MB on the GPU (with mipmaps). Changing palette, range or steps re-colours in place (about 50 to 100 ms). Normal mode pays none of this.

## Not tested here
`npm run build`; the real WebGL render with the real raster; frame rate on the Intel UHD 620; the real appearance of the colours on the Moon (the UI was checked in Chromium with a synthetic stand-in raster and a stand-in scene).

## Browser checklist
1. Normal looks as before. Choose Elevation: after a moment the Moon recolours, the legend appears, the chip says "Colours = elevation, not imagery", camera, time and any open dossier are unchanged.
2. Maria (for example Imbrium and Serenitatis) should be cooler/lower colours than the surrounding highlands; South Pole-Aitken basin (far side, southern) should be among the lowest colours; the high far-side terrain near 5 N, 159 W among the highest.
3. Hover: the white triangle on the legend follows the pointer; the "Surface point" height should match the colour.
4. Far side and both poles: no stripes, cracks or spikes; check the +-180 seam.
5. Switch palette, range, steps; the legend and Moon change together. Tick "Add Sun lighting" and read the warning.
6. Switch to Slope (not built): Moon returns to Normal. Back to Elevation: same camera, time and mission.
7. Rotate and play time; confirm it is still smooth on your laptop. Tell me the first-switch delay.
