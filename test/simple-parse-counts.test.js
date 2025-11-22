/* eslint-disable import/extensions */
import { describe, it, expect, vi } from 'vitest';

describe('simpleParse fixed-width counts handling', () => {
  it('prefers fixed-width counts before whitespace fallback', async () => {
    vi.resetModules();
    vi.doMock('sdf-parser', () => ({ parse: undefined }));

    const { parseSDF } = await import('../src/index.js');

    const sdf = `fixed width counts
  test
comment
002001  0  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
`;

    const mol = parseSDF(sdf);
    expect(mol.atoms).toHaveLength(2);
    expect(mol.bonds).toHaveLength(1);

    vi.doUnmock('sdf-parser');
  });
});
