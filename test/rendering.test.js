import { describe, it, expect } from 'vitest';
import { loadSDF } from '../src/index';

describe('Bond Rendering', () => {
  it('should render double bonds as two lines', () => {
    const ethyleneSDF = `ethylene
  Mrvl

  2  1  0  0  0  0            999 V2000
    -0.6667    0.0000    0.0000 C   0  0  0  0  0  0
     0.6667    0.0000    0.0000 C   0  0  0  0  0  0
  1  2  2  0  0  0
M  END
`;
    const group = loadSDF(ethyleneSDF, { useCylinders: false, renderMultipleBonds: true });
    // Expect 2 atoms and 1 LineSegments object
    expect(group.children.length).toBe(2 + 1);
    const line = group.children.find(c => c.type === 'LineSegments');
    expect(line).toBeDefined();
    // The LineSegments geometry should have 4 vertices (2 for each line of the double bond)
    expect(line.geometry.attributes.position.count).toBe(4);
  });

  it('should render triple bonds as three lines', () => {
    const acetyleneSDF = `acetylene
  Mrvl

  2  1  0  0  0  0            999 V2000
    -0.6000    0.0000    0.0000 C   0  0  0  0  0  0
     0.6000    0.0000    0.0000 C   0  0  0  0  0  0
  1  2  3  0  0  0
M  END
`;
    const group = loadSDF(acetyleneSDF, { useCylinders: false, renderMultipleBonds: true });
    // Expect 2 atoms and 1 LineSegments object
    expect(group.children.length).toBe(2 + 1);
    const line = group.children.find(c => c.type === 'LineSegments');
    expect(line).toBeDefined();
    // The LineSegments geometry should have 6 vertices (2 for each line of the triple bond)
    expect(line.geometry.attributes.position.count).toBe(6);
  });

  it('should create a ConeGeometry for wedged bonds', () => {
    const wedgeSDF = `wedge
  Mrvl

  2  1  0  0  1  0            999 V2000
    -0.5000    0.0000    0.0000 C   0  0  0  0  0  0
     0.5000    0.0000    0.0000 C   0  0  0  0  0  0
	  1  2  1  1  0  0
	M  END
	`;
	    const group = loadSDF(wedgeSDF, { useCylinders: true, renderStereoBonds: true });
	    const hasCone = group.children.some(c => c.isMesh && c.geometry.type === 'ConeGeometry');
	    expect(hasCone).toBe(true);
	  });

	  it('should create multiple CylinderGeometries for hashed bonds', () => {
	    const hashSDF = `hash
	  Mrvl

	  2  1  0  0  6  0            999 V2000
	    -0.5000    0.0000    0.0000 C   0  0  0  0  0  0
	     0.5000    0.0000    0.0000 C   0  0  0  0  0  0
		  1  2  1  6  0  0
		M  END
		`;
		    const group = loadSDF(hashSDF, { useCylinders: true, renderStereoBonds: true });
		    let cylinderCount = 0;
		    group.traverse((o) => {
		      if (o.isMesh && o.geometry?.type === 'CylinderGeometry') cylinderCount += 1;
		    });
	    expect(cylinderCount).toBeGreaterThan(1);
	  });
	}); 
