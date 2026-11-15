# Terrain data: what we use, what is documented, what is assumed

Status key: **DOCUMENTED** = stated by a NASA page listed below. **DERIVED** = follows from documented statements by arithmetic. **ASSUMED** = not stated anywhere I could find; checked by `scripts/check-ldem.ts` but not proven. **UNKNOWN** = not established.

## The elevation file

| Item | Value | Status |
|---|---|---|
| File | `public/textures/ldem_16_uint.tif` (and the `.raw` made from it) | your project |
| Source product | NASA SVS "CGI Moon Kit", displacement map `ldem_16_uint.tif`, made from the LRO LOLA gridded elevation product (LDEM_16) | DOCUMENTED (SVS 4720) |
| Size and sampling | 5760 x 2880 pixels, 16 pixels per degree (1/16 degree, about 1.9 km) | DOCUMENTED (file listing); the 16 ppd is in the product name |
| Projection | Global cylindrical (equirectangular / simple cylindrical) | DOCUMENTED (SVS 4720, ODE GDR page) |
| Longitude origin | Centred on 0 degrees longitude (SVS shifted it; LOLA's own grids run 0 to 360) | DOCUMENTED that it is centred on 0; the exact range is not stated, so "left edge = -180" is DERIVED |
| Reference surface | Sphere of radius 1737.4 km | DOCUMENTED (SVS 4720; PDS LOLA FAQ gives offset 1737400 m) |
| Encoding | LOLA: signed 16-bit counts, 0.5 m per count. SVS unsigned file: counts + 20000 | DOCUMENTED (SVS 4720; PDS LOLA FAQ: height = count x 0.5 + 1737400) |
| Decoding used | `height above the 1737.4 km sphere = (count - 20000) / 2` metres | DERIVED from the two lines above; **no page prints this exact formula** |
| Pixel meaning | A pixel is the mean over its cell; the pole is a point surrounded by the four central pixels (no pixel is centred on a pole) | DOCUMENTED (ODE GDR page) |
| Byte order of our RAW | Little-endian | CHECKED by you: five pixels matched the TIFF |
| Row 0 is north | Yes | **ASSUMED**; `check-ldem.ts` tests consistency with NASA's description of the South Pole-Aitken basin |
| Column 0 starts at -180 degrees | Yes | **ASSUMED**; same check (a 180 degree shift moves the lowest point to the near side) |
| East is to the right | Yes | **ASSUMED**; not testable by the script, checked by eye in the browser (dark seas lie in low ground) |
| Vertical accuracy | not stated on the pages read | **UNKNOWN**: we show no accuracy figure |
| Data near the poles | whether any polar cells are interpolated is not stated | **UNKNOWN** |
| Observed / modelled / derived | A gridded product built from laser altimeter measurements, so a derived data product, not a raw measurement | DOCUMENTED in general terms |

The decoded number is a **height above a reference sphere**, not "elevation above sea level". The interface should say "height relative to the 1737.4 km reference sphere".

## The colour map (for comparison, since the poles look different)

`moon_color_2k.jpg` is from the same Moon Kit. NASA states its source data covers 70 N to 70 S, that higher latitudes are filled from a lower-resolution monochrome albedo map, that some high-latitude dropouts were inpainted, and that the image is "optimized for aesthetics, not science". In an equirectangular 2048 x 1024 image a pixel is 5.3 km north-south everywhere but only 0.46 km east-west at 85 degrees latitude, so polar regions look stretched on a sphere whatever the mesh does. This is a property of the data and the projection.

## How the code uses the elevation file (`src/sim/lunarElevation.ts`)

- Heights are **averaged over each mesh vertex's cell** (surface-area weighted), because a LOLA pixel is itself a cell mean and a 256 x 128 mesh quad covers about 22 x 22 pixels. A coarse mesh therefore shows a smoothed surface: narrow pits and peaks are averaged away. That is a resolution limit, not an accuracy statement.
- Vertices that coincide (every pole vertex; the seam column and its duplicate) receive **one** height by construction.
- Longitude wraps around the sphere. A row past a pole is the row just inside it on the opposite meridian.
- Normals are computed from the displaced grid so that seam and pole vertices share them.
- Nothing here is a landing-safety assessment, a shadow calculation, or a permanent-shadow classification.

## Sources read for this document

- NASA SVS, CGI Moon Kit: https://svs.gsfc.nasa.gov/4720
- PDS LOLA FAQ (scaling 0.5, offset 1737400, 16-bit signed): https://pds-geosciences.wustl.edu/missions/lro/lola_faq.htm
- ODE, LOLA Gridded Data Record Shape Map (projection, 0-360, pixel = cell mean, pole between four pixels): https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm
- NASA Science, South Pole-Aitken Basin (far side, southern edge as seen from Earth, deepest basin): https://science.nasa.gov/moon/lunar-craters/what-is-the-south-pole-aitken-basin/
- NASA, LRO LOLA image of the basin (deepest impact basin, more than 8 km deep): https://www.nasa.gov/mission_pages/LRO/multimedia/lroimages/lola-20100409-aitken.html
