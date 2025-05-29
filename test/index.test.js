/* eslint-disable import/extensions */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadSDF } from '../src/index.js';

// Minimal water molecule in SDF (V2000)
const WATER_SDF = `water
  ChemDraw

  3  2  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7570    0.5860    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7570    0.5860    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
M  END
$$$$`;

describe('loadSDF', () => {
  it('returns a THREE.Group instance', () => {
    const group = loadSDF(WATER_SDF);
    expect(group).toBeInstanceOf(THREE.Group);
  });

  it('omits hydrogens by default', () => {
    const group = loadSDF(WATER_SDF);
    const spheres = group.children.filter((c) => c.type === 'Mesh');
    expect(spheres.length).toBe(1); // only oxygen
  });

  it('includes hydrogens when showHydrogen=true', () => {
    const group = loadSDF(WATER_SDF, { showHydrogen: true });
    const spheres = group.children.filter((c) => c.type === 'Mesh');
    expect(spheres.length).toBe(3);
    const hasLines = group.children.some((c) => c.type === 'LineSegments');
    expect(hasLines).toBe(true);
  });

  it('attaches atom data and properties by default', () => {
    const group = loadSDF(WATER_SDF, { showHydrogen: true });
    expect(group.userData).toHaveProperty('properties');
    const sphere = group.children.find((c) => c.type === 'Mesh');
    expect(sphere.userData).toHaveProperty('atom');
  });

  it('omits attachments when disabled', () => {
    const group = loadSDF(WATER_SDF, {
      attachAtomData: false,
      attachProperties: false,
      showHydrogen: true,
    });
    const sphere = group.children.find((c) => c.type === 'Mesh');
    expect(sphere.userData.atom).toBeUndefined();
    expect(group.userData.properties).toBeUndefined();
  });
}); 