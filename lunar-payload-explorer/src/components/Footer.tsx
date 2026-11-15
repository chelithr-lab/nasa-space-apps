import type { Catalogue } from '../types/catalogue';

export function Footer({ catalogue }: { catalogue: Catalogue }) {
  const generated = new Date(catalogue.generatedAt);
  const stamp = Number.isNaN(generated.getTime()) ? '' : ` · index generated ${generated.toISOString().slice(0, 10)}`;

  return (
    <footer className="app-footer">
      <div className="container app-footer__inner">
        <p>
          <strong>About this data.</strong> A working catalogue of {catalogue.counts.payloads} payloads in{' '}
          {catalogue.counts.categories} categories. Entries have not been independently deduplicated or technically
          validated. Specifications refer to named example instruments.
        </p>
        <p>Images © their respective publishers (e.g. NASA, NASA/JPL-Caltech) and are linked from their official sources.</p>
        <p className="muted">
          Catalogue: {catalogue.counts.payloads} payloads in {catalogue.counts.categories} categories{stamp}
        </p>
      </div>
    </footer>
  );
}
