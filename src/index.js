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
    const positions = new Float32Array(bonds.length * 2 * 3);
    let ptr = 0;
    bonds.forEach((bond) => {
      // SDF indices are 1-based
      const a = atomPositions[bond.beginAtomIdx - 1];
      const b = atomPositions[bond.endAtomIdx - 1];
      if (!a || !b) return;
      positions.set(a.toArray(), ptr);
      ptr += 3;
      positions.set(b.toArray(), ptr);
      ptr += 3;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
    const lines = new THREE.LineSegments(geom, mat);
    group.add(lines);
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
    const x = parseFloat(l.slice(0, 10));
    const y = parseFloat(l.slice(10, 20));
    const z = parseFloat(l.slice(20, 30));
    const symbol = l.slice(31, 34).trim();
    atoms.push({ x, y, z, symbol });
  }

  const bonds = [];
  for (let i = 0; i < nbonds; i += 1) {
    const l = lines[4 + natoms + i] || '';
    const a = Number(l.slice(0, 3));
    const b = Number(l.slice(3, 6));
    bonds.push({ beginAtomIdx: a, endAtomIdx: b });
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