import { describe, expect, it } from 'vitest';
import { assertModel } from '../src/analysis/pose';

/** Mirrors the real bundle: padding, the zip signature, then the payload. */
function bundle(size: number, padding: number[] = [0, 0]): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([...padding, 0x50, 0x4b, 0x03, 0x04]);
  return bytes;
}

describe('assertModel', () => {
  it('accepts a real .task bundle, including its leading padding bytes', () => {
    // pose_landmarker_lite.task begins 00 00 50 4B 03 04 …  (this was rejected once)
    expect(() => assertModel(bundle(5_777_746))).not.toThrow();
    expect(() => assertModel(bundle(5_777_746, []))).not.toThrow();
  });

  it('rejects the HTML page a dev server returns for a missing file', () => {
    const html = new TextEncoder().encode('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
    expect(() => assertModel(html)).toThrow(/Not a MediaPipe model/);
  });

  it('rejects a truncated download and a large non-zip file', () => {
    expect(() => assertModel(bundle(2_000))).toThrow();
    expect(() => assertModel(new Uint8Array(5_000_000))).toThrow();
  });
});
