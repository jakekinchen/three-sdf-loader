import fs from 'fs';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadSDF } from '../src/index';

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
    const group = loadSDF(WATER_SDF, { showHydrogen: true, useCylinders: false });
    const spheres = group.children.filter((c) => c.type === 'Mesh');
    expect(spheres.length).toBe(3);
    const hasLines = group.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLines).toBe(true);
  });

  it('attaches atom data and properties by default', () => {
    const group = loadSDF(WATER_SDF, { showHydrogen: true, useCylinders: false });
    expect(group.userData).toHaveProperty('properties');
    const sphere = group.children.find((c) => c.type === 'Mesh');
    expect(sphere.userData).toHaveProperty('atom');
  });

  it('omits attachments when disabled', () => {
    const group = loadSDF(WATER_SDF, {
      attachAtomData: false,
      attachProperties: false,
      showHydrogen: true,
      useCylinders: false,
    });
    const sphere = group.children.find((c) => c.type === 'Mesh');
    expect(sphere.userData.atom).toBeUndefined();
    expect(group.userData.properties).toBeUndefined();
  });

  it('renders duplicate segments for double bonds', () => {
    const ETHENE_SDF = `ethene
      Demo

      2  1  0  0  0  0              0 V2000
        0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
        1.3300    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
      1  2  2  0
    M  END`;

    const g = loadSDF(ETHENE_SDF, { renderMultipleBonds: true, useCylinders: false });
    const line = g.children.find((c) => c.type === 'LineSegments');
    const vertCount = line.geometry.getAttribute('position').count;
    expect(vertCount).toBe(4); // two segments → 4 vertices
  });

  it('creates cylinder meshes when useCylinders=true', () => {
    const g = loadSDF(WATER_SDF, { showHydrogen: true, useCylinders: true });
    const hasCylinder = g.children.some((c) => c.isMesh && c.geometry?.type === 'CylinderGeometry');
    expect(hasCylinder).toBe(true);
  });

  it('creates line segments when useCylinders=false', () => {
    const g = loadSDF(WATER_SDF, { showHydrogen: true, useCylinders: false });
    const hasLine = g.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLine).toBe(true);
  });

  it('infers metal–ligand coordination bonds by default (transition metals only)', () => {
    const SIMPLE_FE_C = `fe-c
      Example

      2  0  0  0  0  0              0 V2000
        0.0000    0.0000    0.0000 Fe  0  0  0  0  0  0  0  0  0  0  0  0
        1.9000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    M  END
    $$$$`;

    const g = loadSDF(SIMPLE_FE_C, { useCylinders: false, layout: '3d' });
    const hasAnyLink = g.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasAnyLink).toBe(true);
  });

  it('respects relFactor for cutoff scaling', () => {
    const FLAT_FE_C2 = `fe-c2
      Example

      2  0  0  0  0  0              0 V2000
        0.0000    0.0000    0.0000 Fe  0  0  0  0  0  0  0  0  0  0  0  0
        4.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    M  END
    $$$$`;

    // With default relFactor (1.4) a bond should be inferred (threshold 5.6)
    const gDefault = loadSDF(FLAT_FE_C2, { useCylinders: false, layout: '3d' });
    const hasDefault = gDefault.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasDefault).toBe(true);

    // Lowering relFactor below 1 should remove the bond (threshold falls to 3)
    const gLow = loadSDF(FLAT_FE_C2, { useCylinders: false, relFactor: 0.5, layout: '3d' });
    const hasLow = gLow.children.some((c) => c.type === 'LineSegments' || c.type === 'Line');
    expect(hasLow).toBe(false);
  });

  it('should parse molecule properties', () => {
    const sdfText = fs.readFileSync('test/bigcoords.sdf', 'utf8');
    const group = loadSDF(sdfText, { showHydrogen: false });
    expect(group.children.length).toBe(3); // 2x Boron, 1x Bond (dashed or solid)
  });
}); 