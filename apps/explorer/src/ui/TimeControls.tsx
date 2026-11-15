import { useState } from 'react';
import type { FormEvent } from 'react';
import { formatLocal, formatUtc } from '../core/time.ts';
import { SPEED_PRESETS } from '../sim/simClock.ts';
import type { SimStore, UiSnapshot } from '../sim/simStore.ts';
import { describeOffset, describeSpeed } from '../sim/timeFormat.ts';

const HOUR = 3600;
const DAY = 86400;

interface Props {
  store: SimStore;
  ui: UiSnapshot;
  realNowMs: number;
}

export function TimeControls({ store, ui, realNowMs }: Props) {
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const c = ui.clock;
  const offsetSeconds = (c.simMs - realNowMs) / 1000;
  const live = c.playing && c.speed === 1 && Math.abs(offsetSeconds) < 2;
  const magnitude = Math.abs(c.speed);
  const isPreset = SPEED_PRESETS.some((p) => p.value === magnitude);
  const reverse = c.speed < 0;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    store.setFromUtcText(text.trim());
    if (store.getUiSnapshot().actionError === null) setText('');
  };

  return (
    <section className="time-controls" data-open={more} aria-label="Simulation time controls">
      <div className="td-main">
      <div className="clock-readout">
        <div className="label">Simulation time (UTC)</div>
        <div className="clock-value" aria-live="off">{formatUtc(c.simMs)}</div>
        <div className="clock-sub">Local: {formatLocal(c.simMs)}</div>
      </div>

      <div className="clock-status">
        <span className={live ? 'badge badge-live' : 'badge badge-sim'}>
          {live ? 'LIVE: following real time' : 'SIMULATED time'}
        </span>
        <div className="clock-sub">Gap from now: {describeOffset(offsetSeconds)}</div>
        <div className="clock-sub">Real time now (UTC): {formatUtc(realNowMs)}</div>
      </div>

      <div className="control-group" role="group" aria-label="Playback">
        <button type="button" onClick={store.jumpToPreviousPhase} aria-label="Jump to previous principal lunar phase" title="Previous principal phase">⏮ Phase</button>
        <button type="button" onClick={() => store.stepSeconds(-DAY)} aria-label="Step back one day">−1 d</button>
        <button type="button" onClick={() => store.stepSeconds(-HOUR)} aria-label="Step back one hour">−1 h</button>
        <button type="button" className="primary-btn" onClick={c.playing ? store.pause : store.play} aria-label={c.playing ? 'Pause' : 'Play'}>
          {c.playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={() => store.stepSeconds(HOUR)} aria-label="Step forward one hour">+1 h</button>
        <button type="button" onClick={() => store.stepSeconds(DAY)} aria-label="Step forward one day">+1 d</button>
        <button type="button" onClick={store.jumpToNextPhase} aria-label="Jump to next principal lunar phase" title="Next principal phase">Phase ⏭</button>
        <button type="button" onClick={store.goToPresent} aria-label="Return to the present and follow real time">Now</button>
      </div>

        <button
          type="button"
          className="td-toggle"
          aria-expanded={more}
          aria-controls="td-more"
          onClick={() => setMore((m) => !m)}
          title="Speed, reverse and go to a date"
        >
          {more ? 'Less ▾' : 'More ▴'}
        </button>
      </div>

      <div className="td-more" id="td-more">
      <div className="control-group" role="group" aria-label="Speed">
        <label>
          Speed{' '}
          <select
            value={isPreset ? String(magnitude) : 'custom'}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) store.setSpeed(reverse ? -v : v);
            }}
          >
            {!isPreset && <option value="custom">{describeSpeed(c.speed)}</option>}
            {SPEED_PRESETS.map((p) => (
              <option key={p.value} value={String(p.value)}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={reverse} onChange={() => store.setSpeed(-c.speed)} /> Reverse
        </label>
      </div>

      <form className="control-group" onSubmit={submit} aria-label="Go to a date and time">
        <label>
          Go to (UTC){' '}
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="2026-12-24 or 2026-12-24T18:30:00"
            size={30}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button type="submit">Go</button>
      </form>
      </div>

      {ui.actionError !== null && (
        <p className="message message-error" role="alert">{ui.actionError}</p>
      )}
      {c.notice !== null && (
        <p className="message message-note" role="status">
          {c.notice} <button type="button" className="link-btn" onClick={store.dismissMessages}>Dismiss</button>
        </p>
      )}
      {ui.computeError !== null && (
        <p className="message message-error" role="alert">Astronomy could not be computed for this time: {ui.computeError}</p>
      )}
    </section>
  );
}
