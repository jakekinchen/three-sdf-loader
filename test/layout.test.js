/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index.js';

const PLANAR_C_C = `planar
  demo

  2  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.9000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$`;

describe('layout auto‑detection', () => {
  it('does NOT infer coordination bonds for purely 2‑D molfile', () => {
    const g = loadSDF(PLANAR_C_C, { useCylinders: false });
    const hasLine = g.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLine).toBe(false);
  });
});