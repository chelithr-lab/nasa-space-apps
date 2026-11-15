// Central configuration. Override the Serenity link with VITE_SERENITY_URL (see README).
export const CONFIG = {
  appName: 'Lunar Payloads Explorer',
  serenityName: 'Serenity',
  serenityUrl: import.meta.env.VITE_SERENITY_URL || 'http://localhost:5173/',
  typeaheadLimit: 8,
  typeaheadMinChars: 2,
  typeaheadDebounceMs: 150,
} as const;
