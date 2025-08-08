import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index';

const ETHANOL_SDF = `ethanol
  Test

  9  8  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5400    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0900    1.2300    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5400    1.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5400   -1.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.0900   -1.2300    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1000    1.8000    0.8900 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1000    1.8000   -0.8900 H   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    1.2000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
  1  4  1  0
  1  5  1  0
  2  6  1  0
  3  7  1  0
  3  8  1  0
  3  9  1  0
M  END`;

describe('Picking & metadata', () => {
  it('exposes stable metadata and mappings (non-instanced)', () => {
    const group = loadSDF(ETHANOL_SDF, {
      showHydrogen: true,
      useCylinders: false,
    });
    const res = group.userData.loadResult;
    expect(res).toBeDefined();
    expect(res.metadata.atomCount).toBe(9);
    expect(res.metadata.bondCount).toBe(8);
    expect(res.chemistry.atoms[0].element).toBe('C');
    expect(res.chemistry.atoms[2].element).toBe('O');

    const meshes = group.children.filter((c) => c.isMesh);
    // map meshes to atom indices via userData and mapping
    meshes.forEach((m) => {
      expect(m.userData.role).toBe('atom');
      const idx = res.mappings.meshUuidToAtomIndex.get(m.uuid);
      expect(typeof idx).toBe('number');
      expect(res.mappings.atomIndexToMesh[idx]).toBe(m);
    });
  });

  it('exposes instanced mesh mapping when instancing=true', () => {
    const group = loadSDF(ETHANOL_SDF, {
      includeHydrogens: true,
      instancing: true,
      useCylinders: false,
    });
    const res = group.userData.loadResult;
    expect(res.mappings.instancedAtoms).toBeDefined();
    const { mesh, instanceToAtomIndex } = res.mappings.instancedAtoms;
    expect(mesh).toBeDefined();
    // Only visible atoms are instanced (with hydrogens included here)
    expect(instanceToAtomIndex.length).toBeGreaterThan(0);
  });
});
