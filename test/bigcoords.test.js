/* eslint-disable import/extensions */
import { describe, it, expect } from 'vitest'
import { parseSDF } from '../src/index.js'

const BIG_SDF = `big
  gen

  1  0  0  0  0  0              0 V2000
 1234567890.1234 2345678901.2345 3456789012.3456 C   0  0  0  0  0  0  0  0  0  0  0  0
M  END
$$$$`

describe('simpleParse', () => {
  it('handles coordinates longer than column width', () => {
    const mol = parseSDF(BIG_SDF)
    expect(mol.atoms[0].x).toBeCloseTo(1234567890.1234)
    expect(mol.atoms[0].y).toBeCloseTo(2345678901.2345)
    expect(mol.atoms[0].z).toBeCloseTo(3456789012.3456)
  })
})
