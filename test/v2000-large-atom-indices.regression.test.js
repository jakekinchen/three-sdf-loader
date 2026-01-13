import { describe, it, expect } from 'vitest';
import { loadSDFResult, parseSDF } from '../src/index';

function makeV2000WithHighIndexBond() {
  const natoms = 100;
  const nbonds = 1;
  const counts = `${String(natoms).padStart(3, ' ')}${String(nbonds).padStart(
    3,
    ' ',
  )}  0  0  0  0              0 V2000`;

  let text = `high-index-bond\n  Demo\n\n${counts}\n`;
  for (let i = 0; i < natoms; i += 1) {
    const x = (i * 1.5).toFixed(4).padStart(10, ' ');
    text += `${x}    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n`;
  }

  // Fixed-width V2000 bond indices are 3 columns each; 54 + 100 appear concatenated when trimmed:
  // e.g. " 54100  1  0  0  0  0" (atom 54 bonded to atom 100).
  const bondLine = `${String(54).padStart(3, ' ')}${String(100).padStart(
    3,
    ' ',
  )}${String(1).padStart(3, ' ')}${String(0).padStart(3, ' ')}  0  0  0`;

  text += `${bondLine}\nM  END\n$$$$\n`;
  return { text, bondLine, natoms, nbonds };
}

describe('V2000 fixed-width bonds with 3-digit atom indices', () => {
  it('parses concatenated indices (e.g. " 54100") into the correct atom pair', () => {
    const { text, natoms, nbonds } = makeV2000WithHighIndexBond();
    const mol = parseSDF(text);

    expect(mol.atoms).toHaveLength(natoms);
    expect(mol.bonds).toHaveLength(nbonds);
    expect(mol.bonds[0]).toMatchObject({
      beginAtomIdx: 54,
      endAtomIdx: 100,
      order: 1,
      stereo: 0,
    });
  });

  it('never produces out-of-range indices in loadSDFResult chemistry.bonds', () => {
    const { text, natoms } = makeV2000WithHighIndexBond();
    const result = loadSDFResult(text, { headless: true });

    const outOfRange = result.chemistry.bonds.filter((b) => {
      const a = b.beginAtomIndex;
      const c = b.endAtomIndex;
      return a < 0 || c < 0 || a >= natoms || c >= natoms;
    }).length;

    expect(outOfRange).toBe(0);

    const hasHighIndexBond = result.chemistry.bonds.some(
      (b) => b.beginAtomIndex >= 99 || b.endAtomIndex >= 99,
    );
    expect(hasHighIndexBond).toBe(true);
  });
});

