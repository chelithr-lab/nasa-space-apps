import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Mission } from '../sim/missionCatalogue.ts';
import { OUTCOME_LABEL } from '../sim/missionCatalogue.ts';
import {
  CATEGORY_LABEL,
  PAYLOAD_STEPS,
  dossierTabs,
  keyFacts,
  locationView,
  outcomeTone,
  payloadView,
  sourceViews,
  timelineView,
} from '../sim/missionDossierModel.ts';
import type { DossierTab } from '../sim/missionDossierModel.ts';

/**
 * Mission dossier: a docked panel over the 3D view.
 *
 * Closing is always possible: the header (with the Close button) is outside the scrolling
 * area, so it can never scroll out of reach; Escape also closes; and the panel only covers
 * its own box, so the Moon stays draggable and its markers stay selectable around it.
 * All wording comes from src/sim/missionDossierModel.ts (unit-tested).
 */

const CSS = `.mdx{position:absolute;z-index:8;top:58px;left:12px;bottom:40px;width:min(420px,calc(100% - 24px));display:flex;flex-direction:column;box-sizing:border-box;  color:#e6f1fb;background:linear-gradient(180deg,rgba(7,17,33,.97),rgba(4,10,21,.97));border:1px solid rgba(83,224,242,.35);border-radius:10px;  box-shadow:0 18px 48px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);pointer-events:auto;overflow:hidden;  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mdx *{box-sizing:border-box}
.mdx .mdx-head{flex:0 0 auto;padding:10px 12px 9px;border-bottom:1px solid rgba(160,190,220,.16);background:rgba(255,255,255,.02)}
.mdx .mdx-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.mdx .mdx-kicker{margin:0 0 4px;font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#53e0f2}
.mdx .mdx-title{margin:0;text-transform:none;letter-spacing:.01em;color:#fff;font-size:17px;line-height:1.2;font-weight:650;letter-spacing:.01em}
.mdx .mdx-sub{margin:0;font-size:12px;color:#9fb6cc}
.mdx .mdx-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:7px}
.mdx .mdx-close{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 11px;border-radius:8px;border:1px solid rgba(160,190,220,.4);  background:rgba(255,255,255,.08);color:#f2f8ff;font:600 12px/1 system-ui,sans-serif;cursor:pointer}
.mdx .mdx-close:hover{background:rgba(255,255,255,.16)}
.mdx .mdx-close:focus-visible,.mdx .mdx-tab:focus-visible,.mdx a:focus-visible{outline:2px solid #53e0f2;outline-offset:2px}
.mdx .mdx-status{display:inline-flex;align-items:center;gap:6px;margin:0;padding:2px 9px;border-radius:999px;border:1px solid currentColor;  font:600 11px/1.4 system-ui,sans-serif}
.mdx .mdx-status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.mdx .t-confirmed{color:#5fd99a}
.mdx .t-partial{color:#ffc15a}
.mdx .t-failed{color:#ff8080}
.mdx .t-planned{color:#9db4cc}
.mdx .t-neutral{color:#9db4cc}
.mdx .t-passive{color:#9db4cc}
.mdx .mdx-tabs{flex:0 0 auto;display:flex;gap:2px;padding:0 10px;border-bottom:1px solid rgba(160,190,220,.16);overflow-x:auto}
.mdx .mdx-tab{flex:0 0 auto;min-height:36px;padding:0 11px;border:0;border-radius:0;transition:none;border-bottom:2px solid transparent;background:none;color:#9fb6cc;font:600 12.5px/1 system-ui,sans-serif;cursor:pointer}
.mdx .mdx-tab[aria-selected="true"]{color:#fff;border-bottom-color:#53e0f2}
.mdx .mdx-tab .n{margin-left:5px;color:#7c93aa;font-weight:500}
.mdx .mdx-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px;overscroll-behavior:contain}
.mdx .mdx-h{margin:18px 0 8px;font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#7ea2c4}
.mdx .mdx-h:first-child{margin-top:0}
.mdx .mdx-p{margin:0;font-size:13.5px;line-height:1.6;color:#d2e0ee}
.mdx .mdx-facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin:0 0 14px;border:1px solid rgba(160,190,220,.16);border-radius:8px;overflow:hidden;background:rgba(160,190,220,.12)}
.mdx .mdx-fact{padding:8px 10px;background:rgba(6,14,27,.96);min-width:0}
.mdx .mdx-fact dt{margin:0 0 3px;font:600 9.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7c93aa}
.mdx .mdx-fact dd{margin:0;font-size:13px;font-weight:550;overflow-wrap:anywhere}
.mdx .mdx-fact.missing dd{color:#ffc15a;font-weight:500}
.mdx .mdx-fact.wide{grid-column:1 / -1}
.mdx .mdx-note{margin:8px 0 0;font-size:12px;line-height:1.5;color:#92abc3}
.mdx .mdx-list{margin:0;padding-left:18px;font-size:13px;line-height:1.55;color:#d2e0ee}
.mdx .mdx-list li+li{margin-top:5px}
.mdx .mdx-callout{margin-top:16px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,193,90,.45);background:rgba(255,193,90,.07)}
.mdx .mdx-callout .mdx-h{margin-top:0;color:#ffc15a}
.mdx .mdx-card{margin:0 0 12px;padding:12px;border-radius:9px;border:1px solid rgba(160,190,220,.2);background:rgba(255,255,255,.03)}
.mdx .mdx-card h4{margin:0;font-size:14px;line-height:1.3}
.mdx .mdx-prov{margin:3px 0 0;font-size:12px;color:#8ea7bf}
.mdx .mdx-steps{display:flex;gap:4px;margin:10px 0 6px;padding:0;list-style:none}
.mdx .mdx-steps li{flex:1;padding-top:6px;border-top:3px solid rgba(160,190,220,.22);font-size:10.5px;color:#6f879f;text-align:center}
.mdx .mdx-steps li.on{border-top-color:currentColor;color:inherit}
.mdx .mdx-pstatus{font-size:12.5px;font-weight:650}
.mdx .mdx-pdetail{margin:2px 0 0;font-size:12px;color:#92abc3}
.mdx .mdx-row{margin:9px 0 0}
.mdx .mdx-row b{display:block;margin-bottom:2px;font:600 9.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7c93aa}
.mdx .mdx-row span{font-size:13px;line-height:1.55;color:#d2e0ee}
.mdx .mdx-row .none{color:#8ea7bf;font-style:italic}
.mdx .mdx-tl{margin:0;padding:0;list-style:none;border-left:2px solid rgba(83,224,242,.35)}
.mdx .mdx-tl li{position:relative;margin:0 0 14px 14px}
.mdx .mdx-tl li::before{content:"";position:absolute;left:-20px;top:5px;width:8px;height:8px;border-radius:50%;background:#53e0f2}
.mdx .mdx-tl strong{display:block;font-size:12.5px;color:#fff}
.mdx .mdx-tl span{font-size:13px;color:#d2e0ee}
.mdx .mdx-src{margin:0;padding:0;list-style:none}
.mdx .mdx-src li{margin:0 0 10px;font-size:13px;line-height:1.45}
.mdx .mdx-src a{color:#6ee6f6;text-decoration:underline;text-underline-offset:2px}
.mdx .mdx-src small{display:block;color:#7c93aa;margin-top:2px}
.mdx .mdx-tab:not([aria-selected="true"]):hover{color:#fff;border-bottom-color:rgba(83,224,242,.4)}
@media (max-width:640px){.mdx{left:8px;right:8px;width:auto;top:auto;bottom:8px;max-height:64%}}
@media (max-height:520px){.mdx{top:8px;bottom:8px}}
`;

function Overview({ mission }: { mission: Mission }) {
  const facts = keyFacts(mission);
  const loc = locationView(mission);
  return (
    <>
      <dl className="mdx-facts">
        {facts.map((f) => (
          <div key={f.label} className={`mdx-fact${f.missing ? ' missing' : ''}${f.label === 'Agency' || f.label === 'Site' ? ' wide' : ''}`}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mdx-p">{mission.summary}</p>
      <p className="mdx-note">{loc.markerNote}</p>
      {loc.coordinateNote !== undefined && <p className="mdx-note">{loc.coordinateNote}</p>}

      {mission.objectives.length > 0 && (
        <>
          <h4 className="mdx-h">Objectives</h4>
          <ul className="mdx-list">
            {mission.objectives.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {mission.achievements.length > 0 && (
        <>
          <h4 className="mdx-h">Achievements</h4>
          <ul className="mdx-list">
            {mission.achievements.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {mission.limitations.length > 0 && (
        <>
          <h4 className="mdx-h">Limitations</h4>
          <ul className="mdx-list">
            {mission.limitations.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {(mission.features?.length ?? 0) > 0 && (
        <>
          <h4 className="mdx-h">Surface features (same NASA table)</h4>
          <ul className="mdx-list">
            {(mission.features ?? []).map((f) => (
              <li key={f.name}>
                {f.name}: {Math.abs(f.coordinate.latDeg)}&deg; {f.coordinate.latDeg < 0 ? 'S' : 'N'}, {Math.abs(f.coordinate.lonDeg)}&deg;{' '}
                {f.coordinate.lonDeg < 0 ? 'W' : 'E'}
              </li>
            ))}
          </ul>
        </>
      )}
      {mission.unverified.length > 0 && (
        <div className="mdx-callout">
          <h4 className="mdx-h">Not verified</h4>
          <ul className="mdx-list">
            {mission.unverified.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Payloads({ mission }: { mission: Mission }) {
  return (
    <>
      <p className="mdx-note" style={{ margin: '0 0 12px' }}>
        Status words are kept apart: <b>planned</b> (not shown to have flown), <b>delivered</b>, <b>activated</b>, and <b>operated</b> (with a result only where a source documents one).
      </p>
      {mission.payloads.map(payloadView).map((p) => (
        <article className="mdx-card" key={p.id} aria-label={p.name}>
          <h4>{p.name}</h4>
          {p.provider !== undefined && <p className="mdx-prov">{p.provider}</p>}
          <div className={`t-${p.status.tone}`}>
            <ol className="mdx-steps" aria-label="Progress reached">
              {PAYLOAD_STEPS.map((label, i) => (
                <li key={label} className={i <= p.status.step ? 'on' : ''}>
                  {label}
                </li>
              ))}
            </ol>
            <div className="mdx-pstatus">{p.status.label}</div>
          </div>
          <p className="mdx-pdetail">{p.status.detail}</p>
          <div className="mdx-row">
            <b>Purpose</b>
            <span>{p.purpose}</span>
          </div>
          {p.objective !== undefined && (
            <div className="mdx-row">
              <b>Scientific objective</b>
              <span>{p.objective}</span>
            </div>
          )}
          <div className="mdx-row">
            <b>Reported result</b>
            <span className={p.hasResult ? '' : 'none'}>{p.result}</span>
          </div>
        </article>
      ))}
    </>
  );
}

function Timeline({ mission }: { mission: Mission }) {
  return (
    <ol className="mdx-tl">
      {timelineView(mission.timeline).map((t) => (
        <li key={`${t.when}-${t.event}`}>
          <strong>{t.when}</strong>
          <span>{t.event}</span>
          {t.note !== undefined && <div className="mdx-note">{t.note}</div>}
        </li>
      ))}
    </ol>
  );
}

function Sources({ mission }: { mission: Mission }) {
  return (
    <ul className="mdx-src">
      {sourceViews(mission.sources).map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>
          <small>{s.verifiedLabel}</small>
        </li>
      ))}
    </ul>
  );
}

export function MissionDossier({ mission, onClose }: { mission: Mission; onClose: () => void }) {
  const tabs: DossierTab[] = dossierTabs(mission);
  const [active, setActive] = useState<DossierTab['id']>('overview');
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape always closes. Listening on the document means it works wherever the focus is.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Opening a dossier puts focus on Close, so keyboard users can dismiss it at once.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const select = (id: DossierTab['id']): void => {
    setActive(id);
    if (bodyRef.current !== null) bodyRef.current.scrollTop = 0;
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next !== undefined) {
      select(next.id);
      document.getElementById(`mdx-tab-${next.id}`)?.focus();
    }
  };

  const tone = outcomeTone(mission);

  return (
    <section className="mdx" role="dialog" aria-modal="false" aria-labelledby="mdx-title">
      <style>{CSS}</style>
      <header className="mdx-head">
        <div className="mdx-top">
          <div style={{ minWidth: 0 }}>
            <p className="mdx-kicker">Mission dossier &middot; {CATEGORY_LABEL[mission.category]}</p>
            <h3 className="mdx-title" id="mdx-title">
              {mission.name}
            </h3>
          </div>
          <button ref={closeRef} type="button" className="mdx-close" onClick={onClose} aria-label="Close mission dossier" title="Close (Esc)">
            Close <span aria-hidden="true">&#x2715;</span>
          </button>
        </div>
        <div className="mdx-meta">
          <span className={`mdx-status t-${tone}`}>{OUTCOME_LABEL[mission.outcome]}</span>
          <span className="mdx-sub">
            {mission.operator}
            {mission.spacecraft !== undefined ? ` \u00B7 ${mission.spacecraft}` : ''}
          </span>
        </div>
      </header>

      <div className="mdx-tabs" role="tablist" aria-label="Dossier sections">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`mdx-tab-${t.id}`}
            type="button"
            role="tab"
            className="mdx-tab"
            aria-selected={active === t.id}
            aria-controls="mdx-panel"
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
            {t.count !== undefined && <span className="n">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="mdx-body" id="mdx-panel" role="tabpanel" aria-labelledby={`mdx-tab-${active}`} ref={bodyRef}>
        {active === 'overview' && <Overview mission={mission} />}
        {active === 'payloads' && <Payloads mission={mission} />}
        {active === 'timeline' && <Timeline mission={mission} />}
        {active === 'sources' && <Sources mission={mission} />}
      </div>

    </section>
  );
}
