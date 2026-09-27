# Break It Down

Learn choreography one moment at a time.

Drop in a dance video and **on-device AI finds its key moments** — every hit, freeze and
change of direction. Then loop any section at any speed while you watch yourself in a
**live mirror** beside (or right under) the choreography.

Your video and your camera never leave your device. There is no backend and no account.

## Features

- **AI key moments** — pose tracking and beat detection mark the hits, freezes, big moves and
  section changes. A sensitivity slider re-picks instantly; you can add, remove and reset moments by hand.
- **Loop & speed** — loop any section (or any span of sections) from **0.25× to 2×**, pitch-preserved. A
  short *lead-in* runs the move up before each restart, and *practice mode* advances to the next
  section after N repeats.
- **Mirror** — your webcam as a true mirror, in four layouts: **Video**, **Split**, **Overlay**
  (choreography drawn semi-transparently over you, for matching poses) and **Mirror**. Flip the
  choreography so its left and right match yours.
- **Timeline** — a movement-intensity waveform with key-moment markers, beat ticks, hover
  previews, and trim-style loop handles that snap to key moments and beats.
- **Skeleton overlay** — see the tracked dancer drawn over the video.
- **Apple-style interface** — glass materials, system colours in light and dark, SF-style type,
  spring motion, and support for reduced motion, reduced transparency and increased contrast.
  Works on desktop, tablet and phone.

## Quick start

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, choose a video (MP4/H.264, MOV or WebM), and wait a few seconds
for the analysis. Use `?` in the app for keyboard shortcuts.

| Script                | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Dev server with hot reload                                      |
| `npm run build`       | Type-check and build to `dist/`                                 |
| `npm run preview`     | Serve the production build                                      |
| `npm test`            | Run the unit tests                                              |
| `npm run typecheck`   | TypeScript only                                                 |
| `npm run fetch-model` | Download the pose model for fully offline use (see below)       |

> **Camera access needs a secure context.** It works on `localhost` and on HTTPS, but not on a
> plain-HTTP LAN address. To try it on a phone, serve the build over HTTPS (for example with a
> tunnelling tool) or deploy it to any static host.

## How the analysis works

Everything runs in the browser. Nothing is uploaded.

```
video ──► sample 6–15 frames/s ─┬─► frame differencing ─────────────┐
                                └─► MediaPipe pose → joint speeds ──┼─► movement energy ─► candidates
soundtrack ─► spectral flux ─► tempo ─► beat tracking ──────────────┘        (hit · freeze · big move · section)
                                                                                     │
                                          sensitivity + beat snapping + your edits ──┴─► key moments
```

1. **Movement.** Frames are sampled deterministically by seeking a hidden copy of the video, so
   nothing depends on real-time playback. Movement is measured two ways: pixel differences between
   frames, and — when the model finds a dancer — the speeds of 13 body joints from
   [MediaPipe's pose landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker),
   measured in torso-lengths per second so camera distance doesn't matter. Frame differencing
   covers any video where no dancer is found.
2. **Rhythm.** The soundtrack is decoded, turned into a log-mel spectral-flux curve, and analysed
   for tempo and beats (an Ellis-style dynamic-programming tracker) in a Web Worker.
3. **Moments.** From the movement curve the detector finds *hits* (sharp stops), *freezes* (a stop
   that holds), *big moves* (peaks) and *section changes* (novelty on a self-similarity matrix). Each
   candidate gets a score; the sensitivity slider picks how many to keep, and confident beat grids
   nudge moments onto the beat.

Measured against a synthetic dancer with known hit times, moments land within one sample (≤ 67 ms)
of the true stop, and within ~7 ms once snapped to the beat.

### Pose model & offline use

The ~6 MB model is fetched the first time you analyse a video (from Google's public MediaPipe
bucket) and cached by the browser. To run with no network at all:

```bash
npm run fetch-model     # saves public/models/pose_landmarker_lite.task
```

The MediaPipe WASM runtime is copied out of `node_modules` on `npm install` and served locally.
If the model can't be loaded, the app carries on with frame differencing and says so.

## Project structure

```
src/
  analysis/    pure, tested analysis code: audio DSP, pose→motion, key-moment detection, pipeline
  media/       the hidden frame probe, thumbnails
  state/       zustand stores: preferences, session (video + analysis), player engine, webcam
  components/  React UI: toolbar, stage, timeline/dock, moments panel, import screen
  styles/      design tokens and component CSS (no CSS framework)
  lib/         small pure helpers: time formatting, loop/section maths, stage arrangement
tests/         vitest suite (analysis is checked against synthetic ground truth)
scripts/       copy-mediapipe.mjs (postinstall), fetch-model.mjs
```

## Browser support

Current Safari, Chrome, Edge and Firefox. A few notes:

- Videos must be in a format your browser can play. **MP4 (H.264) and WebM work everywhere**;
  HEVC/`.mov` from an iPhone plays in Safari but not in every other browser. If a file won't open, the
  app says so.
- Analysis time is roughly proportional to length (about 8 s for a 13 s clip in testing). Videos over
  ~300 MB skip the audio/beat step to avoid holding the whole file in memory.
- The GPU delegate is used for pose tracking when available, with an automatic CPU fallback.

## Troubleshooting

- **Hot reload seems stale.** File watching can be unreliable inside OneDrive- or Dropbox-synced
  folders. Restart `npm run dev`, or keep the project outside a synced folder (a `node_modules`
  directory also generates a lot of sync traffic).
- **"Camera access is blocked."** Allow the camera for the site from the lock icon in your address bar,
  then press *Try Again*.
- **No key moments found.** Raise the sensitivity. Very static or heavily edited videos have little
  movement to find; you can always add moments yourself with `A`.

## Credits

The base application — architecture, analysis pipeline, UI and tests — was written by
[Claude](https://claude.com/claude-code) in a single session on 2026-09-26, with no human-written
code (commit `da00bad`, "base version, needs verification"). Everything since has been iterated on
by the team.

## License

Personal project. MediaPipe is licensed under Apache 2.0; Inter is licensed under the SIL Open Font License.
