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
  const collectMeshes = (root, predicate) => {
    const out = [];
    root.traverse((o) => {
      if (o?.isMesh && predicate(o)) out.push(o);
    });
    return out;
  };

  it('does not render stereo wedge/hash geometry by default', () => {
    const g = loadSDF(WEDGE_SDF, { useCylinders: false, showHydrogen: true });
    const cones = collectMeshes(g, (m) => m.geometry?.type === 'ConeGeometry');
    expect(cones.length).toBe(0);
    // Bond should still render (as a normal line segment)
    const hasLines = g.children.some((c) => c.isLineSegments);
    expect(hasLines).toBe(true);
  });

  it('renders solid wedge bonds as cones when enabled', () => {
    const g = loadSDF(WEDGE_SDF, { useCylinders: false, showHydrogen: true, renderStereoBonds: true });
    const cones = collectMeshes(g, (m) => m.geometry?.type === 'ConeGeometry');
    expect(cones.length).toBe(1);

    const cone = cones[0];
    expect(cone.userData?.role).toBe('bond');
    expect(cone.userData?.bond?.beginAtomIndex).toBe(0);
    expect(cone.userData?.bond?.endAtomIndex).toBe(1);
    expect(cone.userData?.bond?.stereo).toBe('up');

    const lr = g.userData?.loadResult;
    expect(lr?.mappings?.bondIndexToMesh?.[0]).toBe(cone);
    expect(lr?.mappings?.meshUuidToBondIndex?.get(cone.uuid)).toBe(0);
  });

  it('renders hashed wedge bonds as cylinder segments when enabled', () => {
    const g = loadSDF(HASH_SDF, { useCylinders: false, showHydrogen: true, renderStereoBonds: true });
    const cylinders = collectMeshes(g, (m) => m.geometry?.type === 'CylinderGeometry');
    expect(cylinders.length).toBeGreaterThan(0);
    cylinders.forEach((c) => {
      expect(c.userData?.role).toBe('bond');
      expect(c.userData?.bond?.beginAtomIndex).toBe(0);
      expect(c.userData?.bond?.endAtomIndex).toBe(1);
      expect(c.userData?.bond?.stereo).toBe('down');
    });

    const lr = g.userData?.loadResult;
    const hashed = lr?.mappings?.bondIndexToMesh?.[0];
    expect(hashed).toBeTruthy();
    expect(hashed?.isGroup).toBe(true);
    // Spot check: at least one hashed segment is in the uuid→bondIndex map
    expect(lr?.mappings?.meshUuidToBondIndex?.get(cylinders[0].uuid)).toBe(0);
  });
});
