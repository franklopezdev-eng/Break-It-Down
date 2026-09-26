import { Minus, Plus, Repeat, Settings2, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react';
import { formatRate, formatTime } from '../lib/format';
import { player, usePlayer } from '../state/player';
import { RATE_MAX, RATE_MIN, RATE_PRESETS, RATE_STEP, usePrefs } from '../state/prefs';
import type { LoadedVideo } from '../state/session';
import { PauseFill, PlayFill, SkipBackFill, SkipForwardFill } from './icons';
import { Timeline } from './Timeline';
import { IconButton, Popover, SegmentedControl, Slider, Stepper, ToggleRow } from './ui';

export function Dock({ video }: { video: LoadedVideo }) {
  return (
    <div className="dock glass" role="region" aria-label="Playback controls">
      <Timeline video={video} />
      <div className="dock__controls">
        <Transport />
        <LoopControl />
        <SpeedControl />
        <MuteButton />
      </div>
    </div>
  );
}

function Transport() {
  const playing = usePlayer((s) => s.playing);
  return (
    <div className="transport" role="group" aria-label="Transport">
      <IconButton label="Previous key moment (←)" tone="plain" onClick={() => player.previousKeyPoint()}>
        <SkipBackFill size={22} />
      </IconButton>
      <IconButton label="Back one frame (,)" tone="plain" size="sm" onClick={() => player.step(-1)}>
        <StepBack size={18} strokeWidth={2} />
      </IconButton>
      <IconButton
        label={playing ? 'Pause (Space)' : 'Play (Space)'}
        tone="primary"
        size="lg"
        className="transport__play"
        onClick={() => player.toggle()}
      >
        {playing ? <PauseFill size={28} /> : <PlayFill size={28} />}
      </IconButton>
      <IconButton label="Forward one frame (.)" tone="plain" size="sm" onClick={() => player.step(1)}>
        <StepForward size={18} strokeWidth={2} />
      </IconButton>
      <IconButton label="Next key moment (→)" tone="plain" onClick={() => player.nextKeyPoint()}>
        <SkipForwardFill size={22} />
      </IconButton>
    </div>
  );
}

// ── Looping ──────────────────────────────────────────────────────────────────

function LoopControl() {
  const loop = usePlayer((s) => s.loop);
  const pass = usePlayer((s) => s.pass);
  const autoAdvance = usePrefs((s) => s.autoAdvance);
  const repeats = usePrefs((s) => s.repeats);

  return (
    <div className="loop">
      <button
        type="button"
        className="chip"
        aria-pressed={loop.enabled}
        title="Loop this section (L)"
        onClick={() => player.toggleLoop()}
      >
        <Repeat size={16} strokeWidth={2.3} />
        Loop
        {loop.enabled && autoAdvance && (
          <span className="chip__badge tabular">
            {Math.min(pass + 1, repeats)}/{repeats}
          </span>
        )}
      </button>
      {loop.enabled && (
        <span className="loop__range tabular" aria-label="Loop range">
          {formatTime(loop.start, 1)} – {formatTime(loop.end, 1)}
        </span>
      )}
      <Popover
        label="Practice settings"
        align="start"
        placement="top"
        trigger={({ toggle, aria }) => (
          <IconButton label="Practice settings" size="sm" tone="glass" onClick={toggle} {...aria}>
            <Settings2 size={16} strokeWidth={2.1} />
          </IconButton>
        )}
      >
        <PracticeSettings />
      </Popover>
    </div>
  );
}

const LEAD_IN_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 0.25, label: '¼ s' },
  { value: 0.5, label: '½ s' },
  { value: 1, label: '1 s' },
] as const;

function PracticeSettings() {
  const autoAdvance = usePrefs((s) => s.autoAdvance);
  const repeats = usePrefs((s) => s.repeats);
  const leadIn = usePrefs((s) => s.leadIn);
  const set = usePrefs((s) => s.set);

  return (
    <>
      <div className="popover__heading">Practice</div>
      <ToggleRow
        title="Advance automatically"
        hint="After the repeats below, the loop moves on to the next section."
        checked={autoAdvance}
        onChange={(v) => set('autoAdvance', v)}
      />
      <div className="setting" style={{ opacity: autoAdvance ? 1 : 0.45 }}>
        <div className="setting__text">
          <div className="setting__title">Repeats per section</div>
          <div className="setting__hint">Passes before moving on</div>
        </div>
        <Stepper value={repeats} min={1} max={16} onChange={(v) => set('repeats', v)} label="repeats" />
      </div>
      <div className="setting setting--stack">
        <div className="setting__text">
          <div className="setting__title">Lead-in</div>
          <div className="setting__hint">A short run-up before each loop restarts, so you see the move coming.</div>
        </div>
        <SegmentedControl
          block
          label="Lead-in"
          value={LEAD_IN_OPTIONS.find((o) => o.value === leadIn)?.value ?? 0.25}
          onChange={(v) => set('leadIn', v)}
          options={LEAD_IN_OPTIONS}
        />
      </div>
    </>
  );
}

// ── Speed ────────────────────────────────────────────────────────────────────

function SpeedControl() {
  const rate = usePrefs((s) => s.rate);
  return (
    <div className="speed">
      <div className="speed__top">
        <span className="speed__label">Speed</span>
        <output className="speed__value tabular" aria-live="polite">
          {formatRate(rate)}
        </output>
        <div className="speed__presets" role="group" aria-label="Speed presets">
          {RATE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip chip--tint chip--compact"
              aria-pressed={Math.abs(rate - preset) < 0.001}
              onClick={() => player.setRate(preset)}
            >
              {formatRate(preset)}
            </button>
          ))}
        </div>
      </div>
      <div className="speed__row">
        <IconButton label="Slower ([)" size="sm" tone="plain" onClick={() => player.setRate(rate - RATE_STEP)}>
          <Minus size={16} strokeWidth={2.4} />
        </IconButton>
        <Slider
          label="Playback speed"
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          value={rate}
          valueText={formatRate(rate)}
          onChange={(v) => player.setRate(v)}
        />
        <IconButton label="Faster (])" size="sm" tone="plain" onClick={() => player.setRate(rate + RATE_STEP)}>
          <Plus size={16} strokeWidth={2.4} />
        </IconButton>
      </div>
    </div>
  );
}

function MuteButton() {
  const muted = usePrefs((s) => s.muted);
  return (
    <IconButton
      label={muted ? 'Unmute (M)' : 'Mute (M)'}
      tone="plain"
      aria-pressed={muted}
      onClick={() => player.toggleMute()}
      className="dock__mute"
    >
      {muted ? <VolumeX size={20} strokeWidth={2} /> : <Volume2 size={20} strokeWidth={2} />}
    </IconButton>
  );
}
