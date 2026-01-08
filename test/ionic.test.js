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

// Same ions, but depicted too close together for disc/spacefill rendering in 2D
const NACL_IONIC_CLOSE_2D = `nacl-ionic-close-2d
  Demo

  2  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 Na  0  0  0  0  0  0  0  0  0  0  0  0
    0.2000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
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

  it('keeps unbonded ions visible by default (no hiding)', () => {
    const g = loadSDF(NACL_IONIC, { useCylinders: false, layout: '3d' });
    const atomMeshes = g.children.filter((c) => c.isMesh);
    // two atoms placed; no bonds
    expect(atomMeshes.length).toBe(2);
  });

  it('can hide isolated ions when hideIsolatedAtoms=true', () => {
    const g = loadSDF(NACL_IONIC, {
      useCylinders: false,
      layout: '3d',
      hideIsolatedAtoms: true,
      isolatedAtomCutoff: 2.8, // less than 2.5? No, set above to hide; set to 2.0 to keep
    });
    const atomMeshes = g.children.filter((c) => c.isMesh);
    // distance is 2.5; cutoff 2.8 → both atoms considered near → not hidden
    expect(atomMeshes.length).toBe(2);
    const g2 = loadSDF(NACL_IONIC, {
      useCylinders: false,
      layout: '3d',
      hideIsolatedAtoms: true,
      isolatedAtomCutoff: 2.4, // below 2.5 → should hide both isolated ions
    });
    const atomMeshes2 = g2.children.filter((c) => c.isMesh);
    expect(atomMeshes2.length).toBe(0);
  });

  it('can separate isolated ions in 2D to avoid overlap when enabled', () => {
    const gDefault = loadSDF(NACL_IONIC_CLOSE_2D, { useCylinders: false, layout: 'auto' });
    const atomMeshes = gDefault.children.filter((c) => c.isMesh);
    const na0 = atomMeshes.find((m) => m.userData?.atom?.element === 'NA');
    const cl0 = atomMeshes.find((m) => m.userData?.atom?.element === 'CL');
    expect(na0).toBeTruthy();
    expect(cl0).toBeTruthy();
    const d0 = na0.position.distanceTo(cl0.position);
    expect(d0).toBeLessThan(0.3);

    const gSep = loadSDF(NACL_IONIC_CLOSE_2D, {
      useCylinders: false,
      layout: 'auto',
      separateIsolatedIons2D: true,
      isolatedIons2DClearanceFrac: 0.25,
    });
    const atomMeshes2 = gSep.children.filter((c) => c.isMesh);
    const na1 = atomMeshes2.find((m) => m.userData?.atom?.element === 'NA');
    const cl1 = atomMeshes2.find((m) => m.userData?.atom?.element === 'CL');
    expect(na1).toBeTruthy();
    expect(cl1).toBeTruthy();
    const d1 = na1.position.distanceTo(cl1.position);
    // Default radii: Na=0.6, Cl=0.4; require >= (0.6 + 0.4) * (1 + 0.25) = 1.25
    expect(d1).toBeGreaterThanOrEqual(1.25 - 1e-3);
  });
});

