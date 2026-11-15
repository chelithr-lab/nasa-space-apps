// Central configuration. "Back to Serenity" goes to the site root: the payload app is served under
// <site>/payloads/, so the root is one level up from its base path. VITE_SERENITY_URL overrides this
// (standalone development sets it in .env.development).
export const CONFIG = {
  appName: 'Serenity - Payload Explorer',
  serenityName: 'Serenity',
  serenityUrl: import.meta.env.VITE_SERENITY_URL || import.meta.env.BASE_URL.replace(/[^/]+\/$/, ''),
  typeaheadLimit: 8,
  typeaheadMinChars: 2,
  typeaheadDebounceMs: 150,
} as const;
