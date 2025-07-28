/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index.js';

const BHB_SDF = `bhb
  demo

  3  2  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.7000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2000    0.7000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  3  2  1  0
M  END`;

describe('bridging bond inference', () => {
  it('creates dashed Line for inferred B–B bridge', () => {
    const g = loadSDF(BHB_SDF, { useCylinders: false });
    const hasDashed = g.children.some(
      (c) => c.type === 'Line' && c.material?.type === 'LineDashedMaterial'
    );
    expect(hasDashed).toBe(true);
  });
});