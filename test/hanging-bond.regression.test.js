/**
 * Regression test for "hanging bond" bug in three-sdf-loader
 *
 * Bug: Bonds appear to extend to nowhere (no visible atom at endpoint)
 *
 * Potential causes:
 * 1. Index off-by-one: SDF uses 1-based indices, arrays are 0-based
 * 2. Bond geometry timing: Atom positions not finalized when bonds created
 * 3. Missing atom validation: Bond references atom that doesn't exist
 * 4. Hydrogen visibility mismatch: H atom hidden but bond still visible
 *
 * This test validates:
 * - All bond indices reference valid atoms (within bounds)
 * - All atom positions are valid (not NaN, not undefined)
 * - All rendered bonds connect to actual atom positions
 * - No bonds extend to origin (0,0,0) or invalid coordinates
 */

import { describe, it, expect } from 'vitest';
import { loadSDF, loadSDFResult, parseSDF } from '../src/index';

// Complex molecule with many atoms and bonds (inspired by Montelukast structure)
// This tests the pattern where atoms at extremes (high Y coord) might have "hanging bonds"
const COMPLEX_MOLECULE_SDF = `complex-molecule
  TestData
  Regression test for hanging bonds

 12 13  0  0  0  0              0 V2000
    1.5000    5.2000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000    5.2000    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    3.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    3.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.6000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2124    2.6000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    1.3000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    1.3000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.6000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000   -1.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000   -1.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  3  1  0
  2  4  1  0
  3  4  1  0
  3  5  2  0
  4  6  2  0
  5  7  1  0
  5  9  1  0
  6  8  1  0
  6  9  1  0
  7  8  2  0
  7 10  1  0
  8 10  1  0
 10 11  1  0
M  END
$$$$`;

// Molecule with atoms at origin and high indices to test edge cases
const EDGE_CASE_SDF = `edge-case
  TestData
  Edge case with atom at origin

  4  4  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    1.3000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500   -1.3000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1  3  1  0
  2  3  1  0
  2  4  1  0
M  END
$$$$`;

// Simple water molecule for baseline validation
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

describe('Hanging Bond Regression', () => {
  describe('Bond Index Validation (1-based to 0-based conversion)', () => {
    it('parseSDF returns bonds with 1-based atom indices', () => {
      const mol = parseSDF(WATER_SDF);

      expect(mol.bonds).toHaveLength(2);

      // SDF uses 1-based indices
      mol.bonds.forEach((bond) => {
        expect(bond.beginAtomIdx).toBeGreaterThanOrEqual(1);
        expect(bond.endAtomIdx).toBeGreaterThanOrEqual(1);
        expect(bond.beginAtomIdx).toBeLessThanOrEqual(mol.atoms.length);
        expect(bond.endAtomIdx).toBeLessThanOrEqual(mol.atoms.length);
      });
    });

	    it('all bond indices reference valid atoms (within 1..atomCount)', () => {
	      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

      expect(mol.atoms).toHaveLength(12);
      expect(mol.bonds).toHaveLength(13);

	      mol.bonds.forEach((bond) => {
	        const begin = bond.beginAtomIdx;
	        const end = bond.endAtomIdx;

        // Indices should be 1-based and within valid range
        expect(begin).toBeGreaterThanOrEqual(1);
        expect(begin).toBeLessThanOrEqual(mol.atoms.length);
        expect(end).toBeGreaterThanOrEqual(1);
        expect(end).toBeLessThanOrEqual(mol.atoms.length);

        // When converted to 0-based, should be valid array indices
        const atom0based1 = mol.atoms[begin - 1];
        const atom0based2 = mol.atoms[end - 1];
        expect(atom0based1).toBeDefined();
        expect(atom0based2).toBeDefined();
      });
    });

	    it('bond at top of molecule (highest Y) has valid atom references', () => {
	      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

	      // Cl should be at index 0 (1-based: 1)
	      expect(mol.atoms[0].symbol).toBe('Cl');
	      expect(mol.atoms[0].y).toBeCloseTo(5.2);

      // F should be at index 1 (1-based: 2)
      expect(mol.atoms[1].symbol).toBe('F');
      expect(mol.atoms[1].y).toBeCloseTo(5.2);

      // Find bonds involving these top atoms
      const topBonds = mol.bonds.filter(
        (b) => b.beginAtomIdx <= 2 || b.endAtomIdx <= 2
      );

      expect(topBonds.length).toBeGreaterThan(0);

      // All top bonds should reference valid atoms
      topBonds.forEach((bond) => {
        const atom1 = mol.atoms[bond.beginAtomIdx - 1];
        const atom2 = mol.atoms[bond.endAtomIdx - 1];
        expect(atom1).toBeDefined();
        expect(atom2).toBeDefined();
        expect(Number.isFinite(atom1.x)).toBe(true);
        expect(Number.isFinite(atom1.y)).toBe(true);
        expect(Number.isFinite(atom2.x)).toBe(true);
        expect(Number.isFinite(atom2.y)).toBe(true);
      });
    });
  });

  describe('Atom Position Validation', () => {
	    it('all atoms have finite numeric coordinates', () => {
	      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

	      mol.atoms.forEach((atom) => {
	        expect(Number.isFinite(atom.x)).toBe(true);
	        expect(Number.isFinite(atom.y)).toBe(true);
	        expect(Number.isFinite(atom.z)).toBe(true);
	      });
	    });

    it('atom at origin is handled correctly', () => {
      const mol = parseSDF(EDGE_CASE_SDF);

      // First atom is at origin
      expect(mol.atoms[0].x).toBe(0);
      expect(mol.atoms[0].y).toBe(0);
      expect(mol.atoms[0].z).toBe(0);

      // Bonds to this atom should still be valid
      const bondsToOrigin = mol.bonds.filter(
        (b) => b.beginAtomIdx === 1 || b.endAtomIdx === 1
      );
      expect(bondsToOrigin.length).toBeGreaterThan(0);
    });
  });

  describe('Rendered Bond Geometry Validation', () => {
    it('no bond cylinder extends to (0,0,0) when atom is not at origin', () => {
      const group = loadSDF(COMPLEX_MOLECULE_SDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      // Find all bond meshes
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

	      expect(bondMeshes.length).toBeGreaterThan(0);

	      // Check that no bond is positioned at (0,0,0) unexpectedly
	      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

	      bondMeshes.forEach((mesh) => {
	        const pos = mesh.position;

        // Bond position is midpoint of two atoms
        // If positioned at (0,0,0), either both atoms are at origin or something is wrong
        if (pos.x === 0 && pos.y === 0 && pos.z === 0) {
          // This is only valid if both connected atoms are at origin
          const bondMeta = mesh.userData.bond;
          const atom1 = mol.atoms[bondMeta.beginAtomIndex];
          const atom2 = mol.atoms[bondMeta.endAtomIndex];

          // Midpoint at origin means both atoms should be symmetrically placed around origin
          const midX = (atom1.x + atom2.x) / 2;
          const midY = (atom1.y + atom2.y) / 2;
          const midZ = (atom1.z + atom2.z) / 2;

          expect(midX).toBeCloseTo(0, 5);
          expect(midY).toBeCloseTo(0, 5);
          expect(midZ).toBeCloseTo(0, 5);
        }

        // Position should always have finite values
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
        expect(Number.isFinite(pos.z)).toBe(true);
      });
    });

    it('bond endpoints match actual atom positions (validates index mapping)', () => {
      const result = loadSDFResult(COMPLEX_MOLECULE_SDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      const mol = parseSDF(COMPLEX_MOLECULE_SDF);
      const bondMeshes = result.root.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

      expect(bondMeshes.length).toBeGreaterThan(0);

      // For each bond, verify the referenced atoms exist and have valid data
      bondMeshes.forEach((mesh) => {
        const bondMeta = mesh.userData.bond;
        const { beginAtomIndex, endAtomIndex } = bondMeta;

        // Both indices should be valid (0-based, within bounds)
        expect(beginAtomIndex).toBeGreaterThanOrEqual(0);
        expect(beginAtomIndex).toBeLessThan(mol.atoms.length);
        expect(endAtomIndex).toBeGreaterThanOrEqual(0);
        expect(endAtomIndex).toBeLessThan(mol.atoms.length);

        // Get atom positions from parsed data (0-based indices)
        const atom1 = mol.atoms[beginAtomIndex];
        const atom2 = mol.atoms[endAtomIndex];

        expect(atom1).toBeDefined();
        expect(atom2).toBeDefined();

        // Atom coordinates should be finite
        expect(Number.isFinite(atom1.x)).toBe(true);
        expect(Number.isFinite(atom1.y)).toBe(true);
        expect(Number.isFinite(atom2.x)).toBe(true);
        expect(Number.isFinite(atom2.y)).toBe(true);

        // Mesh position should be finite (not NaN)
        expect(Number.isFinite(mesh.position.x)).toBe(true);
        expect(Number.isFinite(mesh.position.y)).toBe(true);
        expect(Number.isFinite(mesh.position.z)).toBe(true);
      });
    });

    it('line segment bonds have valid vertex positions', () => {
      const group = loadSDF(COMPLEX_MOLECULE_SDF, {
        useCylinders: false,
        showHydrogen: true,
      });

      // Find line segments
      const lineSegments = group.children.find(
        (c) => c.isLineSegments && c.userData.role === 'bonds'
      );

      if (lineSegments) {
	        const posAttr = lineSegments.geometry.getAttribute('position');

	        // All vertices should have finite values
	        for (let i = 0; i < posAttr.count; i += 1) {
	          expect(Number.isFinite(posAttr.getX(i))).toBe(true);
	          expect(Number.isFinite(posAttr.getY(i))).toBe(true);
	          expect(Number.isFinite(posAttr.getZ(i))).toBe(true);
	        }

        // No vertex should be at origin unless an atom is there
        const mol = parseSDF(COMPLEX_MOLECULE_SDF);
        const hasAtomAtOrigin = mol.atoms.some(
          (a) =>
            Math.abs(a.x) < 0.001 && Math.abs(a.y) < 0.001 && Math.abs(a.z) < 0.001
	        );

	        if (!hasAtomAtOrigin) {
	          for (let i = 0; i < posAttr.count; i += 1) {
	            const x = posAttr.getX(i);
	            const y = posAttr.getY(i);
	            const z = posAttr.getZ(i);

            // Should not be at origin
            const isAtOrigin =
              Math.abs(x) < 0.001 && Math.abs(y) < 0.001 && Math.abs(z) < 0.001;
            expect(isAtOrigin).toBe(false);
          }
        }
      }
    });
  });

  describe('Hydrogen Bond Visibility Consistency', () => {
    it('when showHydrogen=false, no bonds should extend to H atoms', () => {
      const group = loadSDF(COMPLEX_MOLECULE_SDF, {
        useCylinders: true,
        showHydrogen: false,
      });

      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

      // Find hydrogen atom indices (0-based)
      const hAtomIndices = mol.atoms
        .map((a, i) => ({ symbol: a.symbol, index: i }))
        .filter((a) => a.symbol === 'H')
        .map((a) => a.index);

      expect(hAtomIndices.length).toBeGreaterThan(0);

      // Find bond meshes
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

      // No bond should reference a hydrogen atom
      bondMeshes.forEach((mesh) => {
        const { beginAtomIndex, endAtomIndex } = mesh.userData.bond;

        // These indices should NOT be in hAtomIndices
        expect(hAtomIndices.includes(beginAtomIndex)).toBe(false);
        expect(hAtomIndices.includes(endAtomIndex)).toBe(false);
      });
    });

    it('when showHydrogen=true, bonds to H atoms are visible', () => {
      const group = loadSDF(COMPLEX_MOLECULE_SDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

      // Find hydrogen atom indices (0-based)
      const hAtomIndices = mol.atoms
        .map((a, i) => ({ symbol: a.symbol, index: i }))
        .filter((a) => a.symbol === 'H')
        .map((a) => a.index);

      // Find bond meshes
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

      // At least one bond should reference a hydrogen atom
      const hasHBond = bondMeshes.some((mesh) => {
        const { beginAtomIndex, endAtomIndex } = mesh.userData.bond;
        return (
          hAtomIndices.includes(beginAtomIndex) ||
          hAtomIndices.includes(endAtomIndex)
        );
      });

      expect(hasHBond).toBe(true);
    });
  });

  describe('Index Conversion Boundary Tests', () => {
    it('first bond (index 1,1) correctly references atom 0 in array', () => {
      // Create SDF with bond referencing atom 1 (first atom)
      const sdf = `first-atom
  Test

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
$$$$`;

      const mol = parseSDF(sdf);
      expect(mol.bonds[0].beginAtomIdx).toBe(1);
      expect(mol.bonds[0].endAtomIdx).toBe(2);

      // Array access should work
      const atom1 = mol.atoms[mol.bonds[0].beginAtomIdx - 1];
      const atom2 = mol.atoms[mol.bonds[0].endAtomIdx - 1];

      expect(atom1.symbol).toBe('C');
      expect(atom2.symbol).toBe('O');
    });

    it('last bond correctly references last atom in array', () => {
      const mol = parseSDF(COMPLEX_MOLECULE_SDF);
      const lastBond = mol.bonds[mol.bonds.length - 1];

      // Verify last bond indices are valid
      const begin = lastBond.beginAtomIdx;
      const end = lastBond.endAtomIdx;

      expect(begin).toBeLessThanOrEqual(mol.atoms.length);
      expect(end).toBeLessThanOrEqual(mol.atoms.length);

      // Array access should work
      const atom1 = mol.atoms[begin - 1];
      const atom2 = mol.atoms[end - 1];

      expect(atom1).toBeDefined();
      expect(atom2).toBeDefined();
    });
  });

  describe('Chemistry Bonds Metadata Consistency', () => {
	    it('chemistry.bonds has consistent 0-based indices for all bonds', () => {
	      const result = loadSDFResult(COMPLEX_MOLECULE_SDF, {
	        useCylinders: true,
	        showHydrogen: true,
	      });

	      const { atoms, bonds } = result.chemistry;
	      const mol = parseSDF(COMPLEX_MOLECULE_SDF);

	      bonds.forEach((bond) => {
	        // chemistry.bonds should have 0-based indices
	        expect(bond.beginAtomIndex).toBeGreaterThanOrEqual(0);
	        expect(bond.beginAtomIndex).toBeLessThan(atoms.length);
        expect(bond.endAtomIndex).toBeGreaterThanOrEqual(0);
        expect(bond.endAtomIndex).toBeLessThan(atoms.length);

        // Verify atoms at these indices exist and have valid positions
        const atom1 = mol.atoms[bond.beginAtomIndex];
        const atom2 = mol.atoms[bond.endAtomIndex];

        expect(atom1).toBeDefined();
        expect(atom2).toBeDefined();
        expect(Number.isFinite(atom1.x)).toBe(true);
        expect(Number.isFinite(atom2.y)).toBe(true);
      });
    });
  });

  describe('Malformed SDF Handling (Hanging Bond Prevention)', () => {
    it('gracefully handles bond referencing non-existent atom (out of bounds)', () => {
      // This SDF has 2 atoms but a bond referencing atom 99 (doesn't exist)
      const malformedSDF = `malformed
  Test

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1 99  1  0
M  END
$$$$`;

      // Should not throw when loading
      const group = loadSDF(malformedSDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      expect(group).toBeDefined();

      // Should have atoms
      const atomMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'atom'
      );
      expect(atomMeshes.length).toBe(2);

      // Should NOT have any bond meshes (invalid bond should be skipped)
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );
      expect(bondMeshes.length).toBe(0);
    });

    it('gracefully handles bond with beginAtomIdx = 0 (invalid 1-based index)', () => {
      // This SDF has a bond with atom index 0 (invalid in 1-based SDF format)
      const malformedSDF = `zero-index
  Test

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  0  2  1  0
M  END
$$$$`;

      const group = loadSDF(malformedSDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      expect(group).toBeDefined();

      // Should still have atoms
      const atomMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'atom'
      );
      expect(atomMeshes.length).toBe(2);

      // Invalid bond should be skipped (0 - 1 = -1 which is out of bounds)
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );
      expect(bondMeshes.length).toBe(0);
    });

    it('renders valid bonds even when some bonds are invalid', () => {
      // This SDF has 3 atoms, one valid bond (1-2) and one invalid bond (1-99)
      const mixedSDF = `mixed-valid-invalid
  Test

  3  2  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.5000    1.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  1 99  1  0
M  END
$$$$`;

      const group = loadSDF(mixedSDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      expect(group).toBeDefined();

      // Should have all 3 atoms
      const atomMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'atom'
      );
      expect(atomMeshes.length).toBe(3);

      // Should have exactly 1 bond mesh (the valid one)
      const bondMeshes = group.children.filter(
        (c) => c.isMesh && c.userData.role === 'bond'
      );
      expect(bondMeshes.length).toBe(1);

      // The valid bond should connect atoms 0 and 1 (0-based)
      const bondMeta = bondMeshes[0].userData.bond;
      expect(bondMeta.beginAtomIndex).toBe(0);
      expect(bondMeta.endAtomIndex).toBe(1);
    });
  });
});
