import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index';

// Porphyrin molecule (CID 66868) SDF data
const porphyrinSDF = `66868
  -OEChem-08052521172D

 38 42  0     0  0  0  0  0  0999 V2000
    5.0387   -1.3862    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    6.5404   -0.0167    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    3.5352   -0.0167    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    5.0052    1.3528    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    5.8406   -1.9873    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    7.1415   -0.7517    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.2367   -2.0208    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    7.1080    0.7852    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    6.8418   -1.7194    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    5.5393   -2.9550    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    8.0774   -0.4838    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.5381   -2.9550    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    8.0774    0.5173    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.2690   -1.7194    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    6.8083    1.7194    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.9677   -0.7852    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    5.8406    2.0208    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.9677    0.7517    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.2033    1.9873    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.2356    1.7194    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0000   -0.5173    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    5.5058    2.9550    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0000    0.4838    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.5046    2.9550    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    7.2716   -2.1663    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    5.0305   -0.7663    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    5.9208   -0.0383    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    5.9068   -3.4543    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    8.5724   -0.8571    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    4.1731   -3.4562    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    8.5707    0.8928    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.8329   -2.1600    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    7.2449    2.1597    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.7972    2.1578    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.5066   -0.8927    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    5.8626    3.4620    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.5066    0.8592    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    4.1371    3.4543    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  5  1  0  0  0  0
  1  7  1  0  0  0  0
  1 26  1  0  0  0  0
  2  6  1  0  0  0  0
  2  8  1  0  0  0  0
  2 27  1  0  0  0  0
  3 16  2  0  0  0  0
  3 18  1  0  0  0  0
  4 17  1  0  0  0  0
  4 19  2  0  0  0  0
  5  9  2  0  0  0  0
  5 10  1  0  0  0  0
  6  9  1  0  0  0  0
  6 11  2  0  0  0  0
  7 12  1  0  0  0  0
  7 14  2  0  0  0  0
  8 13  2  0  0  0  0
  8 15  1  0  0  0  0
  9 25  1  0  0  0  0
 10 12  2  0  0  0  0
 10 28  1  0  0  0  0
 11 13  1  0  0  0  0
 11 29  1  0  0  0  0
 12 30  1  0  0  0  0
 13 31  1  0  0  0  0
 14 16  1  0  0  0  0
 14 32  1  0  0  0  0
 15 17  2  0  0  0  0
 15 33  1  0  0  0  0
 16 21  1  0  0  0  0
 17 22  1  0  0  0  0
 18 20  2  0  0  0  0
 18 23  1  0  0  0  0
 19 20  1  0  0  0  0
 19 24  1  0  0  0  0
 20 34  1  0  0  0  0
 21 23  2  0  0  0  0
 21 35  1  0  0  0  0
 22 24  2  0  0  0  0
 22 36  1  0  0  0  0
 23 37  1  0  0  0  0
 24 38  1  0  0  0  0
M  END
$$$$`;

describe('Porphyrin Molecule Rendering', () => {
  it('should correctly parse and render porphyrin with all bonds visible', () => {
    const options = {
      showHydrogen: true,
      layout: 'auto',
      renderMultipleBonds: true,
    };

    const group = loadSDF(porphyrinSDF, options);

    // Count rendered elements
    let atomCount = 0;
    let bondCount = 0;

    group.traverse((child) => {
      if (child.geometry && child.geometry.type === 'SphereGeometry') {
        atomCount += 1;
      }

      // Count cylinder bonds (default rendering mode)
      if (
        child.type === 'Mesh' &&
        child.geometry &&
        child.geometry.type === 'CylinderGeometry'
      ) {
        bondCount += 1;
      }

      // Count line bonds (if useCylinders: false)
      if (
        child.type === 'LineSegments' &&
        child.geometry &&
        child.geometry.type === 'BufferGeometry'
      ) {
        if (child.geometry.attributes && child.geometry.attributes.position) {
          const positions = child.geometry.attributes.position.array;
          bondCount += positions.length / 6; // 2 vertices per bond, 3 coords per vertex
        }
      }
    });

    // Verify correct counts
    expect(atomCount).toBe(38); // All atoms including hydrogens
    expect(bondCount).toBe(53); // 31 single bonds + 22 cylinders for 11 double bonds

    // Verify group structure
    expect(group).toBeInstanceOf(Object);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('should render bonds as lines when useCylinders is false', () => {
    const options = {
      showHydrogen: true,
      layout: 'auto',
      renderMultipleBonds: true,
      useCylinders: false,
    };

    const group = loadSDF(porphyrinSDF, options);

    let atomCount = 0;
    let bondCount = 0;
    let hasLineSegments = false;

    group.traverse((child) => {
      if (child.geometry && child.geometry.type === 'SphereGeometry') {
        atomCount += 1;
      }

      if (
        child.type === 'LineSegments' &&
        child.geometry &&
        child.geometry.type === 'BufferGeometry'
      ) {
        hasLineSegments = true;
        if (child.geometry.attributes && child.geometry.attributes.position) {
          const positions = child.geometry.attributes.position.array;
          bondCount += positions.length / 6;
        }
      }
    });

    expect(atomCount).toBe(38);
    expect(bondCount).toBe(53); // Same count due to multiple bond rendering
    expect(hasLineSegments).toBe(true);
  });
});
