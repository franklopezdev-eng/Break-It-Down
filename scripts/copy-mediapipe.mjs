// Copies the MediaPipe WASM runtime out of node_modules into public/ so the app
// can self-host it (no third-party CDN at runtime for the ~20 MB of WASM).
//
// Runs automatically after `npm install`. It is safe to run repeatedly and it
// never fails the install: a missing source just prints a warning.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(source)) {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision is not installed yet; skipping.');
  process.exit(0);
}

// The app loads the classic (non-module) runtime, in SIMD and no-SIMD flavours. The
// "module" variant would add ~11 MB to every deploy for nothing.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) {
  if (file.includes('_module_')) continue;
  cpSync(join(source, file), join(target, file));
}

const files = readdirSync(target);
console.log(`[copy-mediapipe] copied ${files.length} files to public/mediapipe/wasm`);
