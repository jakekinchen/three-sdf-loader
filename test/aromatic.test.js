/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index.js';

const AROM_SDF = `arom
  demo

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  4  0
M  END`;

describe('aromatic dashed rendering', () => {
  it('creates a dashed Line for order‑4 bonds', () => {
    const g = loadSDF(AROM_SDF, { useCylinders: false });
    const hasDashed = g.children.some(
      (c) => c.type === 'Line' && c.material?.type === 'LineDashedMaterial'
    );
    expect(hasDashed).toBe(true);
  });
});