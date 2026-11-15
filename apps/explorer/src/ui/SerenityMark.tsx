/**
 * Serenity wordmark. Darker Grotesque Regular is used here and nowhere else (see .sg-wordmark in tokens.css).
 * The descriptor is Economica. The mark is a link back to the Serenity home page: the explorer lives at
 * <site>/explorer/, so the home page is one level up from its base path.
 */
export function SerenityMark() {
  const homeUrl = import.meta.env.BASE_URL.replace(/[^/]+\/$/, '');
  return (
    <a className="sg-brand" href={homeUrl} aria-label="Serenity, Lunar Explorer. Back to the Serenity home page">
      <span className="sg-wordmark" aria-hidden="true">
        Serenity<sup>™</sup>
      </span>
      <span className="sg-descriptor" aria-hidden="true">
        LUNAR EXPLORER
      </span>
    </a>
  );
}
