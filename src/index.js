/* eslint-disable prefer-destructuring, no-use-before-define */

import * as THREE from 'three';
import pkgParser from 'sdf-parser';

const parseSDFInternal = (typeof pkgParser === 'function' ? pkgParser : pkgParser.parse);

// Default CPK-ish element colours
const DEFAULT_COLORS = {
  H: 0xffffff,
  C: 0xaaaaaa,
  N: 0x3050f8,
  O: 0xff0d0d,
  F: 0x90e050,
  CL: 0x1ff01f,
  BR: 0xa62929,
  I: 0x940094,
  P: 0xff8000,
  S: 0xffff30,
};

// Approximate van der Waals radii in Å scaled down (scene units)
const DEFAULT_RADII = {
  H: 0.25,
  C: 0.35,
  N: 0.33,
  O: 0.33,
  F: 0.32,
  CL: 0.40,
  BR: 0.43,
  I: 0.50,
  P: 0.38,
  S: 0.37,
};

/**
 * Convert SDF (V2000) text into a THREE.Group containing spheres (atoms)
 * and line segments (bonds).
 *
 * @param {string} text Raw SDF file contents.
 * @param {Object} [options]
 * @param {boolean} [options.showHydrogen=false] Include hydrogens.
 * @param {Object<string, import('three').ColorRepresentation>} [options.elementColors] Per-element colours.
 * @param {Object<string, number>} [options.elementRadii] Per-element radii.
 * @returns {THREE.Group}
 */
export function loadSDF(text, options = {}) {
  const {
    showHydrogen = false,
    elementColors = {},
    elementRadii = {},
    attachAtomData = true,
    attachProperties = true,
    renderMultipleBonds = true,
    multipleBondOffset = 0.1,
    useCylinders = true,
    bondRadius = 0.02,
  } = options;

  // Trim anything after first $$$$
  const mainText = text.split('$$$$')[0];

  // sdf-parser may return array or single object – normalise
  let mol = parseSDFInternal ? parseSDFInternal(mainText) : null;
  if (!mol || !mol.atoms || mol.atoms.length === 0) {
    mol = simpleParse(mainText);
  }
  const { atoms = [], bonds = [] } = mol ?? {};

  const group = new THREE.Group();

  // Build atom meshes
  const atomPositions = [];
  atoms.forEach((atom, i) => {
    const { x, y, z, symbol } = atom;
    const symUpper = symbol.toUpperCase();

    if (!showHydrogen && symUpper === 'H') return;

    const radius = elementRadii[symUpper] ?? DEFAULT_RADII[symUpper] ?? 0.3;
    const color = elementColors[symUpper] ?? DEFAULT_COLORS[symUpper] ?? 0xffffff;

    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);

    if (attachAtomData) mesh.userData.atom = atom;

    group.add(mesh);
    // eslint-disable-next-line prefer-destructuring
    atomPositions[i] = new THREE.Vector3(x, y, z); // keep for bonds
  });

  // Build bonds using LineSegments (lighter than cylinders)
  if (bonds.length) {
    const verts = [];
    const up = new THREE.Vector3(0, 1, 0);

    // Shared resources for cylinder mode
    const cylGeo = useCylinders ? new THREE.CylinderGeometry(1, 1, 1, 8) : null;
    const cylMat = useCylinders ? new THREE.MeshBasicMaterial({ color: 0xaaaaaa }) : null;

    /* ── Compute best-effort plane normal for (mostly) planar molecules ── */
    const planeNormal = (() => {
      if (atoms.length < 3) return up.clone();
      const pts = atoms.map((a) => new THREE.Vector3(a.x, a.y, a.z));
      for (let i = 0; i < pts.length - 2; i += 1) {
        for (let j = i + 1; j < pts.length - 1; j += 1) {
          for (let k = j + 1; k < pts.length; k += 1) {
            const v1 = new THREE.Vector3().subVectors(pts[j], pts[i]);
            const v2 = new THREE.Vector3().subVectors(pts[k], pts[i]);
            const n = new THREE.Vector3().crossVectors(v1, v2);
            if (n.lengthSq() > 1e-6) return n.normalize();
          }
        }
      }
      return up.clone();
    })();

    bonds.forEach((bond) => {
      const a = atomPositions[bond.beginAtomIdx - 1];
      const b = atomPositions[bond.endAtomIdx - 1];
      if (!a || !b) return;

      const order = bond.order || 1;
      const addBond = (offsetVec) => {
        const aOff = new THREE.Vector3().addVectors(a, offsetVec);
        const bOff = new THREE.Vector3().addVectors(b, offsetVec);

        if (useCylinders) {
          // Cylinder mesh between aOff and bOff
          const dirVec = new THREE.Vector3().subVectors(bOff, aOff);
          const len = dirVec.length();
          if (len < 1e-6) return;

          const mid = new THREE.Vector3().addVectors(aOff, bOff).multiplyScalar(0.5);
          const mesh = new THREE.Mesh(cylGeo, cylMat);
          // scale: radius in X/Z, length in Y
          mesh.scale.set(bondRadius * 2, len, bondRadius * 2);
          // orient: Y axis → dir
          mesh.quaternion.setFromUnitVectors(up, dirVec.clone().normalize());
          mesh.position.copy(mid);
          group.add(mesh);
        } else {
          // line mode: push vertices
          verts.push(aOff.x, aOff.y, aOff.z);
          verts.push(bOff.x, bOff.y, bOff.z);
        }
      };

      if (!renderMultipleBonds || order === 1) {
        addBond(new THREE.Vector3(0, 0, 0));
      } else {
        // Offset lies in molecular plane: n × dir  (n = plane normal)
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        let side = new THREE.Vector3().crossVectors(planeNormal, dir);

        // Fallback to previous axis logic if side is too small (bond // planeNormal)
        if (side.lengthSq() < 1e-6) {
          const tryAxes = [up, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)];
          for (let i = 0; i < tryAxes.length; i += 1) {
            const alt = new THREE.Vector3().crossVectors(dir, tryAxes[i]);
            if (alt.lengthSq() > 1e-6) {
              side = alt;
              break;
            }
          }
        }

        side.normalize().multiplyScalar(multipleBondOffset);

        if (order === 2) {
          addBond(side);
          addBond(side.clone().negate());
        } else {
          // triple bond: centre + two offsets
          addBond(new THREE.Vector3(0, 0, 0));
          addBond(side);
          addBond(side.clone().negate());
        }
      }
    });

    if (!useCylinders && verts.length) {
      const positions = new Float32Array(verts);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
      const lines = new THREE.LineSegments(geom, mat);
      group.add(lines);
    }
  }

  if (attachProperties) {
    group.userData.properties = mol.properties ?? {};
  }

  return group;
}

export function parseSDF(text, options = {}) {
  if (parseSDFInternal) {
    const result = parseSDFInternal(text, options);
    if (result && (result.atoms || (Array.isArray(result) && result[0]?.atoms))) {
      return Array.isArray(result) ? result[0] : result;
    }
  }
  return simpleParse(text);
}

function simpleParse(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length < 4) return {};
  const counts = lines[3].slice(0, 39).trim().split(/\s+/);
  const natoms = Number(counts[0]);
  const nbonds = Number(counts[1]);

  const atoms = [];
  for (let i = 0; i < natoms; i += 1) {
    const l = lines[4 + i] || '';
    const parts = l.trim().split(/\s+/);
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);
    const symbol = parts[3] ?? '';
    atoms.push({ x, y, z, symbol });
  }

  const bonds = [];
  for (let i = 0; i < nbonds; i += 1) {
    const l = lines[4 + natoms + i] || '';
    const [a, b, orderStr] = l.trim().split(/\s+/);
    bonds.push({ beginAtomIdx: Number(a), endAtomIdx: Number(b), order: Number(orderStr) || 1 });
  }

  const props = {};
  const mEndIndex = lines.findIndex((ln) => ln.startsWith('M  END'));
  for (let i = mEndIndex + 1; i < lines.length; i += 1) {
    const ln = lines[i];
    if (ln.startsWith('>')) {
      const match = ln.match(/<([^>]+)>/);
      if (match) {
        const key = match[1];
        const val = (lines[i + 1] || '').trim();
        props[key] = val;
        i += 1;
      }
    }
  }

  return { atoms, bonds, properties: props };
} 