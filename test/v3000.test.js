/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parseSDF, loadSDF } from '../src/index.js';

const V3_SDF = `v3
  demo
  0  0  0  0  0  0              0 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 2 1 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0 0 0 0
M  V30 2 C 1.5 0 0 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2
M  V30 END BOND
M  V30 END CTAB
M  END`;

describe('V3000 parser', () => {
  it('parses atoms and bonds', () => {
    const mol = parseSDF(V3_SDF);
    expect(mol.atoms.length).toBe(2);
    expect(mol.bonds.length).toBe(1);
  });

  it('renders a THREE.Group from V3000 input', () => {
    const g = loadSDF(V3_SDF, { useCylinders: false });
    expect(g).toBeInstanceOf(THREE.Group);
  });
});