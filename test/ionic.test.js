/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index.js';

// Simple Na+ ... Cl- pair within typical cutoff distance
const NACL_IONIC = `nacl-ionic
  Demo

  2  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 Na  0  0  0  0  0  0  0  0  0  0  0  0
    2.5000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
M  CHG  2   1   1   2  -1
M  END
$$$$`;

describe('ionic systems', () => {
  it('does not show coordination link for opposite-charge ion pairs by default', () => {
    const g = loadSDF(NACL_IONIC, { useCylinders: false, layout: '3d' });
    const hasLink = g.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLink).toBe(false);
  });

  it('can opt-in to show link via options', () => {
    const g = loadSDF(NACL_IONIC, {
      useCylinders: false,
      layout: '3d',
      coordinationMode: 'all',
      suppressOppositeChargeCoordination: false,
    });
    const hasLink = g.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLink).toBe(true);
  });
});


