/* eslint-disable import/extensions */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseSDF, parseSDFAll, loadSDFResult } from '../src/index.js';

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

  it('parses V2000 files with leading blank lines and CRLF newlines', () => {
    const text = `\r
\r
nist-mol\r
  demo\r
\r
  4  3  0  0  0  0              0 V2000\r
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r
    1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r
    0.0000    1.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\r
   -1.2000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\r
  1  2  1  0\r
  1  3  1  0\r
  1  4  1  0\r
M  END\r
>  <SOURCE>\r
NIST\r
$$$$`;
    const mol = parseSDF(text);
    expect(mol.atoms).toHaveLength(4);
    expect(mol.bonds).toHaveLength(3);
    const result = loadSDFResult(text, { headless: true });
    expect(result.metadata.atomCount).toBe(4);
    expect(result.metadata.bondCount).toBeGreaterThanOrEqual(3);
  });

  it('splits multi-record SDF with CRLF correctly', () => {
    const recordA = `molA\r
  demo\r
\r
  1  0  0  0  0  0              0 V2000\r
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r
M  END\r
$$$$`;
    const recordB = `molB\r
  demo\r
\r
  2  1  0  0  0  0              0 V2000\r
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r
    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\r
  1  2  1  0\r
M  END\r
$$$$`;
    const combined = `\r
${recordA}\r
${recordB}`;
    const records = parseSDFAll(combined);
    expect(records).toHaveLength(2);
    expect(records[0].atoms).toHaveLength(1);
    expect(records[1].atoms).toHaveLength(2);
  });

  it('parses NIST fullerene 3D SDF with full atom and bond counts', () => {
    const text = readFileSync(
      new URL('../examples/fullerene-nist.sdf', import.meta.url),
      'utf8',
    );
    const mol = parseSDF(text);
    expect(mol.atoms).toHaveLength(60);
    expect(mol.bonds).toHaveLength(90);
    const result = loadSDFResult(text, { headless: true });
    expect(result.metadata.atomCount).toBe(60);
    expect(result.metadata.bondCount).toBeGreaterThanOrEqual(90);
  });
});
