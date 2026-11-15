import { Fragment } from 'react';
import { highlightSegments } from '../lib/search';

/** Renders text with the query's matches wrapped in <mark>. Text is never treated as HTML. */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, query).map((segment, i) =>
        segment.match ? <mark key={i}>{segment.text}</mark> : <Fragment key={i}>{segment.text}</Fragment>,
      )}
    </>
  );
}
