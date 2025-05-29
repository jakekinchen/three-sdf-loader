/* eslint-disable import/extensions */

import { describe, it, expect } from 'vitest';
import { parseSDF } from '../src/index.js';

// Sample SDF containing a charge and a custom property.
const SAMPLE_SDF = `charged
  AJChem

  1  0  0  0  0  0              0 V2000
    0.0000    0.0000    0.0000 Na  0  3  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1   1
M  END
>  <PUBCHEM_COMPOUND_CID>
999999
$$$$`;

describe('parseSDF', () => {
  it('returns atoms, bonds and properties', () => {
    const mol = parseSDF(SAMPLE_SDF);
    expect(mol).toHaveProperty('atoms');
    expect(Array.isArray(mol.atoms)).toBe(true);
    expect(mol).toHaveProperty('bonds');
    expect(Array.isArray(mol.bonds)).toBe(true);
  });
}); 