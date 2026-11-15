/** Small display helpers for time offsets (pure). */

const YEAR_SECONDS = 365.25 * 86400;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Human-readable gap between simulation time and real time.
 * Examples: "in sync with real time", "+2 d 03:04:05 (future)", "-00:10:00 (past)".
 */
export function describeOffset(offsetSeconds: number): string {
  if (!Number.isFinite(offsetSeconds)) return 'unknown';
  if (Math.abs(offsetSeconds) < 2) return 'in sync with real time';
  const sign = offsetSeconds > 0 ? '+' : '-';
  const label = offsetSeconds > 0 ? 'future' : 'past';
  const abs = Math.abs(offsetSeconds);
  if (abs >= YEAR_SECONDS) {
    return `${sign}${(abs / YEAR_SECONDS).toFixed(2)} years (${label})`;
  }
  const whole = Math.floor(abs);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const hms = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${sign}${days} d ${hms} (${label})` : `${sign}${hms} (${label})`;
}

/** Label for a signed speed in simulated seconds per real second. */
export function describeSpeed(speed: number): string {
  const abs = Math.abs(speed);
  const dir = speed < 0 ? 'backwards ' : '';
  if (abs === 1) return `${dir}real time`;
  if (abs < 60) return `${dir}${abs} s / s`;
  if (abs < 3600) return `${dir}${+(abs / 60).toFixed(2)} min / s`;
  if (abs < 86400) return `${dir}${+(abs / 3600).toFixed(2)} h / s`;
  return `${dir}${+(abs / 86400).toFixed(2)} d / s`;
}
