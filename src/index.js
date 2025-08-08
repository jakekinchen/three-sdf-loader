/* eslint-disable prefer-destructuring, no-use-before-define */

import * as THREE from 'three';
import { parse as parseSDFInternal } from 'sdf-parser';

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
// Minimal atomic numbers for common elements
const ATOMIC_NUMBERS = {
  H: 1,
  HE: 2,
  LI: 3,
  BE: 4,
  B: 5,
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  NE: 10,
  NA: 11,
  MG: 12,
  AL: 13,
  SI: 14,
  P: 15,
  S: 16,
  CL: 17,
  AR: 18,
  K: 19,
  CA: 20,
  FE: 26,
  CU: 29,
  ZN: 30,
  BR: 35,
  I: 53,
};

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
export function loadSDF(text, options = {}) {
  const {
    // legacy and new options
    showHydrogen: legacyShowHydrogen,
    includeHydrogens,
    layout = 'auto',
    hiddenElements = [],
    elementColors = {},
    elementRadii = {},
    attachAtomData = true,
    attachProperties = true,
    renderMultipleBonds = true,
    multipleBondOffset = 0.1,
    useCylinders: legacyUseCylinders,
    bondRadius = 0.02,
    inferBridgingBonds = true,
    addThreeCenterBonds, // deprecated alias
    bondGeometry,
    atomGeometry,
    coordinateScale = 1.0,
    onProgress,
    performance = {},
    instancing = false,
    createBonds = true,
  } = options;

  // Map new options to legacy flags without breaking behaviour
  let showHydrogen;
  if (legacyShowHydrogen !== undefined) {
    showHydrogen = legacyShowHydrogen;
  } else if (includeHydrogens !== undefined) {
    showHydrogen = !!includeHydrogens;
  } else {
    showHydrogen = false; // retain legacy default (omit hydrogens)
  }

  let useCylinders;
  if (legacyUseCylinders !== undefined) {
    useCylinders = legacyUseCylinders;
  } else if (bondGeometry?.type) {
    useCylinders = bondGeometry.type === 'cylinder';
  } else {
    useCylinders = true;
  }

  const atomGeoType = atomGeometry?.type ?? 'sphere';
  const atomGeoRadiusOverride = atomGeometry?.radius;
  const bondRadiusFinal = bondGeometry?.radius ?? bondRadius;
  const skipBondsOverAtomThreshold = performance?.skipBondsOverAtomThreshold;

  if (typeof onProgress === 'function') onProgress('parse:start', 0);

  // Trim anything after first $$$$
  const mainText = text.split('$$$$')[0];

  // Build hidden elements set
  const hiddenSet = new Set(hiddenElements.map((e) => e.toUpperCase()));
  if (!showHydrogen) hiddenSet.add('H'); // retain legacy flag

  // sdf-parser may return array or single object – normalise
  let mol = parseSDFInternal(mainText);
  if (!mol || !mol.atoms || mol.atoms.length === 0) {
    mol = simpleParse(mainText);
  }
  const { atoms = [], bonds = [] } = mol ?? {};

  if (typeof onProgress === 'function') onProgress('parse:done', 0.2);

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
      return bonds.every(
        (b) => b.beginAtomIdx !== i + 1 && b.endAtomIdx !== i + 1,
      );
    });

  if (
    (layoutMode === '3d' || metalUnbonded) &&
    options.autoDetectMetalBonds !== false
  ) {
    inferCoordinationBonds(atoms, bonds, options);
  }

  // ── Automatic bridging bond inference ──
  // Support legacy option name for backward compatibility
  const shouldInferBridging = inferBridgingBonds ?? addThreeCenterBonds ?? true;

  if (shouldInferBridging) {
    addInferredBridgingBonds(atoms, bonds, hiddenSet);
  }
  const group = new THREE.Group();
  group.name = 'molecule';
  group.userData.layoutMode = layoutMode;

  // Prepare chemistry arrays (0-based indices aligned to SDF blocks)
  const aromaticAtomSet = new Set();
  const chemistryBonds = bonds.map((bond, i) => {
    const begin = (bond.beginAtomIdx ?? bond.a ?? 1) - 1;
    const end = (bond.endAtomIdx ?? bond.b ?? 1) - 1;
    const isAromatic = bond.order === 4;
    if (isAromatic) {
      aromaticAtomSet.add(begin);
      aromaticAtomSet.add(end);
    }
    return {
      index: i,
      beginAtomIndex: begin,
      endAtomIndex: end,
      order: Math.max(1, Math.min(4, bond.order || 1)),
      aromatic: isAromatic || undefined,
    };
  });

  const chemistryAtoms = atoms.map((atom, i) => {
    const symUpper = (atom.symbol || atom.element || '').toUpperCase();
    return {
      index: i,
      element: symUpper || '',
      atomicNumber: ATOMIC_NUMBERS[symUpper],
      formalCharge: atom.charge ?? atom.formalCharge,
      aromatic: aromaticAtomSet.has(i) || undefined,
      x: atom.x,
      y: atom.y,
      z: atom.z,
    };
  });

  if (typeof onProgress === 'function') onProgress('atoms:start', 0.3);

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
  const atomIndexToMesh = new Array(atoms.length).fill(null);
  const meshUuidToAtomIndex = new Map();

  // Instancing path: single InstancedMesh of spheres (uniform geometry)
  if (instancing) {
    const visibleAtoms = [];
    atoms.forEach((atom, i) => {
      const symUpper = (atom.symbol || '').toUpperCase();
      if (!hiddenSet.has(symUpper)) visibleAtoms.push({ atom, i });
      if (!hiddenSet.has(symUpper) || stereoAtomIndices.has(i)) {
        atomPositions[i] = new THREE.Vector3(
          atom.x * coordinateScale,
          atom.y * coordinateScale,
          atom.z * coordinateScale,
        );
      }
    });

    const instanceCount = visibleAtoms.length;
    const baseRadius = atomGeoRadiusOverride ?? GENERIC_RADIUS;
    const geometry =
      atomGeoType === 'sphere'
        ? getSphereGeometry(baseRadius)
        : new THREE.IcosahedronGeometry(baseRadius, atomGeometry?.detail ?? 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const imesh = new THREE.InstancedMesh(geometry, material, instanceCount);
    imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const instanceToAtomIndex = new Uint32Array(instanceCount);

    visibleAtoms.forEach(({ atom, i }, instanceId) => {
      dummy.position.set(
        atom.x * coordinateScale,
        atom.y * coordinateScale,
        atom.z * coordinateScale,
      );
      dummy.updateMatrix();
      imesh.setMatrixAt(instanceId, dummy.matrix);
      instanceToAtomIndex[instanceId] = i;
    });

    imesh.userData.role = 'atomsInstanced';
    imesh.userData.instanceToAtomIndex = instanceToAtomIndex;
    imesh.userData.atomMeta = {
      elementByAtomIndex: chemistryAtoms.map((a) => a.element),
      atomicNumberByAtomIndex: chemistryAtoms.map((a) => a.atomicNumber ?? 0),
      formalChargeByAtomIndex: chemistryAtoms.map((a) => a.formalCharge ?? 0),
      aromaticByAtomIndex: chemistryAtoms.map((a) => !!a.aromatic),
    };

    group.add(imesh);

    // In instanced mode we do not populate atomIndexToMesh / meshUuidToAtomIndex
  } else {
    atoms.forEach((atom, i) => {
      const { x, y, z, symbol } = atom;
      const symUpper = (symbol || '').toUpperCase();

      // Store position for visible atoms or atoms involved in stereo bonds
      if (!hiddenSet.has(symUpper) || stereoAtomIndices.has(i)) {
        atomPositions[i] = new THREE.Vector3(
          x * coordinateScale,
          y * coordinateScale,
          z * coordinateScale,
        );
      }

      // Only create mesh for visible atoms
      if (hiddenSet.has(symUpper)) return;

      const radius =
        atomGeoRadiusOverride ??
        elementRadii[symUpper] ??
        DEFAULT_RADII[symUpper] ??
        GENERIC_RADIUS;
      const color =
        elementColors[symUpper] ?? DEFAULT_COLORS[symUpper] ?? 0xffffff;

      const geometry =
        atomGeoType === 'sphere'
          ? getSphereGeometry(radius)
          : new THREE.IcosahedronGeometry(radius, atomGeometry?.detail ?? 0);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        x * coordinateScale,
        y * coordinateScale,
        z * coordinateScale,
      );

      mesh.userData.role = 'atom';
      if (attachAtomData) {
        mesh.userData.atom = {
          ...atom,
          index: i,
          element: (symbol || '').toUpperCase(),
          atomicNumber: ATOMIC_NUMBERS[(symbol || '').toUpperCase()],
          formalCharge: atom.charge ?? atom.formalCharge,
          aromatic: aromaticAtomSet.has(i) || undefined,
        };
      }

      group.add(mesh);

      atomIndexToMesh[i] = mesh;
      meshUuidToAtomIndex.set(mesh.uuid, i);
    });
  }

  if (typeof onProgress === 'function') onProgress('atoms:done', 0.6);

  // Build bonds using LineSegments (lighter than cylinders)
  const bondIndexToMesh = new Array(bonds.length).fill(null);
  const meshUuidToBondIndex = new Map();
  const shouldCreateBonds =
    createBonds &&
    (!skipBondsOverAtomThreshold || atoms.length <= skipBondsOverAtomThreshold);
  if (bonds.length && shouldCreateBonds) {
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

    bonds.forEach((bond, bondIndex) => {
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
          mesh.scale.set(bondRadiusFinal * 2, len, bondRadiusFinal * 2);
          // orient: Y axis → dir
          mesh.quaternion.setFromUnitVectors(up, dirVec.clone().normalize());
          mesh.position.copy(mid);
          // Attach bond metadata to mesh for picking
          mesh.userData.role = 'bond';
          mesh.userData.bond = {
            index: bondIndex,
            beginAtomIndex: (bond.beginAtomIdx ?? 1) - 1,
            endAtomIndex: (bond.endAtomIdx ?? 1) - 1,
            order,
            aromatic: isAromatic || undefined,
          };
          group.add(mesh);
          bondIndexToMesh[bondIndex] = mesh;
          meshUuidToBondIndex.set(mesh.uuid, bondIndex);
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
        if (bond.stereo === 1) addSolidWedge(a, b, bondRadiusFinal, group, up);
        else if (bond.stereo === 6)
          addHashedWedge(a, b, bondRadiusFinal, group, up);
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

  // Metadata & result structure
  const firstLine = (mainText.split('\n')[0] || '').trim();
  const isV3000 = /^\s*M\s+V30\b/m.test(mainText);
  const loadResult = {
    root: group,
    atomsGroup: (() => {
      const g = new THREE.Group();
      g.name = 'atoms';
      return g;
    })(),
    bondsGroup: (() => {
      const g = new THREE.Group();
      g.name = 'bonds';
      return g;
    })(),
    metadata: {
      atomCount: atoms.length,
      bondCount: bonds.length,
      title: firstLine || undefined,
      sdfFormatVersion: isV3000 ? 'V3000' : 'V2000',
      source: 'other',
    },
    mappings: {
      atomIndexToMesh: instancing ? undefined : atomIndexToMesh,
      meshUuidToAtomIndex: instancing ? undefined : meshUuidToAtomIndex,
      instancedAtoms: instancing
        ? {
            mesh: group.children.find((c) => c.isInstancedMesh) || null,
            instanceToAtomIndex:
              group.children.find((c) => c.isInstancedMesh)?.userData
                .instanceToAtomIndex || new Uint32Array(),
          }
        : undefined,
      bondIndexToMesh,
      meshUuidToBondIndex,
    },
    chemistry: {
      atoms: chemistryAtoms,
      bonds: chemistryBonds,
    },
  };

  group.userData.loadResult = loadResult;

  if (typeof onProgress === 'function') onProgress('done', 1.0);

  return group;
}

export function parseSDF(text, options = {}) {
  if (/^\s*M\s+V30\b/m.test(text)) return parseV3000(text);
  if (parseSDFInternal) {
    const result = parseSDFInternal(text, options);
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

/**
 * Structured result API: returns LoadResult in addition to creating a THREE.Group.
 * Non-breaking: existing loadSDF keeps returning Group, while attaching the result
 * to group.userData.loadResult. This helper simply exposes the structure.
 */
export function loadSDFResult(text, options = {}) {
  const group = loadSDF(text, options);
  return group.userData.loadResult;
}
