import { useEffect } from 'react';
import { CONFIG } from '../config';

/** Sets "{title} · Serenity - Payload Explorer" (or the app name alone when there is no title). */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${CONFIG.appName}` : CONFIG.appName;
  }, [title]);
}
