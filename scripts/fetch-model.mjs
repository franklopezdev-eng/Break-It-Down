// Downloads MediaPipe's pose model into public/models/ so Break It Down can run with
// no network access at all (the app looks in /models/ before falling back to Google).
//
//   npm run fetch-model
//
// Override the source with MODEL_URL, e.g. to use the more accurate "full" model:
//   MODEL_URL=https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task npm run fetch-model
// (the file must still be saved as pose_landmarker_lite.task, which is the name the app loads).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const url = process.env.MODEL_URL ?? DEFAULT_URL;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = join(root, 'public', 'models');
const target = join(targetDir, 'pose_landmarker_lite.task');

function fail(message) {
  console.error(`[fetch-model] ${message}`);
  process.exit(1);
}

/** Same rule as the app: a multi-megabyte zip (with padding ahead of the "PK\x03\x04" signature). */
function looksLikeModel(bytes) {
  if (bytes.length < 100_000) return false;
  for (let i = 0; i < Math.min(bytes.length - 3, 64); i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) return true;
  }
  return false;
}

console.log(`[fetch-model] downloading ${url}`);
let response;
try {
  response = await fetch(url);
} catch (error) {
  fail(`could not reach the server (${error.message}).`);
}
if (!response.ok) fail(`the server answered ${response.status} ${response.statusText}.`);

const bytes = new Uint8Array(await response.arrayBuffer());
if (!looksLikeModel(bytes)) fail('the download is not a MediaPipe model file; nothing was written.');

mkdirSync(targetDir, { recursive: true });
writeFileSync(target, bytes);
console.log(`[fetch-model] saved ${(bytes.length / 1024 / 1024).toFixed(1)} MB to public/models/pose_landmarker_lite.task`);
