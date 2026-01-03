import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadSDF, loadSDFResult } from '../src/index';

// Iron-Carbon complex with no explicit bonds - coordination bonds are inferred
const FE_C_NO_BOND_SDF = `fe-c
  Example

  2  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 Fe  0  0  0  0  0  0  0  0  0  0  0  0
    1.9000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$`;

// Zinc-Oxygen complex - another coordination bond test case
const ZN_O_SDF = `zn-o
  Example

  2  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 Zn  0  0  0  0  0  0  0  0  0  0  0  0
    2.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$`;

// Ethene double bond - for regression testing normalized order
const ETHENE_SDF = `ethene
  Demo

  2  1  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.3300    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0
M  END
$$$$`;

// Benzene aromatic ring - for aromatic bond metadata testing
const BENZENE_SDF = `benzene
  Demo

  6  6  0  0  0  0              0 V2000
    1.2124    0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124   -0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2124   -0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2124    0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  4  0
  2  3  4  0
  3  4  4  0
  4  5  4  0
  5  6  4  0
  6  1  4  0
M  END
$$$$`;

// Single bond for testing molfile source
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

describe('Bond Metadata', () => {
  describe('Coordination Bonds', () => {
    it('infers coordination bonds with originalOrder=0 and isCoordination=true', () => {
      const result = loadSDFResult(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      // Should have at least one bond
      expect(result.chemistry.bonds.length).toBeGreaterThan(0);

      // Find a coordination bond
      const coordBond = result.chemistry.bonds.find((b) => b.originalOrder === 0);
      expect(coordBond).toBeDefined();
      expect(coordBond.isCoordination).toBe(true);
      expect(coordBond.source).toBe('inferredCoordination');
      expect(coordBond.order).toBe(1); // normalized order for rendering
    });

    it('exposes coordination metadata on cylinder mesh userData.bond', () => {
      const group = loadSDF(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      // Find cylinder bond mesh
      const bondMesh = group.children.find(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

      expect(bondMesh).toBeDefined();
      expect(bondMesh.userData.bond.originalOrder).toBe(0);
      expect(bondMesh.userData.bond.isCoordination).toBe(true);
      expect(bondMesh.userData.bond.source).toBe('inferredCoordination');
      expect(bondMesh.userData.bond.order).toBe(1); // normalized
    });

    it('exposes coordination metadata for Zn-O complex', () => {
      const result = loadSDFResult(ZN_O_SDF, {
        useCylinders: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      const coordBond = result.chemistry.bonds.find((b) => b.isCoordination);
      expect(coordBond).toBeDefined();
      expect(coordBond.originalOrder).toBe(0);
      expect(coordBond.source).toBe('inferredCoordination');
    });
  });

  describe('Normalized Order Regression', () => {
    it('preserves normalized order 2 for double bonds', () => {
      const result = loadSDFResult(ETHENE_SDF, { useCylinders: true });

      const bond = result.chemistry.bonds[0];
      expect(bond.order).toBe(2);
      expect(bond.originalOrder).toBe(2);
      expect(bond.isCoordination).toBeUndefined();
      expect(bond.isAromatic).toBeUndefined();
      expect(bond.source).toBe('molfile');
    });

    it('preserves normalized order 1 for single bonds', () => {
      const result = loadSDFResult(WATER_SDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      const bond = result.chemistry.bonds[0];
      expect(bond.order).toBe(1);
      expect(bond.originalOrder).toBe(1);
      expect(bond.source).toBe('molfile');
    });

    it('preserves aromatic order 4 in chemistry.bonds but normalizes to 1 in mesh userData', () => {
      const result = loadSDFResult(BENZENE_SDF, { useCylinders: false });

      const aromaticBond = result.chemistry.bonds.find((b) => b.originalOrder === 4);
      expect(aromaticBond).toBeDefined();
      // chemistry.bonds.order preserves 1-4 range (4 = aromatic)
      expect(aromaticBond.order).toBe(4);
      expect(aromaticBond.isAromatic).toBe(true);
      expect(aromaticBond.aromatic).toBe(true); // legacy field still present
      expect(aromaticBond.source).toBe('molfile');
    });

    it('normalizes coordination order 0 to order 1 for rendering', () => {
      const result = loadSDFResult(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      const coordBond = result.chemistry.bonds.find((b) => b.originalOrder === 0);
      expect(coordBond).toBeDefined();
      expect(coordBond.order).toBe(1); // normalized to 1 for rendering
      expect(coordBond.isCoordination).toBe(true);
    });
  });

  describe('Bond Source Tracking', () => {
    it('marks molfile bonds with source="molfile"', () => {
      const result = loadSDFResult(ETHENE_SDF, { useCylinders: true });

      const bond = result.chemistry.bonds[0];
      expect(bond.source).toBe('molfile');
    });

    it('marks inferred coordination bonds with source="inferredCoordination"', () => {
      const result = loadSDFResult(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      const coordBond = result.chemistry.bonds.find((b) => b.isCoordination);
      expect(coordBond).toBeDefined();
      expect(coordBond.source).toBe('inferredCoordination');
    });
  });

  describe('Instanced Bonds Metadata', () => {
    it('provides instanceToBondIndex and bondTable for instanced bonds', () => {
      const result = loadSDFResult(ETHENE_SDF, {
        useCylinders: true,
        instancedBonds: true,
      });

      expect(result.mappings.instancedBonds).toBeDefined();
      expect(result.mappings.instancedBonds.mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(result.mappings.instancedBonds.instanceToBondIndex).toBeInstanceOf(Uint32Array);
      expect(result.mappings.instancedBonds.bondTable).toBeInstanceOf(Array);
    });

    it('bondTable contains correct metadata for instanced bonds', () => {
      const result = loadSDFResult(ETHENE_SDF, {
        useCylinders: true,
        instancedBonds: true,
      });

      const { bondTable } = result.mappings.instancedBonds;
      expect(bondTable.length).toBe(1);
      expect(bondTable[0].order).toBe(2);
      expect(bondTable[0].originalOrder).toBe(2);
      expect(bondTable[0].source).toBe('molfile');
    });

    it('can recover coordination bond metadata via instanceToBondIndex + bondTable', () => {
      const result = loadSDFResult(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        instancedBonds: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      const { instanceToBondIndex, bondTable } = result.mappings.instancedBonds;

      // Should have at least one instance
      expect(instanceToBondIndex.length).toBeGreaterThan(0);

      // Recover metadata via instance index
      const instanceIndex = 0;
      const bondIndex = instanceToBondIndex[instanceIndex];
      const bondMeta = bondTable[bondIndex];

      expect(bondMeta.originalOrder).toBe(0);
      expect(bondMeta.isCoordination).toBe(true);
      expect(bondMeta.source).toBe('inferredCoordination');
    });

    it('attaches instanceToBondIndex and bondTable to instancedBondMesh.userData', () => {
      const group = loadSDF(FE_C_NO_BOND_SDF, {
        useCylinders: true,
        instancedBonds: true,
        layout: '3d',
        coordinationMode: 'all',
      });

      const instancedMesh = group.children.find(
        (c) => c.isInstancedMesh && c.userData.role === 'bondsInstanced'
      );

      expect(instancedMesh).toBeDefined();
      expect(instancedMesh.userData.instanceToBondIndex).toBeInstanceOf(Uint32Array);
      expect(instancedMesh.userData.bondTable).toBeInstanceOf(Array);
      expect(instancedMesh.userData.bondTable[0].isCoordination).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('preserves legacy aromatic field alongside isAromatic', () => {
      const result = loadSDFResult(BENZENE_SDF, { useCylinders: false });

      const aromaticBond = result.chemistry.bonds.find((b) => b.isAromatic);
      expect(aromaticBond.aromatic).toBe(true); // legacy field
      expect(aromaticBond.isAromatic).toBe(true); // new field
    });

    it('preserves existing userData.bond fields for cylinder meshes', () => {
      const group = loadSDF(WATER_SDF, {
        useCylinders: true,
        showHydrogen: true,
      });

      const bondMesh = group.children.find(
        (c) => c.isMesh && c.userData.role === 'bond'
      );

      expect(bondMesh).toBeDefined();
      // Original fields still present
      expect(bondMesh.userData.bond.index).toBeDefined();
      expect(bondMesh.userData.bond.beginAtomIndex).toBeDefined();
      expect(bondMesh.userData.bond.endAtomIndex).toBeDefined();
      expect(bondMesh.userData.bond.order).toBeDefined();
      // New fields also present
      expect(bondMesh.userData.bond.originalOrder).toBeDefined();
      expect(bondMesh.userData.bond.source).toBe('molfile');
    });
  });
});
