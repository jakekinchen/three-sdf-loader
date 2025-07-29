import * as THREE from 'three';
import { parse } from 'sdf-parser';

/* eslint-disable prefer-destructuring, no-use-before-define */


// ─── shared geometry caches ────────────────────────────────────────────────
const SPHERE_GEO_CACHE = new Map(); // key: radius → SphereGeometry
const CYLINDER_GEO = new THREE.CylinderGeometry(1, 1, 1, 8); // reused
const CONE_GEO = new THREE.ConeGeometry(2, 1, 8, 1, true);

/** return memoised sphere geometry */
function getSphereGeometry(r) {
  if (!SPHERE_GEO_CACHE.has(r)) {
    SPHERE_GEO_CACHE.set(r, new THREE.SphereGeometry(r, 16, 16));
  }
  return SPHERE_GEO_CACHE.get(r);
}

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
  CL: 0.4,
  BR: 0.43,
  I: 0.5,
  P: 0.38,
  S: 0.37,
};

// add representative radii for common hetero atoms & metals
Object.assign(DEFAULT_RADII, {
  SI: 0.42,
  B: 0.3,
  SE: 0.5,
  TE: 0.56,
  ZN: 0.48,
  FE: 0.5,
  CU: 0.46,
  NI: 0.49,
  CA: 0.51,
  NA: 0.6,
  CL: 0.4,
  BR: 0.45,
  I: 0.5,
});

const GENERIC_RADIUS = 0.45; // fallback for any unknown element

// IUPAC metallic elements (alkali, alkaline-earth, transition, post-transition, lanthanide, actinide)
const DEFAULT_METALS = new Set([
  'LI',
  'NA',
  'K',
  'RB',
  'CS',
  'FR',
  'BE',
  'MG',
  'CA',
  'SR',
  'BA',
  'RA',
  'SC',
  'Y',
  'TI',
  'ZR',
  'HF',
  'V',
  'NB',
  'TA',
  'CR',
  'MO',
  'W',
  'MN',
  'TC',
  'RE',
  'FE',
  'RU',
  'OS',
  'CO',
  'RH',
  'IR',
  'NI',
  'PD',
  'PT',
  'CU',
  'AG',
  'AU',
  'ZN',
  'CD',
  'HG',
  'AL',
  'GA',
  'IN',
  'TL',
  'SN',
  'PB',
  'BI',
  'PO',
  'FL',
  'LV',
  'NH',
  'MC',
  'LA',
  'CE',
  'PR',
  'ND',
  'PM',
  'SM',
  'EU',
  'GD',
  'TB',
  'DY',
  'HO',
  'ER',
  'TM',
  'YB',
  'LU',
  'AC',
  'TH',
  'PA',
  'U',
  'NP',
  'PU',
  'AM',
  'CM',
  'BK',
  'CF',
  'ES',
  'FM',
  'MD',
  'NO',
  'LR',
]);
// Distance cutoff (Å) for metal–ligand coordination bond inference (hard minimum)
const DEFAULT_CUTOFF = 3.0;
// Relative factor multiplier on closest ligand distance (adaptive for 2-D layouts)
const DEFAULT_REL_FACTOR = 1.4;

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
function loadSDF(text, options = {}) {
  const {
    showHydrogen = false,
    layout = 'auto',
    hiddenElements = [],
    elementColors = {},
    elementRadii = {},
    attachAtomData = true,
    attachProperties = true,
    renderMultipleBonds = true,
    multipleBondOffset = 0.1,
    useCylinders = true,
    bondRadius = 0.02,
    inferBridgingBonds = true,
    addThreeCenterBonds, // deprecated alias
  } = options;

  // Trim anything after first $$$$
  const mainText = text.split('$$$$')[0];

  // Build hidden elements set
  const hiddenSet = new Set(hiddenElements.map((e) => e.toUpperCase()));
  if (!showHydrogen) hiddenSet.add('H'); // retain legacy flag

  // sdf-parser may return array or single object – normalise
  let mol = parse(mainText);
  if (!mol || !mol.atoms || mol.atoms.length === 0) {
    mol = simpleParse(mainText);
  }
  const { atoms = [], bonds = [] } = mol ?? {};

  // ── Determine 2‑D vs 3‑D layout ──
  let layoutMode = layout;
  if (layoutMode === 'auto') {
    const maxZ = atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);
    layoutMode = maxZ < 1e-4 ? '2d' : '3d';
  }

  // ── Automatic metal–ligand bond inference ──
  const metalUnbonded =
    options.autoDetectMetalBonds !== false &&
    atoms.some((a, i) => {
      if (!DEFAULT_METALS.has(a.symbol.toUpperCase())) return false;
      return bonds.every((b) => b.beginAtomIdx !== i + 1 && b.endAtomIdx !== i + 1);
    });

  if ((layoutMode === '3d' || metalUnbonded) &&
      options.autoDetectMetalBonds !== false) {
    inferCoordinationBonds(atoms, bonds, options);
  }

  // ── Automatic bridging bond inference ──
  // Support legacy option name for backward compatibility
  const shouldInferBridging = inferBridgingBonds ?? addThreeCenterBonds ?? true;

  if (shouldInferBridging) {
    addInferredBridgingBonds(atoms, bonds, hiddenSet);
  }
  const group = new THREE.Group();
  group.userData.layoutMode = layoutMode;

  // Find atoms involved in stereo bonds
  const stereoAtomIndices = new Set();
  bonds.forEach((bond) => {
    if (bond.stereo && bond.order === 1) {
      stereoAtomIndices.add(bond.beginAtomIdx - 1);
      stereoAtomIndices.add(bond.endAtomIdx - 1);
    }
  });

  // Build atom meshes and positions
  const atomPositions = [];
  atoms.forEach((atom, i) => {
    const { x, y, z, symbol } = atom;
    const symUpper = symbol.toUpperCase();

    // Store position for visible atoms or atoms involved in stereo bonds
    if (!hiddenSet.has(symUpper) || stereoAtomIndices.has(i)) {
      atomPositions[i] = new THREE.Vector3(x, y, z);
    }

    // Only create mesh for visible atoms
    if (hiddenSet.has(symUpper)) return;

    const radius =
      elementRadii[symUpper] ?? DEFAULT_RADII[symUpper] ?? GENERIC_RADIUS;
    const color =
      elementColors[symUpper] ?? DEFAULT_COLORS[symUpper] ?? 0xffffff;

    const geometry = getSphereGeometry(radius);
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);

    if (attachAtomData) mesh.userData.atom = atom;

    group.add(mesh);
  });

  // Build bonds using LineSegments (lighter than cylinders)
  if (bonds.length) {
    const verts = [];
    const up = new THREE.Vector3(0, 1, 0);

    // Shared resources for cylinder mode
    const cylGeo = useCylinders ? CYLINDER_GEO : null;
    const cylMat = useCylinders
      ? new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
      : null;

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

      // ── order & style ──
      const isAromatic = bond.order === 4;
      const isBridge = bond.isBridge === true;
      let order = bond.order ?? 1;
      if (order < 1 || order > 3) order = 1; // 0,4,8,9 → single

      const addBond = (offsetVec) => {
        const aOff = new THREE.Vector3().addVectors(a, offsetVec);
        const bOff = new THREE.Vector3().addVectors(b, offsetVec);

        if (useCylinders) {
          // Cylinder mesh between aOff and bOff
          const dirVec = new THREE.Vector3().subVectors(bOff, aOff);
          const len = dirVec.length();
          if (len < 1e-6) return;

          const mid = new THREE.Vector3()
            .addVectors(aOff, bOff)
            .multiplyScalar(0.5);
          const mesh = new THREE.Mesh(cylGeo, cylMat);
          // scale: radius in X/Z, length in Y
          mesh.scale.set(bondRadius * 2, len, bondRadius * 2);
          // orient: Y axis → dir
          mesh.quaternion.setFromUnitVectors(up, dirVec.clone().normalize());
          mesh.position.copy(mid);
          group.add(mesh);
        } else if (isAromatic || isBridge) {
          const geom = new THREE.BufferGeometry().setFromPoints([aOff, bOff]);
          const dash = isAromatic ? 0.15 : 0.08; // finer pattern for bridges
          const mat = new THREE.LineDashedMaterial({
            color: 0xaaaaaa,
            dashSize: dash,
            gapSize: dash,
          });
          const line = new THREE.Line(geom, mat);
          line.computeLineDistances();
          group.add(line);
        } else {
          // line mode: push vertices
          verts.push(aOff.x, aOff.y, aOff.z);
          verts.push(bOff.x, bOff.y, bOff.z);
        }
      };

      // ── stereochemistry (wedge / hash) ──
      if (bond.stereo && order === 1) {
        if (bond.stereo === 1) addSolidWedge(a, b, bondRadius, group, up);
        else if (bond.stereo === 6) addHashedWedge(a, b, bondRadius, group, up);
        else addBond(new THREE.Vector3(0, 0, 0)); // wavy fallback
        return; // skip normal line rendering
      }

      if (!renderMultipleBonds || order === 1) {
        addBond(new THREE.Vector3(0, 0, 0));
      } else {
        // Offset lies in molecular plane: n × dir  (n = plane normal)
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        let side = new THREE.Vector3().crossVectors(planeNormal, dir);

        // Fallback to previous axis logic if side is too small (bond // planeNormal)
        if (side.lengthSq() < 1e-6) {
          const tryAxes = [
            up,
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(1, 0, 0),
          ];
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
        } else if (order === 3) {
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

function parseSDF(text, options = {}) {
  if (/^\s*M\s+V30\b/m.test(text)) return parseV3000(text);
  if (parse) {
    const result = parse(text, options);
    if (
      result &&
      (result.atoms || (Array.isArray(result) && result[0]?.atoms))
    ) {
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
    const [a, b, orderStr, stereoStr = '0'] = l.trim().split(/\s+/);
    bonds.push({
      beginAtomIdx: Number(a),
      endAtomIdx: Number(b),
      order: Number(orderStr) || 1,
      stereo: Number(stereoStr),
    });
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

/**
 * Parse V3000 format SDF files (minimal implementation).
 * Handles basic atom and bond blocks with M V30 format.
 *
 * @param {string} text V3000 SDF content.
 * @returns {Object} Parsed molecule with atoms, bonds, and properties.
 */
function parseV3000(text) {
  const atoms = [];
  const bonds = [];
  let inAtoms = false;
  let inBonds = false;

  text.split('\n').forEach((ln) => {
    if (ln.includes('BEGIN ATOM')) {
      inAtoms = true;
      return;
    }
    if (ln.includes('END ATOM')) {
      inAtoms = false;
      return;
    }
    if (ln.includes('BEGIN BOND')) {
      inBonds = true;
      return;
    }
    if (ln.includes('END BOND')) {
      inBonds = false;
      return;
    }

    if (inAtoms && ln.startsWith('M  V30')) {
      // M  V30  idx  el  x  y  z ...
      const parts = ln.trim().split(/\s+/);
      if (parts.length >= 7) {
        const [, , , symbol, x, y, z] = parts;
        atoms.push({ x: +x, y: +y, z: +z, symbol });
      }
    }

    if (inBonds && ln.startsWith('M  V30')) {
      // M  V30  idx  order  a  b ...
      const parts = ln.trim().split(/\s+/);
      if (parts.length >= 6) {
        const [, , , order, a, b] = parts;
        bonds.push({ beginAtomIdx: +a, endAtomIdx: +b, order: +order });
      }
    }
  });

  return { atoms, bonds, properties: {} };
}

/**
 * Infer metal–ligand coordination bonds for common transition metals.
 * Adds new bond records with order 0 if within cutoff distance and not already bonded.
 *
 * @param {Array} atoms Atom list from parsed SDF.
 * @param {Array} bonds Bond list (will be mutated in-place).
 * @param {Object} [opts]
 * @param {Set<string>} [opts.metals] Set of element symbols considered metals.
 * @param {number} [opts.cutoff] Distance threshold (Å) for bond inference.
 * @param {number} [opts.relFactor] Relative factor multiplier on closest ligand distance (adaptive for 2-D layouts).
 */
function inferCoordinationBonds(
  atoms,
  bonds,
  {
    metals = DEFAULT_METALS,
    cutoff = DEFAULT_CUTOFF,
    relFactor = DEFAULT_REL_FACTOR,
  } = {},
) {
  const seen = new Set(
    bonds.map(
      (b) =>
        `${Math.min(b.beginAtomIdx, b.endAtomIdx)}-${Math.max(
          b.beginAtomIdx,
          b.endAtomIdx,
        )}`,
    ),
  );

  atoms.forEach((m, mi) => {
    if (!metals.has(m.symbol.toUpperCase())) return;

    // Gather candidate ligands with distances
    const candidates = [];
    atoms.forEach((l, li) => {
      if (mi === li) return;
      if (l.symbol.toUpperCase() === 'H') return; // ignore M–H

      const dx = m.x - l.x;
      const dy = m.y - l.y;
      const dz = m.z - l.z;
      candidates.push({ li, dist: Math.hypot(dx, dy, dz) });
    });

    if (!candidates.length) return;

    const dMin = Math.min(...candidates.map((c) => c.dist));
    const threshold = Math.max(cutoff, dMin * relFactor);

    candidates.forEach(({ li, dist }) => {
      if (dist > threshold) return;
      const a = mi + 1;
      const b = li + 1;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key)) return;

      bonds.push({ beginAtomIdx: a, endAtomIdx: b, order: 0 });
      seen.add(key);
    });
  });
}

/**
 * Infer bridging bonds by detecting heavy atoms connected through the same hidden atom.
 * Generalizes three-center bonds to any hidden element (H, Cl, O, etc.).
 * Adds pseudo-bonds with order 0 and isBridge: true.
 *
 * @param {Array} atoms Atom list from parsed SDF.
 * @param {Array} bonds Bond list (will be mutated in-place).
 * @param {Set} hiddenSet Set of hidden element symbols (uppercase).
 */
function addInferredBridgingBonds(atoms, bonds, hiddenSet) {
  const isHeavy = (s) =>
    s.toUpperCase() !== 'H' && !hiddenSet.has(s.toUpperCase());

  // Build adjacency list
  const adj = new Map(atoms.map((_, i) => [i + 1, []]));
  bonds.forEach(({ beginAtomIdx: a, endAtomIdx: b }) => {
    adj.get(a).push(b);
    adj.get(b).push(a);
  });

  const seen = new Set(
    bonds.map(
      (b) =>
        `${Math.min(b.beginAtomIdx, b.endAtomIdx)}-${Math.max(b.beginAtomIdx, b.endAtomIdx)}`,
    ),
  );

  atoms.forEach((atom, idx) => {
    if (!hiddenSet.has(atom.symbol.toUpperCase())) return; // only hidden atoms
    const partners = adj
      .get(idx + 1)
      .filter((p) => isHeavy(atoms[p - 1].symbol));
    if (partners.length < 2) return;

    for (let m = 0; m < partners.length - 1; m += 1) {
      for (let n = m + 1; n < partners.length; n += 1) {
        const a = partners[m];
        const b = partners[n];
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        if (!seen.has(key)) {
          bonds.push({
            beginAtomIdx: a,
            endAtomIdx: b,
            order: 0,
            isBridge: true,
          });
          seen.add(key);
        }
      }
    }
  });
}

/**
 * Orient a mesh along a vector from 'from' to 'to' using the given up vector.
 * Scales the mesh's Y-axis to match the distance.
 *
 * @param {THREE.Mesh} mesh The mesh to orient.
 * @param {THREE.Vector3} from Start position.
 * @param {THREE.Vector3} to End position.
 * @param {THREE.Vector3} up Up vector for orientation.
 * @returns {boolean} True if successful, false if distance too small.
 */
function orientMeshAlong(mesh, from, to, up) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-6) return false;
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  mesh.position.copy(
    new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
  );
  return true;
}

/**
 * Add a solid wedge bond (filled triangle → cone) for stereochemistry.
 *
 * @param {THREE.Vector3} a Start position.
 * @param {THREE.Vector3} b End position.
 * @param {number} r Bond radius.
 * @param {THREE.Group} group Group to add the mesh to.
 * @param {THREE.Vector3} up Up vector for orientation.
 */
function addSolidWedge(a, b, r, group, up) {
  const mesh = new THREE.Mesh(
    CONE_GEO.clone(),
    new THREE.MeshBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
    }),
  );
  mesh.scale.set(r, 1, r); // adjust radius to r*2 (base cone radius is 2)
  if (orientMeshAlong(mesh, a, b, up)) group.add(mesh);
}

/**
 * Add a hashed wedge bond (series of shrinking cylinders) for stereochemistry.
 *
 * @param {THREE.Vector3} a Start position.
 * @param {THREE.Vector3} b End position.
 * @param {number} r Bond radius.
 * @param {THREE.Group} group Group to add the meshes to.
 * @param {THREE.Vector3} up Up vector for orientation.
 */
function addHashedWedge(a, b, r, group, up) {
  const steps = 5;
  const dir = new THREE.Vector3().subVectors(b, a).divideScalar(steps);
  for (let i = 0; i < steps; i += 1) {
    const start = new THREE.Vector3().addVectors(
      a,
      dir.clone().multiplyScalar(i),
    );
    const end = start.clone().add(dir.clone().multiplyScalar(0.6));
    const geo = CYLINDER_GEO.clone();
    geo.scale(r * (1 - i / steps), 1, r * (1 - i / steps));
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa }),
    );
    if (orientMeshAlong(mesh, start, end, up)) group.add(mesh);
  }
}

export { loadSDF, parseSDF };
