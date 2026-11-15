/** Tiny text formatters shared by the 3D labels (no Three.js needed). */

/** "384,400 km" with a thin grouping, rounded to the nearest 100 km. */
export function moonLabelFormat(distanceKm: number): string {
  const rounded = Math.round(distanceKm / 100) * 100;
  return `${rounded.toLocaleString('en-US')} km`;
}
