import { MODE_ORDER, modeDescriptor, modeView } from '../modes/visualisationModes.ts';
import type { ModeId } from '../modes/visualisationModes.ts';
import { DATUM_STATEMENT } from '../modes/demSources.ts';

/**
 * Visualisation-mode selector, designed to sit inside the existing bottom-right controls panel.
 *
 * It is honest by construction: every mode that is not 'available' says so next to its name, shows
 * no numbers, and states that the Moon is still in its Normal appearance. All wording comes from
 * src/modes/visualisationModes.ts (unit-tested).
 */

const CSS = `
.app .overlay-bottom-right.panel-mini{max-height:calc(100% - 76px);overflow-y:auto}
.app .vmode{display:flex;flex-direction:column;gap:5px;max-width:240px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--line,#1f2c47)}
.app .vmode .vmode-label{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#92a1b8)}
.app .vmode select{width:100%}
.app .vmode .vmode-status{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:600}
.app .vmode .vmode-status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.app .vmode .s-available{color:#5fe0b0}
.app .vmode .s-awaiting-implementation{color:#f2b84b}
.app .vmode .s-awaiting-data{color:#ff9f6b}
.app .vmode .vmode-notice{margin:0;font-size:.74rem;line-height:1.4;color:var(--muted,#92a1b8)}
.app .vmode details{font-size:.74rem;color:var(--muted,#92a1b8)}
.app .vmode summary{cursor:pointer}
.app .vmode details[open] .vmode-more{max-height:min(22vh,160px);overflow-y:auto;padding-right:4px;margin-top:6px}
.app .vmode details h4{margin:8px 0 3px;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:#7ea2c4}
.app .vmode details ul{margin:0;padding-left:16px}
.app .vmode details li{margin:2px 0}
`;

export function ModeSelector({ mode, onChange }: { mode: ModeId; onChange: (mode: ModeId) => void }) {
  const view = modeView(mode);
  const d = modeDescriptor(mode);
  return (
    <div className="vmode" role="group" aria-label="Visualisation mode">
      <style>{CSS}</style>
      <label className="vmode-label" htmlFor="vmode-select">
        Visualisation mode
      </label>
      <select id="vmode-select" value={mode} onChange={(e) => onChange(e.target.value as ModeId)}>
        {MODE_ORDER.map((id) => {
          const v = modeView(id);
          return (
            <option key={id} value={id}>
              {v.available ? v.label : `${v.label} (${v.statusLabel.toLowerCase()})`}
            </option>
          );
        })}
      </select>
      <span className={`vmode-status s-${view.status}`} role="status">
        {view.label}: {view.statusLabel}
      </span>
      {!view.available && <p className="vmode-notice">{view.notice}</p>}
      {!view.available && (
        <details>
          <summary>About this mode</summary>
          <div className="vmode-more">
          <p className="vmode-notice">{d.purpose}</p>
          <h4>It will show</h4>
          <ul>
            {d.plannedContent.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h4>Still needed</h4>
          <ul>
            {d.needs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {mode === 'elevation' && (
            <>
              <h4>Vertical reference</h4>
              <p className="vmode-notice">{DATUM_STATEMENT}</p>
            </>
          )}
          </div>
        </details>
      )}
    </div>
  );
}
