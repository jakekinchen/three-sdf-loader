/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index.js';

const WEDGE_SDF = `wedge
  demo

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  1
M  END`;

const HASH_SDF = `hash
  demo

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  6
M  END`;

describe('stereochemistry rendering', () => {
  it('renders solid wedge bonds as cones', () => {
    const g = loadSDF(WEDGE_SDF, { useCylinders: false });
    const hasCone = g.children.some((c) => c.isMesh && c.geometry.type === 'ConeGeometry');
    expect(hasCone).toBe(true);
  });

  it('renders hashed wedge bonds as cylinder segments', () => {
    const g = loadSDF(HASH_SDF, { useCylinders: false });
    const cylCount = g.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry').length;
    expect(cylCount).toBeGreaterThan(0);
  });
});