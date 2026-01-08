'use strict';

var THREE = require('three');
var sdfParser = require('sdf-parser');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var THREE__namespace = /*#__PURE__*/_interopNamespaceDefault(THREE);

/* eslint-disable prefer-destructuring, no-use-before-define */


// ─── shared geometry caches ────────────────────────────────────────────────
const SPHERE_GEO_CACHE = new Map(); // key: `${radius}|${segments}` → SphereGeometry
const CYLINDER_GEO = new THREE__namespace.CylinderGeometry(1, 1, 1, 8); // reused
const CONE_GEO = new THREE__namespace.ConeGeometry(2, 1, 8, 1, true);

/** Normalize SDF text: Unix newlines, trimmed BOM/leading blanks. */
function normalizeSDFText(text) {
  if (typeof text !== 'string') return '';
  let normalized = text.replace(/\r\n?/g, '\n');
  if (normalized.charCodeAt(0) === 0xfeff) normalized = normalized.slice(1);
  normalized = normalized.replace(/^(?:[ \t]*\n)+/, '');
  return normalized;
}

/** Light canonicalization for V2000 molfiles: ensure newline after M  END. */
function canonicalizeV2000(text) {
  if (typeof text !== 'string') return '';
  if (/^\s*M\s+V30\b/m.test(text)) return text; // leave V3000 untouched
  let canonical = text.replace(/\s+$/, '');
  canonical = canonical.replace(/(M\s+END)(?!\n)/g, '$1\n');
  return canonical;
}

function decodeV2000ChargeCode(code) {
  // MDL V2000 atom-line charge codes:
  // 1=+3, 2=+2, 3=+1, 5=-1, 6=-2, 7=-3 (0 or others => 0)
  switch (code) {
    case 1:
      return 3;
    case 2:
      return 2;
    case 3:
      return 1;
    case 5:
      return -1;
    case 6:
      return -2;
    case 7:
      return -3;
    default:
      return 0;
  }
}

function applyV2000ChargesFromText(text, atomsInput) {
  if (typeof text !== 'string') return;
  if (!Array.isArray(atomsInput) || atomsInput.length === 0) return;
  if (/^\s*M\s+V30\b/m.test(text)) return;

  const atoms = atomsInput;
  const lines = text.replace(/\r/g, '').split('\n');
  const countsLineIndex = lines.findIndex((ln) => /^\s*-?\d+\s+-?\d+/.test(ln));
  if (countsLineIndex < 0) return;

  const rawCounts = lines[countsLineIndex] || '';
  const countsLine = rawCounts.trimStart();
  const atomsFW = Number(countsLine.slice(0, 3));
  const bondsFW = Number(countsLine.slice(3, 6));
  let natoms = atomsFW;
  let nbonds = bondsFW;
  const needsFallback =
    !Number.isFinite(natoms) || !Number.isFinite(nbonds) || natoms <= 0 || nbonds < 0;

  if (needsFallback) {
    const parts = countsLine.slice(0, 39).trim().split(/\s+/);
    if (/^\d{6}$/.test(parts[0])) {
      natoms = Number(parts[0].slice(0, 3));
      nbonds = Number(parts[0].slice(3));
    } else {
      natoms = Number(parts[0]);
      nbonds = Number(parts[1]);
    }
  }
  if (!Number.isFinite(natoms) || !Number.isFinite(nbonds)) return;

  // 1) Atom-line charge codes (apply only if non-zero).
  const atomsToScan = Math.min(natoms, atoms.length);
  for (let i = 0; i < atomsToScan; i += 1) {
    const l = lines[countsLineIndex + 1 + i] || '';
    let code;
    const fixed = l.slice(36, 39).trim();
    if (fixed) {
      const n = Number(fixed);
      if (Number.isFinite(n)) code = n;
    }
    if (code == null) {
      const parts = l.trim().split(/\s+/);
      if (parts.length >= 6) {
        const n = Number(parts[5]);
        if (Number.isFinite(n)) code = n;
      }
    }
    if (Number.isFinite(code)) {
      const charge = decodeV2000ChargeCode(code);
      if (charge !== 0) atoms[i].charge = charge;
    }
  }

  // 2) M  CHG lines override atom-line codes.
  const bondBlockEndIndex = countsLineIndex + 1 + natoms + nbonds;
  const mEndIndex = lines.findIndex(
    (ln, idx) => idx >= bondBlockEndIndex && ln.startsWith('M  END'),
  );
  const applyMChgLine = (ln) => {
    const parts = ln.trim().split(/\s+/);
    const n = Number(parts[2] || 0);
    if (!Number.isFinite(n) || n <= 0) return;
    for (let k = 0; k < n; k += 1) {
      const idx = Number(parts[3 + 2 * k]);
      const chg = Number(parts[4 + 2 * k]);
      if (Number.isFinite(idx) && Number.isFinite(chg) && atoms[idx - 1]) {
        atoms[idx - 1].charge = chg;
      }
    }
  };

  // Typical placement: between bond block and M  END
  const mEndStop = mEndIndex >= 0 ? mEndIndex : lines.length;
  for (let i = bondBlockEndIndex; i < mEndStop; i += 1) {
    const ln = lines[i] || '';
    if (ln.startsWith('M  CHG')) applyMChgLine(ln);
  }

  // Fallback: some non-standard files may place M  CHG after M  END
  if (mEndIndex >= 0) {
    for (let i = mEndIndex + 1; i < lines.length; i += 1) {
      const ln = lines[i] || '';
      if (ln.startsWith('M  CHG')) applyMChgLine(ln);
    }
  }
}

/** return memoised sphere geometry */
function getSphereGeometry(r, segments = 16) {
  const key = `${r}|${segments}`;
  if (!SPHERE_GEO_CACHE.has(key)) {
    SPHERE_GEO_CACHE.set(key, new THREE__namespace.SphereGeometry(r, segments, segments));
  }
  return SPHERE_GEO_CACHE.get(key);
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

// Optional alternative palettes (minimal starter set; falls back to DEFAULT_COLORS)
const JMOL_COLORS = {
  H: 0xffffff,
  HE: 0xd9ffff,
  LI: 0xcc80ff,
  BE: 0xc2ff00,
  B: 0xffb5b5,
  C: 0x909090,
  N: 0x3050f8,
  O: 0xff0d0d,
  F: 0x90e050,
  NE: 0xb3e3f5,
  NA: 0xab5cf2,
  MG: 0x8aff00,
  AL: 0xbfa6a6,
  SI: 0xf0c8a0,
  P: 0xff8000,
  S: 0xffff30,
  CL: 0x1ff01f,
  AR: 0x80d1e3,
  K: 0x8f40d4,
  CA: 0x3dff00,
  SC: 0xe6e6e6,
  TI: 0xbfc2c7,
  V: 0xa6a6ab,
  CR: 0x8a99c7,
  MN: 0x9c7ac7,
  FE: 0xe06633,
  CO: 0xf090a0,
  NI: 0x50d050,
  CU: 0xc88033,
  ZN: 0x7d80b0,
  GA: 0xc28f8f,
  GE: 0x668f8f,
  AS: 0xbd80e3,
  SE: 0xffa100,
  BR: 0xa62929,
  KR: 0x5cb8d1,
  RB: 0x702eb0,
  SR: 0x00ff00,
  Y: 0x94ffff,
  ZR: 0x94e0e0,
  NB: 0x73c2c9,
  MO: 0x54b5b5,
  TC: 0x3b9e9e,
  RU: 0x248f8f,
  RH: 0x0a7d8c,
  PD: 0x006985,
  AG: 0xc0c0c0,
  CD: 0xffb5b5,
  IN: 0xa67573,
  SN: 0x668080,
  SB: 0x9e63b5,
  TE: 0xd47a00,
  I: 0x940094,
  XE: 0x429eb0,
};
// Material-style palette (muted defaults derived from DEFAULT_COLORS with tweaks)
const MD_COLORS = {
  H: 0xffffff,
  C: 0x9e9e9e,
  N: 0x2196f3,
  O: 0xf44336,
  F: 0x4caf50,
  CL: 0x4caf50,
  BR: 0xff7043,
  I: 0x9c27b0,
  P: 0xff9800,
  S: 0xffeb3b,
  SI: 0xffcc80,
  FE: 0xff5722,
  CU: 0xb87333,
  ZN: 0x607d8b,
};

// Approximate van der Waals radii in Å scaled down (scene units)
const DEFAULT_RADII = {
  H: 0.25,
  C: 0.35,
  N: 0.33,
  O: 0.33,
  F: 0.32,
  CL: 0.4,
  BR: 0.45,
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
});

const GENERIC_RADIUS = 0.45; // fallback for any unknown element
// Atomic numbers table (1–118). Symbols are uppercased to match internal normalization.
const ATOMIC_NUMBERS = {
  H: 1, HE: 2, LI: 3, BE: 4, B: 5, C: 6, N: 7, O: 8, F: 9, NE: 10,
  NA: 11, MG: 12, AL: 13, SI: 14, P: 15, S: 16, CL: 17, AR: 18, K: 19, CA: 20,
  SC: 21, TI: 22, V: 23, CR: 24, MN: 25, FE: 26, CO: 27, NI: 28, CU: 29, ZN: 30,
  GA: 31, GE: 32, AS: 33, SE: 34, BR: 35, KR: 36, RB: 37, SR: 38, Y: 39, ZR: 40,
  NB: 41, MO: 42, TC: 43, RU: 44, RH: 45, PD: 46, AG: 47, CD: 48, IN: 49, SN: 50,
  SB: 51, TE: 52, I: 53, XE: 54, CS: 55, BA: 56, LA: 57, CE: 58, PR: 59, ND: 60,
  PM: 61, SM: 62, EU: 63, GD: 64, TB: 65, DY: 66, HO: 67, ER: 68, TM: 69, YB: 70,
  LU: 71, HF: 72, TA: 73, W: 74, RE: 75, OS: 76, IR: 77, PT: 78, AU: 79, HG: 80,
  TL: 81, PB: 82, BI: 83, PO: 84, AT: 85, RN: 86, FR: 87, RA: 88, AC: 89, TH: 90,
  PA: 91, U: 92, NP: 93, PU: 94, AM: 95, CM: 96, BK: 97, CF: 98, ES: 99, FM: 100,
  MD: 101, NO: 102, LR: 103, RF: 104, DB: 105, SG: 106, BH: 107, HS: 108, MT: 109,
  DS: 110, RG: 111, CN: 112, NH: 113, FL: 114, MC: 115, LV: 116, TS: 117, OG: 118,
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
// Transition-metal focused subset for safer default coordination inference
const TRANSITION_METALS = new Set([
  'SC','TI','V','CR','MN','FE','CO','NI','CU','ZN',
  'Y','ZR','NB','MO','TC','RU','RH','PD','AG','CD',
  'HF','TA','W','RE','OS','IR','PT','AU','HG',
]);
// Distance cutoff (Å) for metal–ligand coordination bond inference (hard minimum)
const DEFAULT_CUTOFF = 3.0;
// Relative factor multiplier on closest ligand distance (adaptive for 2-D layouts)
const DEFAULT_REL_FACTOR = 1.4;

function applyIsolatedIonSeparation2D(atoms, bonds, options = {}) {
  const {
    enabled = false,
    clearanceFrac = 0.25,
    maxIterations = 8,
    elementRadii = {},
    atomGeoRadiusOverride,
    style = 'ballStick',
    hiddenSet,
    coordScale = 1.0,
  } = options;

  if (!enabled) return;
  if (!Array.isArray(atoms) || atoms.length < 2) return;

  const scale = Number(coordScale);
  if (!Number.isFinite(scale) || scale <= 0) return;

  const degrees = new Array(atoms.length).fill(0);
  (bonds || []).forEach((b) => {
    const a = (b.beginAtomIdx ?? b.a ?? 1) - 1;
    const c = (b.endAtomIdx ?? b.b ?? 1) - 1;
    if (a >= 0 && a < degrees.length) degrees[a] += 1;
    if (c >= 0 && c < degrees.length) degrees[c] += 1;
  });

  let styleRadiusScale = 1.0;
  if (style === 'spaceFill') styleRadiusScale = 2.0;
  else if (style === 'licorice') styleRadiusScale = 0.8;

  const radii = atoms.map((atom) => {
    const symUpper = (atom?.symbol || atom?.element || '').toUpperCase();
    return (
      (atomGeoRadiusOverride ??
        elementRadii[symUpper] ??
        DEFAULT_RADII[symUpper] ??
        GENERIC_RADIUS) * styleRadiusScale
    );
  });

  const isolated = [];
  for (let i = 0; i < atoms.length; i += 1) {
    if (degrees[i] !== 0) continue;
    const atom = atoms[i];
    if (!atom) continue;
    const symUpper = (atom.symbol || atom.element || '').toUpperCase();
    if (hiddenSet && hiddenSet.has(symUpper)) continue;
    const q = Number(atom.charge ?? atom.formalCharge ?? 0);
    if (!Number.isFinite(q) || q === 0) continue;
    isolated.push(i);
  }
  if (isolated.length === 0) return;

  const clearance = Math.max(0, Number(clearanceFrac) || 0);
  const iters = Math.max(0, Math.min(64, Math.floor(Number(maxIterations) || 0)));
  const GOLDEN_ANGLE = 2.399963229728653;

  for (let iter = 0; iter < iters; iter += 1) {
    let moved = false;
    for (let k = 0; k < isolated.length; k += 1) {
      const i = isolated[k];
      const ai = atoms[i];
      if (!ai) continue;
      const xi = ai.x;
      const yi = ai.y;
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;

      let nearestJ = -1;
      let nearestDist = Infinity;
      let dxBest = 0;
      let dyBest = 0;

      for (let j = 0; j < atoms.length; j += 1) {
        if (j === i) continue;
        const aj = atoms[j];
        if (!aj) continue;
        const xj = aj.x;
        const yj = aj.y;
        if (!Number.isFinite(xj) || !Number.isFinite(yj)) continue;
        const dx = xi - xj;
        const dy = yi - yj;
        const d = Math.hypot(dx, dy);
        if (d < nearestDist) {
          nearestDist = d;
          nearestJ = j;
          dxBest = dx;
          dyBest = dy;
        }
      }

      if (nearestJ < 0 || !Number.isFinite(nearestDist)) continue;

      const minDistRaw = ((radii[i] + radii[nearestJ]) * (1 + clearance)) / scale;
      if (!(nearestDist < minDistRaw)) continue;

      let ux;
      let uy;
      if (nearestDist > 1e-6) {
        ux = dxBest / nearestDist;
        uy = dyBest / nearestDist;
      } else {
        const angle = (i * GOLDEN_ANGLE) % (Math.PI * 2);
        ux = Math.cos(angle);
        uy = Math.sin(angle);
      }

      const push = minDistRaw - nearestDist;
      ai.x = xi + ux * push;
      ai.y = yi + uy * push;
      moved = true;
    }
    if (!moved) break;
  }
}

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
    renderStereoBonds = false,
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
    materialFactory,
    units = 'angstrom',
    index = 0,
    instancedBonds = false,
    headless = false,
    hideIsolatedAtoms = false,
    isolatedAtomCutoff = DEFAULT_CUTOFF,
    // 2D salt layout: push isolated charged ions apart to avoid disc overlap
    separateIsolatedIons2D = false,
    isolatedIons2DClearanceFrac = 0.25,
    isolatedIons2DMaxIterations = 8,
    // coordination inference controls
    coordinationMode, // 'none' | 'transitionOnly' | 'all' (default handled below)
    suppressOppositeChargeCoordination = true,
    relFactor = DEFAULT_REL_FACTOR,
    cutoff = DEFAULT_CUTOFF,
  } = options;

  // Defer options snapshot until group is created

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
  const atomSegments = atomGeometry?.widthSegments ?? atomGeometry?.segments ?? performance?.atomSegments ?? 16;
  const bondRadiusFinal = bondGeometry?.radius ?? bondRadius;
  const bondSegments = bondGeometry?.segments ?? performance?.bondSegments ?? 8;
  const skipBondsOverAtomThreshold = performance?.skipBondsOverAtomThreshold;
  const buildBondBVH = performance?.buildBondBVH !== false;
  const usePCANormal = performance?.usePCANormal === true;
  // Palette selection: 'default' | 'jmol' | 'material'
  const paletteName = options.palette || 'default';
  const PALETTES = { default: DEFAULT_COLORS, jmol: JMOL_COLORS, material: MD_COLORS };
  const ACTIVE_PALETTE = PALETTES[paletteName] || DEFAULT_COLORS;
  const style = options.style || 'ballStick';

  if (typeof onProgress === 'function') onProgress('parse:start', 0);

  // Support multi-record SDF: split into records, pick first for rendering
  const normalizedText = normalizeSDFText(text);
  const recordsSplit = normalizedText
    .split(/\$\$\$\$\s*/)
    .filter((s) => s && s.trim().length > 0);
  const selectedIndex = Math.max(0, Math.min(index || 0, Math.max(0, recordsSplit.length - 1)));
  const mainText = recordsSplit[selectedIndex] ?? normalizedText;

  // Build hidden elements set
  const hiddenSet = new Set(hiddenElements.map((e) => e.toUpperCase()));
  if (!showHydrogen) hiddenSet.add('H'); // retain legacy flag

  // Parse using resilient helper (handles arrays, V3000, fallback)
  const mol = parseSDF(mainText, options);
  const { atoms = [], bonds = [] } = mol ?? {};

  if (typeof onProgress === 'function') onProgress('parse:done', 0.2);

  // ── Determine 2‑D vs 3‑D layout ──
  let layoutMode = layout;
  if (layoutMode === 'auto') {
    const maxZ = atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);
    layoutMode = maxZ < 1e-4 ? '2d' : '3d';
  }

  // ── Automatic metal–ligand bond inference ──
  let coordinationModeFinal = coordinationMode ?? 'transitionOnly';
  if (options.autoDetectMetalBonds === false) {
    coordinationModeFinal = 'none';
  } else if (options.autoDetectMetalBonds === true && coordinationMode == null) {
    coordinationModeFinal = 'all';
  }
  let metalSet;
  if (coordinationModeFinal === 'none') metalSet = new Set();
  else if (coordinationModeFinal === 'all') metalSet = DEFAULT_METALS;
  else metalSet = TRANSITION_METALS;

  const metalUnbonded =
    coordinationModeFinal !== 'none' &&
    atoms.some((a, i) => {
      if (!metalSet.has(a.symbol.toUpperCase())) return false;
      return bonds.every(
        (b) => b.beginAtomIdx !== i + 1 && b.endAtomIdx !== i + 1,
      );
    });

  if (layoutMode === '3d' || metalUnbonded) {
    if (coordinationModeFinal !== 'none') {
      inferCoordinationBonds(atoms, bonds, {
        metals: metalSet,
        cutoff,
        relFactor,
        suppressOppositeChargeCoordination,
      });
    }
  }

  // ── Automatic bridging bond inference ──
  // Support legacy option name for backward compatibility
  const shouldInferBridging = inferBridgingBonds ?? addThreeCenterBonds ?? true;

  if (shouldInferBridging) {
    addInferredBridgingBonds(atoms, bonds, hiddenSet);
  }

  if (layoutMode === '2d') {
    // Match the coordinate scaling used for atom positions (instanced path applies unitsScale).
    let unitsScale = 1.0;
    if (units === 'nm') unitsScale = 10.0;
    else if (units === 'angstrom' || units === 'scene') unitsScale = 1.0;
    const coordScale = instancing ? coordinateScale * unitsScale : coordinateScale;

    applyIsolatedIonSeparation2D(atoms, bonds, {
      enabled: separateIsolatedIons2D,
      clearanceFrac: isolatedIons2DClearanceFrac,
      maxIterations: isolatedIons2DMaxIterations,
      elementRadii,
      atomGeoRadiusOverride,
      style,
      hiddenSet,
      coordScale,
    });
  }
  const group = new THREE__namespace.Group();
  group.name = 'molecule';
  group.userData.layoutMode = layoutMode;
  // Snapshot of normalized options for reproducibility/debugging
  group.userData.optionsUsed = {
    includeHydrogens: showHydrogen,
    layout,
    hiddenElements,
    elementColors,
    elementRadii,
    attachAtomData,
    attachProperties,
    renderMultipleBonds,
    renderStereoBonds,
    multipleBondOffset,
    useCylinders,
    bondRadius: bondRadiusFinal,
    bondSegments,
    atomGeometry: {
      type: atomGeoType,
      radius: atomGeoRadiusOverride,
      segments: atomSegments,
      detail: atomGeometry?.detail ?? 0,
    },
    coordinateScale,
    performance,
    instancing,
    createBonds,
    separateIsolatedIons2D,
    isolatedIons2DClearanceFrac,
    isolatedIons2DMaxIterations,
  };
  // Objects are added directly to root group to preserve existing scene graph expectations

  // Prepare chemistry arrays (0-based indices aligned to SDF blocks)
  const aromaticAtomSet = new Set();
  const chemistryBonds = bonds.map((bond, i) => {
    const begin = (bond.beginAtomIdx ?? bond.a ?? 1) - 1;
    const end = (bond.endAtomIdx ?? bond.b ?? 1) - 1;
    const originalOrder = bond.order ?? 1;
    const isAromatic = originalOrder === 4;
    const isCoordination = originalOrder === 0;
    const isBridge = bond.isBridge === true;
    if (isAromatic) {
      aromaticAtomSet.add(begin);
      aromaticAtomSet.add(end);
    }
    // Normalize stereo flag into small enum for rendering guidance
    let stereo;
    if (bond.stereo === 1) stereo = 'up';
    else if (bond.stereo === 6) stereo = 'down';
    else if (bond.stereo && bond.order === 1) stereo = 'wavy';

    return {
      index: i,
      beginAtomIndex: begin,
      endAtomIndex: end,
      order: Math.max(1, Math.min(4, originalOrder || 1)),
      originalOrder,
      aromatic: isAromatic || undefined,
      isAromatic: isAromatic || undefined,
      isCoordination: isCoordination || undefined,
      isBridge: isBridge || undefined,
      source: bond.source || 'molfile',
      stereo,
    };
  });

  const chemistryAtoms = atoms.map((atom, i) => {
    const symUpper = (atom.symbol || atom.element || '').toUpperCase();
    return {
      index: i,
      element: symUpper || '',
      atomicNumber: ATOMIC_NUMBERS[symUpper],
      formalCharge: atom.charge ?? atom.formalCharge ?? 0,
      aromatic: aromaticAtomSet.has(i) || undefined,
      x: atom.x,
      y: atom.y,
      z: atom.z,
    };
  });

  if (typeof onProgress === 'function') onProgress('atoms:start', 0.3);

  // Find atoms involved in stereo bonds.
  // IMPORTANT: Only track atoms that will actually be rendered (not hidden).
  // Otherwise, if an endpoint (commonly H when showHydrogen=false) is hidden but we
  // still preserve its position, we can end up rendering a wedge/hash bond to nowhere.
  const stereoAtomIndices = new Set();
  const maybeAddStereoAtomIndex = (atomIndex) => {
    if (typeof atomIndex !== 'number' || atomIndex < 0) return;
    const symUpper = (atoms[atomIndex]?.symbol || atoms[atomIndex]?.element || '').toUpperCase();
    if (!hiddenSet.has(symUpper)) stereoAtomIndices.add(atomIndex);
  };
  bonds.forEach((bond) => {
    if (bond.stereo && bond.order === 1) {
      const begin = (bond.beginAtomIdx ?? bond.a ?? 1) - 1;
      const end = (bond.endAtomIdx ?? bond.b ?? 1) - 1;
      maybeAddStereoAtomIndex(begin);
      maybeAddStereoAtomIndex(end);
    }
  });

  // Optionally determine isolated atoms (no bonds, far from any neighbor)
  const isolatedAtomIndices = new Set();
  if (hideIsolatedAtoms) {
    const degrees = new Array(atoms.length).fill(0);
    bonds.forEach((b) => {
      const a = (b.beginAtomIdx ?? 1) - 1;
      const c = (b.endAtomIdx ?? 1) - 1;
      if (a >= 0 && a < degrees.length) degrees[a] += 1;
      if (c >= 0 && c < degrees.length) degrees[c] += 1;
    });
    for (let i = 0; i < atoms.length; i += 1) {
      if (degrees[i] > 0) ; else {
        // compute nearest neighbor distance
        let dmin = Infinity;
        const ai = atoms[i];
        for (let j = 0; j < atoms.length; j += 1) {
          if (i === j) ; else {
            const aj = atoms[j];
            const dx = ai.x - aj.x;
            const dy = ai.y - aj.y;
            const dz = ai.z - aj.z;
            const d = Math.hypot(dx, dy, dz);
            if (d < dmin) dmin = d;
          }
        }
        if (dmin > isolatedAtomCutoff) isolatedAtomIndices.add(i);
      }
    }
  }

  // Build atom meshes and positions
  const atomPositions = [];
  const atomIndexToMesh = new Array(atoms.length).fill(null);
  const meshUuidToAtomIndex = new Map();

  // Instancing path: single InstancedMesh of spheres (uniform geometry)
  let instancedMesh = null;
  // Units scaling: convert input units to internal angstrom-like scene units
  let unitsScale = 1.0;
  if (units === 'nm') unitsScale = 10.0; // 1 nm = 10 Å
  else if (units === 'angstrom' || units === 'scene') unitsScale = 1.0;
  const coordScale = coordinateScale * unitsScale;

  if (headless) {
    // Chemistry-only path: attach result and return empty group
    const firstLine = (mainText.split('\n')[0] || '').trim();
    const isV3000 = /^\s*M\s+V30\b/m.test(mainText);
    const loadResult = {
      root: group,
      metadata: {
        atomCount: atoms.length,
        bondCount: bonds.length,
        title: firstLine || undefined,
        sdfFormatVersion: isV3000 ? 'V3000' : 'V2000',
        source: 'other',
      },
      mappings: {},
      chemistry: {
        atoms: chemistryAtoms,
        bonds: chemistryBonds,
      },
    };
    group.userData.loadResult = loadResult;
    if (typeof onProgress === 'function') onProgress('done', 1.0);
    return group;
  }

  if (instancing) {
    const visibleAtoms = [];
    atoms.forEach((atom, i) => {
      const symUpper = (atom.symbol || '').toUpperCase();
      if (!hiddenSet.has(symUpper) && !isolatedAtomIndices.has(i)) visibleAtoms.push({ atom, i });
      if (!hiddenSet.has(symUpper) || stereoAtomIndices.has(i)) {
        atomPositions[i] = new THREE__namespace.Vector3(
          atom.x * coordScale,
          atom.y * coordScale,
          atom.z * coordScale,
        );
      }
    });

    const instanceCount = visibleAtoms.length;
    // Style presets affect radius and bonds
    let styleRadiusScale = 1.0;
    if (style === 'spaceFill') styleRadiusScale = 2.0;
    else if (style === 'licorice') styleRadiusScale = 0.8;
    const baseRadius = (atomGeoRadiusOverride ?? GENERIC_RADIUS) * styleRadiusScale;
    const geometry =
      atomGeoType === 'sphere'
        ? getSphereGeometry(baseRadius, atomSegments)
        : new THREE__namespace.IcosahedronGeometry(baseRadius, atomGeometry?.detail ?? 0);
    const defaultInstancedMat = new THREE__namespace.MeshBasicMaterial({ vertexColors: true });
    const material =
      typeof materialFactory === 'function'
        ? materialFactory('atomInstanced', defaultInstancedMat)
        : defaultInstancedMat;
    const imesh = new THREE__namespace.InstancedMesh(geometry, material, instanceCount);
    imesh.instanceMatrix.setUsage(THREE__namespace.DynamicDrawUsage);
    const dummy = new THREE__namespace.Object3D();
    const instanceToAtomIndex = new Uint32Array(instanceCount);
    const instanceColors = new Float32Array(instanceCount * 3);

    visibleAtoms.forEach(({ atom, i }, instanceId) => {
      dummy.position.set(
       atom.x * coordScale,
       atom.y * coordScale,
       atom.z * coordScale,
      );
      dummy.updateMatrix();
      imesh.setMatrixAt(instanceId, dummy.matrix);
      instanceToAtomIndex[instanceId] = i;
      const sym = (atom.symbol || '').toUpperCase();
      const paletteColor = ACTIVE_PALETTE[sym] ?? 0xffffff;
      const color = new THREE__namespace.Color(elementColors[sym] ?? paletteColor);
      instanceColors[instanceId * 3 + 0] = color.r;
      instanceColors[instanceId * 3 + 1] = color.g;
      instanceColors[instanceId * 3 + 2] = color.b;
    });

    imesh.userData.role = 'atomsInstanced';
    imesh.userData.instanceToAtomIndex = instanceToAtomIndex;
    imesh.instanceColor = new THREE__namespace.InstancedBufferAttribute(instanceColors, 3);
    imesh.instanceColor.needsUpdate = true;
    imesh.userData.atomMeta = {
      elementByAtomIndex: chemistryAtoms.map((a) => a.element),
      atomicNumberByAtomIndex: chemistryAtoms.map((a) => a.atomicNumber ?? 0),
      formalChargeByAtomIndex: chemistryAtoms.map((a) => a.formalCharge ?? 0),
      aromaticByAtomIndex: chemistryAtoms.map((a) => !!a.aromatic),
    };

    group.add(imesh);
    instancedMesh = imesh;

    // In instanced mode we do not populate atomIndexToMesh / meshUuidToAtomIndex
  } else {
    atoms.forEach((atom, i) => {
      const { x, y, z, symbol } = atom;
      const symUpper = (symbol || '').toUpperCase();

      // Store position for visible atoms or atoms involved in stereo bonds
      if (!hiddenSet.has(symUpper) || stereoAtomIndices.has(i)) {
        atomPositions[i] = new THREE__namespace.Vector3(
          x * coordScale,
          y * coordScale,
          z * coordScale,
        );
      }

      // Only create mesh for visible atoms
      if (hiddenSet.has(symUpper) || isolatedAtomIndices.has(i)) return;

      let styleRadiusScale = 1.0;
      if (style === 'spaceFill') styleRadiusScale = 2.0;
      else if (style === 'licorice') styleRadiusScale = 0.8;
      const radius =
        (atomGeoRadiusOverride ??
        elementRadii[symUpper] ??
        DEFAULT_RADII[symUpper] ??
        GENERIC_RADIUS) * styleRadiusScale;
      const paletteColor = ACTIVE_PALETTE[symUpper] ?? 0xffffff;
      const color = elementColors[symUpper] ?? paletteColor;

      const geometry =
        atomGeoType === 'sphere'
          ? getSphereGeometry(radius, atomSegments)
          : new THREE__namespace.IcosahedronGeometry(radius, atomGeometry?.detail ?? 0);
      const defaultAtomMat = new THREE__namespace.MeshBasicMaterial({ color });
      const material =
        typeof materialFactory === 'function'
          ? materialFactory('atom', defaultAtomMat)
          : defaultAtomMat;
      const mesh = new THREE__namespace.Mesh(geometry, material);
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
  let instancedBondMesh = null; // declared outside bonds block for loadResult mapping
  const shouldCreateBonds =
    createBonds &&
    (!skipBondsOverAtomThreshold || atoms.length <= skipBondsOverAtomThreshold);
  if (bonds.length && shouldCreateBonds) {
    if (typeof onProgress === 'function') onProgress('bonds:start', 0.65);
    const verts = [];
    const segmentBondIndexList = [];
    const up = new THREE__namespace.Vector3(0, 1, 0);

  // Shared resources for cylinder mode
  const cylGeo = useCylinders ? new THREE__namespace.CylinderGeometry(1, 1, 1, bondSegments) : null;
    const defaultCylMat = new THREE__namespace.MeshBasicMaterial({ color: 0xaaaaaa });
    let cylMat = null;
    if (useCylinders) {
      cylMat =
        typeof materialFactory === 'function'
          ? materialFactory('bondCylinder', defaultCylMat)
          : defaultCylMat;
    }

    /* ── Compute molecule plane normal: PCA or fallback ── */
    const planeNormal = (() => {
      if (atoms.length < 3) return up.clone();
      if (!usePCANormal) {
        // Fallback to triangle-based normal
        const pts = atoms.map((a) => new THREE__namespace.Vector3(a.x, a.y, a.z));
        for (let i = 0; i < pts.length - 2; i += 1) {
          for (let j = i + 1; j < pts.length - 1; j += 1) {
            for (let k = j + 1; k < pts.length; k += 1) {
              const v1 = new THREE__namespace.Vector3().subVectors(pts[j], pts[i]);
              const v2 = new THREE__namespace.Vector3().subVectors(pts[k], pts[i]);
              const n = new THREE__namespace.Vector3().crossVectors(v1, v2);
              if (n.lengthSq() > 1e-6) return n.normalize();
            }
          }
        }
        return up.clone();
      }
      // PCA-based normal: smallest eigenvector of covariance
      const n = atoms.length;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < n; i += 1) { cx += atoms[i].x; cy += atoms[i].y; cz += atoms[i].z; }
      cx /= n; cy /= n; cz /= n;
      let xx = 0; let xy = 0; let xz = 0; let yy = 0; let yz = 0; let zz = 0;
      for (let i = 0; i < n; i += 1) {
        const dx = atoms[i].x - cx;
        const dy = atoms[i].y - cy;
        const dz = atoms[i].z - cz;
        xx += dx * dx; xy += dx * dy; xz += dx * dz;
        yy += dy * dy; yz += dy * dz; zz += dz * dz;
      }
      // Symmetric 3x3 eigen decomposition via power iterations on inverse (smallest eigenvector)
      const cov = [xx, xy, xz, xy, yy, yz, xz, yz, zz];
      // Start with arbitrary vector
      let vx = 1; let vy = 0; let vz = 0;
      const solve = (a, b, c) => ([
        cov[0] * a + cov[1] * b + cov[2] * c,
        cov[3] * a + cov[4] * b + cov[5] * c,
        cov[6] * a + cov[7] * b + cov[8] * c,
      ]);
      // Power iteration on inverse by shifting with a large lambda to approximate smallest eigenvector
      for (let it = 0; it < 20; it += 1) {
        const [sx, sy, sz] = solve(vx, vy, vz);
        // Simple orthonormalize/normalize
        const len = Math.hypot(sx, sy, sz) || 1;
        vx = sx / len; vy = sy / len; vz = sz / len;
      }
      const v = new THREE__namespace.Vector3(vx, vy, vz);
      if (v.lengthSq() < 1e-6) return up.clone();
      return v.normalize();
    })();

    const instances = instancedBonds && useCylinders ? bonds.length : 0;
    let instanceIndex = 0;
    let dummy;
    // For instanced bonds: track instance-to-bond mapping and bond metadata table
    const instanceToBondIndex = instances > 0 ? [] : null;
    const bondTable = instances > 0 ? [] : null;
    if (instances > 0) {
      const baseGeo = cylGeo;
      const defaultCylMat2 = new THREE__namespace.MeshBasicMaterial({ color: 0xaaaaaa });
      const mat2 =
        typeof materialFactory === 'function'
          ? materialFactory('bondCylinder', defaultCylMat2)
          : defaultCylMat2;
      instancedBondMesh = new THREE__namespace.InstancedMesh(baseGeo, mat2, instances);
      instancedBondMesh.instanceMatrix.setUsage(THREE__namespace.DynamicDrawUsage);
      dummy = new THREE__namespace.Object3D();
    }

    bonds.forEach((bond, bondIndex) => {
      const a = atomPositions[bond.beginAtomIdx - 1];
      const b = atomPositions[bond.endAtomIdx - 1];
      if (!a || !b) return;

      // ── order & style ──
      const isAromatic = bond.order === 4;
      const isBridge = bond.isBridge === true;
      const originalOrder = bond.order ?? 1;
      const isCoordination = originalOrder === 0;
      let order = originalOrder;
      if (order < 1 || order > 3) order = 1; // 0,4,8,9 → single

      // Precompute bond metadata (also used for stereo meshes + picking)
      const beginAtomIndex = (bond.beginAtomIdx ?? bond.a ?? 1) - 1;
      const endAtomIndex = (bond.endAtomIdx ?? bond.b ?? 1) - 1;
      let stereo;
      if (bond.stereo === 1) stereo = 'up';
      else if (bond.stereo === 6) stereo = 'down';
      else if (bond.stereo && originalOrder === 1) stereo = 'wavy';

      const bondMeta = {
        index: bondIndex,
        beginAtomIndex,
        endAtomIndex,
        order,
        originalOrder,
        aromatic: isAromatic || undefined,
        isAromatic: isAromatic || undefined,
        isCoordination: isCoordination || undefined,
        isBridge: isBridge || undefined,
        source: bond.source || 'molfile',
        stereo,
      };

      // Build bond metadata table for instanced bonds
      if (bondTable) {
        bondTable[bondIndex] = bondMeta;
      }

      const addBond = (offsetVec) => {
        const aOff = new THREE__namespace.Vector3().addVectors(a, offsetVec);
        const bOff = new THREE__namespace.Vector3().addVectors(b, offsetVec);

        if (useCylinders && !instancedBondMesh) {
          // Cylinder mesh between aOff and bOff
          const dirVec = new THREE__namespace.Vector3().subVectors(bOff, aOff);
          const len = dirVec.length();
          if (len < 1e-6) return;

          const mid = new THREE__namespace.Vector3()
            .addVectors(aOff, bOff)
            .multiplyScalar(0.5);
          const mesh = new THREE__namespace.Mesh(cylGeo, cylMat);
          // scale: radius in X/Z, length in Y (CYLINDER_GEO base radius is 1 ⇒ use r, not 2r)
          let styleBondScale = 1.0;
          if (style === 'licorice') styleBondScale = 1.5;
          else if (style === 'spaceFill') styleBondScale = 0.75;
          mesh.scale.set(bondRadiusFinal * styleBondScale, len, bondRadiusFinal * styleBondScale);
          // orient: Y axis → dir
          mesh.quaternion.setFromUnitVectors(up, dirVec.clone().normalize());
          mesh.position.copy(mid);
          // Attach bond metadata to mesh for picking
          mesh.userData.role = 'bond';
          mesh.userData.bond = bondMeta;
          group.add(mesh);
          bondIndexToMesh[bondIndex] = mesh;
          meshUuidToBondIndex.set(mesh.uuid, bondIndex);
        } else if (useCylinders && instancedBondMesh) {
          const dirVec = new THREE__namespace.Vector3().subVectors(bOff, aOff);
          const len = dirVec.length();
          if (len < 1e-6) return;
          const mid = new THREE__namespace.Vector3().addVectors(aOff, bOff).multiplyScalar(0.5);
          dummy.position.copy(mid);
          let styleBondScale = 1.0;
          if (style === 'licorice') styleBondScale = 1.5;
          else if (style === 'spaceFill') styleBondScale = 0.75;
          dummy.scale.set(bondRadiusFinal * styleBondScale, len, bondRadiusFinal * styleBondScale);
          dummy.quaternion.setFromUnitVectors(up, dirVec.clone().normalize());
          dummy.updateMatrix();
          instancedBondMesh.setMatrixAt(instanceIndex, dummy.matrix);
          // Track instance-to-bond mapping for metadata recovery
          instanceToBondIndex.push(bondIndex);
          instanceIndex += 1;
        } else if (isAromatic || isBridge || isCoordination) {
          const geom = new THREE__namespace.BufferGeometry().setFromPoints([aOff, bOff]);
          const dash = isAromatic ? 0.15 : 0.08; // finer pattern for bridges
           const defaultDashed = new THREE__namespace.LineDashedMaterial({
            color: 0xaaaaaa,
            dashSize: dash,
            gapSize: dash,
          });
          const dashedMat =
            typeof materialFactory === 'function'
              ? materialFactory('bondDashed', defaultDashed)
              : defaultDashed;
          const line = new THREE__namespace.Line(geom, dashedMat);
          line.computeLineDistances();
          group.add(line);
        } else {
          // line mode: push vertices and track bond index per segment
          verts.push(aOff.x, aOff.y, aOff.z);
          verts.push(bOff.x, bOff.y, bOff.z);
          segmentBondIndexList.push(bondIndex);
        }
      };

      // ── stereochemistry (wedge / hash) ──
      if (renderStereoBonds && bond.stereo && order === 1) {
        if (bond.stereo === 1) {
          const mesh = addSolidWedge(a, b, bondRadiusFinal, group, up);
          if (mesh) {
            mesh.userData.role = 'bond';
            mesh.userData.bond = bondMeta;
            bondIndexToMesh[bondIndex] = mesh;
            meshUuidToBondIndex.set(mesh.uuid, bondIndex);
          }
        } else if (bond.stereo === 6) {
          const wedgeGroup = addHashedWedge(a, b, bondRadiusFinal, group, up);
          if (wedgeGroup) {
            wedgeGroup.userData.role = 'bond';
            wedgeGroup.userData.bond = bondMeta;
            bondIndexToMesh[bondIndex] = wedgeGroup;
            wedgeGroup.traverse((o) => {
              const m = o;
              if (!m?.isMesh) return;
              m.userData.role = 'bond';
              m.userData.bond = bondMeta;
              meshUuidToBondIndex.set(m.uuid, bondIndex);
            });
          }
        } else {
          addBond(new THREE__namespace.Vector3(0, 0, 0)); // wavy fallback
        }
        return; // skip normal line rendering
      }

      if (!renderMultipleBonds || order === 1) {
        addBond(new THREE__namespace.Vector3(0, 0, 0));
      } else {
        // Offset lies in molecular plane: n × dir  (n = plane normal)
        const dir = new THREE__namespace.Vector3().subVectors(b, a).normalize();
        let side = new THREE__namespace.Vector3().crossVectors(planeNormal, dir);

        // Fallback to previous axis logic if side is too small (bond // planeNormal)
        if (side.lengthSq() < 1e-6) {
          const tryAxes = [
            up,
            new THREE__namespace.Vector3(0, 0, 1),
            new THREE__namespace.Vector3(1, 0, 0),
          ];
          for (let i = 0; i < tryAxes.length; i += 1) {
            const alt = new THREE__namespace.Vector3().crossVectors(dir, tryAxes[i]);
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
          addBond(new THREE__namespace.Vector3(0, 0, 0));
          addBond(side);
          addBond(side.clone().negate());
        }
      }
    });

    if (!useCylinders && verts.length) {
      const positions = new Float32Array(verts);
      const geom = new THREE__namespace.BufferGeometry();
      geom.setAttribute('position', new THREE__namespace.BufferAttribute(positions, 3));
      const defaultLine = new THREE__namespace.LineBasicMaterial({ color: 0xaaaaaa });
      const lineMat =
        typeof materialFactory === 'function'
          ? materialFactory('bondLine', defaultLine)
          : defaultLine;
      const lines = new THREE__namespace.LineSegments(geom, lineMat);
      lines.userData.role = 'bondsLineSegments';
      lines.userData.segmentToBondIndex = new Uint32Array(segmentBondIndexList);
      group.add(lines);
    }

    // Build BVH for line-mode bonds if requested
    if (!useCylinders && buildBondBVH && verts.length) {
      // Build simple median-split BVH over segments in world space
      const positionsAttr = new Float32Array(verts); // local coords (no scale/rotation applied to group here)
      const segmentCount = segmentBondIndexList.length;
      const indices = new Uint32Array(segmentCount);
      for (let i = 0; i < segmentCount; i += 1) indices[i] = i;
      const nodes = [];
      const makeAABB = (start, end) => {
        let minx = Infinity;
        let miny = Infinity;
        let minz = Infinity;
        let maxx = -Infinity;
        let maxy = -Infinity;
        let maxz = -Infinity;
        for (let s = start; s < end; s += 1) {
          const idx = indices[s] * 6;
          const ax = positionsAttr[idx + 0];
          const ay = positionsAttr[idx + 1];
          const az = positionsAttr[idx + 2];
          const bx = positionsAttr[idx + 3];
          const by = positionsAttr[idx + 4];
          const bz = positionsAttr[idx + 5];
          if (ax < minx) minx = ax; if (ay < miny) miny = ay; if (az < minz) minz = az;
          if (bx < minx) minx = bx; if (by < miny) miny = by; if (bz < minz) minz = bz;
          if (ax > maxx) maxx = ax; if (ay > maxy) maxy = ay; if (az > maxz) maxz = az;
          if (bx > maxx) maxx = bx; if (by > maxy) maxy = by; if (bz > maxz) maxz = bz;
        }
        return { min: [minx, miny, minz], max: [maxx, maxy, maxz] };
      };
      const build = (start, end, depth) => {
        const nodeIndex = nodes.length;
        const aabb = makeAABB(start, end);
        const count = end - start;
        if (count <= 8 || depth > 20) {
          nodes.push({ aabb, start, end, left: -1, right: -1 });
          return nodeIndex;
        }
        const extent = [
          aabb.max[0] - aabb.min[0],
          aabb.max[1] - aabb.min[1],
          aabb.max[2] - aabb.min[2],
        ];
        let axis = 0;
        if (extent[1] > extent[axis]) axis = 1;
        if (extent[2] > extent[axis]) axis = 2;
        const mid = (aabb.min[axis] + aabb.max[axis]) / 2;
        let i = start;
        let j = end - 1;
        while (i <= j) {
          const ii = indices[i] * 6;
          const cx = (positionsAttr[ii + 0] + positionsAttr[ii + 3]) * 0.5;
          const cy = (positionsAttr[ii + 1] + positionsAttr[ii + 4]) * 0.5;
          const cz = (positionsAttr[ii + 2] + positionsAttr[ii + 5]) * 0.5;
          let c = cx;
          if (axis === 1) c = cy; else if (axis === 2) c = cz;
          if (c < mid) i += 1;
          else {
            const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp; j -= 1;
          }
        }
        if (i === start || i === end) { nodes.push({ aabb, start, end, left: -1, right: -1 }); return nodeIndex; }
        const left = build(start, i, depth + 1);
        const right = build(i, end, depth + 1);
        nodes.push({ aabb, start, end, left, right });
        return nodeIndex;
      };
      const root = build(0, segmentCount, 0);
      group.userData.bondSegmentsBVH = { nodes, indices, positions: positionsAttr, segmentBondIndexList };
      group.userData.bondSegmentsBVH.root = root; // store root index
    }
    if (instancedBondMesh && instanceIndex > 0) {
      instancedBondMesh.count = instanceIndex;
      instancedBondMesh.instanceMatrix.needsUpdate = true;
      // Attach instanced bond metadata for picking/selection
      instancedBondMesh.userData.role = 'bondsInstanced';
      instancedBondMesh.userData.instanceToBondIndex = new Uint32Array(instanceToBondIndex);
      instancedBondMesh.userData.bondTable = bondTable;
      group.add(instancedBondMesh);
    }
    if (typeof onProgress === 'function') onProgress('bonds:done', 0.9);
  }

  if (attachProperties) {
    group.userData.properties = mol.properties ?? {};
  }

  // Metadata & result structure
  const firstLine = (mainText.split('\n')[0] || '').trim();
  const isV3000 = /^\s*M\s+V30\b/m.test(mainText);
  const loadResult = {
    root: group,
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
            mesh: instancedMesh,
            instanceToAtomIndex: instancedMesh?.userData?.instanceToAtomIndex || new Uint32Array(),
          }
        : undefined,
      bondIndexToMesh,
      meshUuidToBondIndex,
      instancedBonds: instancedBondMesh
        ? {
            mesh: instancedBondMesh,
            instanceToBondIndex: instancedBondMesh?.userData?.instanceToBondIndex || new Uint32Array(),
            bondTable: instancedBondMesh?.userData?.bondTable || [],
          }
        : undefined,
    },
    chemistry: {
      atoms: chemistryAtoms,
      bonds: chemistryBonds,
    },
  };

  group.userData.loadResult = loadResult;
  if (firstLine) group.name = firstLine;

  // Provide CPU-side helper for bond picking in line mode
  group.userData.pickBond = (rayLike, opts = {}) => {
    const threshold = Number.isFinite(opts.threshold)
      ? opts.threshold
      : Math.max(0.02, bondRadiusFinal * 1.5);
    let ray = null;
    if (rayLike && rayLike.isRaycaster) ray = rayLike.ray;
    else if (rayLike && rayLike.isRay) ray = rayLike;
    if (!ray) return null;

    let best = { bondIndex: -1, distanceSq: Infinity, point: null };
    const a = new THREE__namespace.Vector3();
    const b = new THREE__namespace.Vector3();
    const pr = new THREE__namespace.Vector3();
    const ps = new THREE__namespace.Vector3();

    const bvh = group.userData.bondSegmentsBVH;
    if (bvh && bvh.nodes && bvh.indices && bvh.positions) {
      const rayDirInv = new THREE__namespace.Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);
      const rayOrig = ray.origin;
      const stack = [bvh.root ?? 0];
      while (stack.length) {
        const ni = stack.pop();
        const node = bvh.nodes[ni];
        if (!node) ; else {
        const min = node.aabb.min;
        const max = node.aabb.max;
        // AABB-ray test (slab)
        const t1x = (min[0] - rayOrig.x) * rayDirInv.x;
        const t2x = (max[0] - rayOrig.x) * rayDirInv.x;
        let tmin = Math.min(t1x, t2x);
        let tmax = Math.max(t1x, t2x);
        const t1y = (min[1] - rayOrig.y) * rayDirInv.y;
        const t2y = (max[1] - rayOrig.y) * rayDirInv.y;
        tmin = Math.max(tmin, Math.min(t1y, t2y));
        tmax = Math.min(tmax, Math.max(t1y, t2y));
        const t1z = (min[2] - rayOrig.z) * rayDirInv.z;
        const t2z = (max[2] - rayOrig.z) * rayDirInv.z;
        tmin = Math.max(tmin, Math.min(t1z, t2z));
        tmax = Math.min(tmax, Math.max(t1z, t2z));
        if (tmax < Math.max(0, tmin)) ; else if (node.left === -1 && node.right === -1) {
          for (let s = node.start; s < node.end; s += 1) {
            const segIdx = bvh.indices[s];
            const i6 = segIdx * 6;
            a.set(bvh.positions[i6 + 0], bvh.positions[i6 + 1], bvh.positions[i6 + 2]);
            b.set(bvh.positions[i6 + 3], bvh.positions[i6 + 4], bvh.positions[i6 + 5]);
            const distSq = ray.distanceSqToSegment(a, b, pr, ps);
            if (distSq <= threshold * threshold && distSq < best.distanceSq) {
              best = { bondIndex: bvh.segmentBondIndexList[segIdx], distanceSq: distSq, point: ps.clone() };
            }
          }
        } else {
          if (node.left >= 0) stack.push(node.left);
          if (node.right >= 0) stack.push(node.right);
        }
        }
      }
    } else {
      group.children.forEach((obj) => {
        if (obj.type !== 'LineSegments') return;
        const pos = obj.geometry.getAttribute('position');
        const segToBond = obj.userData.segmentToBondIndex;
        if (!pos || !segToBond) return;
        for (let i = 0; i < segToBond.length; i += 1) {
          const idx = i * 2;
          a.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).applyMatrix4(obj.matrixWorld);
          b
            .set(pos.getX(idx + 1), pos.getY(idx + 1), pos.getZ(idx + 1))
            .applyMatrix4(obj.matrixWorld);
          const distSq = ray.distanceSqToSegment(a, b, pr, ps);
          if (distSq <= threshold * threshold && distSq < best.distanceSq) {
            best = { bondIndex: segToBond[i], distanceSq: distSq, point: ps.clone() };
          }
        }
      });
    }

    return best.bondIndex >= 0 ? best : null;
  };

  // Helper to translate raycast hit to atom index (instanced and non-instanced)
  group.userData.pickAtom = (hit) => {
    if (!hit || typeof hit !== 'object') return null;
    // Non-instanced meshes
    if (hit.object && hit.object.userData && hit.object.userData.role === 'atom') {
      return hit.object.userData.atom?.index ?? null;
    }
    // Instanced
    const inst = loadResult.mappings.instancedAtoms;
    if (inst && hit.instanceId != null) {
      const idx = inst.instanceToAtomIndex[hit.instanceId];
      return Number.isFinite(idx) ? idx : null;
    }
    return null;
  };

  // Expose centering and bounds utilities
  group.userData.computeBounds = () => {
    const box = new THREE__namespace.Box3().setFromObject(group);
    const sphere = new THREE__namespace.Sphere();
    box.getBoundingSphere(sphere);
    return { box, sphere };
  };

  group.userData.center = (mode = 'none', targetRadius = 1) => {
    const { box, sphere } = group.userData.computeBounds();
    if (mode === 'none') return { box, sphere };
    const center = sphere.center.clone();
    group.position.sub(center);
    if (mode === 'centerAndScale' && sphere.radius > 1e-6) {
      const s = targetRadius / sphere.radius;
      group.scale.multiplyScalar(s);
    }
    return group.userData.computeBounds();
  };

  // Dispose helper: clears geometries/materials and caches
  group.userData.dispose = () => {
    group.traverse((o) => {
      if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose();
      if (o.material && typeof o.material.dispose === 'function') o.material.dispose();
    });
    SPHERE_GEO_CACHE.forEach((g) => g.dispose());
    SPHERE_GEO_CACHE.clear();
  };

  if (typeof onProgress === 'function') onProgress('done', 1.0);

  return group;
}

function parseSDF(text, options = {}) {
  const normalized = normalizeSDFText(text);
  if (/^\s*M\s+V30\b/m.test(normalized)) return parseV3000(normalized);
  const canonical = canonicalizeV2000(normalized);
  if (sdfParser.parse) {
    const result = sdfParser.parse(canonical, options);
    if (Array.isArray(result)) {
      const withAtoms = result.find((entry) => entry?.atoms?.length);
      if (withAtoms) {
        applyV2000ChargesFromText(canonical, withAtoms.atoms);
        return withAtoms;
      }
    } else if (result?.atoms?.length) {
      applyV2000ChargesFromText(canonical, result.atoms);
      return result;
    }
  }
  const parsed = simpleParse(canonical);
  applyV2000ChargesFromText(canonical, parsed.atoms);
  return parsed;
}

/**
 * Parse all SDF records separated by $$$$ markers.
 * Returns an array of molecule records.
 */
function parseSDFAll(text, options = {}) {
  const normalized = normalizeSDFText(text);
  return normalized
    .split(/\$\$\$\$\s*/)
    .filter((s) => s && s.trim().length > 0)
    .map((t) => parseSDF(t, options));
}

function simpleParse(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const countsLineIndex = lines.findIndex((ln) =>
    /^\s*-?\d+\s+-?\d+/.test(ln),
  );
  if (countsLineIndex < 0) return {};
  // Prefer fixed-width V2000 columns (1–3 atoms, 4–6 bonds) before whitespace fallback
  const rawCounts = lines[countsLineIndex] || '';
  const countsLine = rawCounts.trimStart();
  const atomsFW = Number(countsLine.slice(0, 3));
  const bondsFW = Number(countsLine.slice(3, 6));
  let natoms = atomsFW;
  let nbonds = bondsFW;
  const needsFallback =
    !Number.isFinite(natoms) || !Number.isFinite(nbonds) || natoms <= 0 || nbonds < 0;

  if (needsFallback) {
    const parts = countsLine.slice(0, 39).trim().split(/\s+/);
    if (/^\d{6}$/.test(parts[0])) {
      natoms = Number(parts[0].slice(0, 3));
      nbonds = Number(parts[0].slice(3));
    } else {
      natoms = Number(parts[0]);
      nbonds = Number(parts[1]);
    }
  }
  if (!Number.isFinite(natoms) || !Number.isFinite(nbonds)) return {};

  const atoms = [];
  for (let i = 0; i < natoms; i += 1) {
    const l = lines[countsLineIndex + 1 + i] || '';
    const parts = l.trim().split(/\s+/);
    let x = parseFloat(parts[0]);
    let y = parseFloat(parts[1]);
    let z = parseFloat(parts[2]);
    let symbol = parts[3] ?? '';
    // Fallback to fixed-width columns if whitespace split fails
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !symbol) {
      const lx = l.length;
      const sx = l.slice(0, Math.min(10, lx));
      const sy = l.slice(10, Math.min(20, lx));
      const sz = l.slice(20, Math.min(30, lx));
      const ss = l.slice(31, Math.min(34, lx));
      x = parseFloat(sx.trim());
      y = parseFloat(sy.trim());
      z = parseFloat(sz.trim());
      symbol = ss.trim() || symbol;
    }
    atoms.push({ x, y, z, symbol });
  }

  const bonds = [];
  for (let i = 0; i < nbonds; i += 1) {
    const l = lines[countsLineIndex + 1 + natoms + i] || '';
    const [a, b, orderStr, stereoStr = '0'] = l.trim().split(/\s+/);
    bonds.push({
      beginAtomIdx: Number(a),
      endAtomIdx: Number(b),
      order: Number(orderStr) || 1,
      stereo: Number(stereoStr),
    });
  }

  const props = {};
  let mEndIndex = lines.findIndex(
    (ln, idx) => idx >= countsLineIndex && ln.startsWith('M  END'),
  );
  if (mEndIndex < 0) mEndIndex = countsLineIndex + 1 + natoms + nbonds;
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
  const pendingCharges = [];

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
        const [, , , symbol, x, y, z, ...rest] = parts;
        const atom = { x: +x, y: +y, z: +z, symbol };
        // Look for CHG= in rest tokens
        rest.forEach((tok) => {
          const m = tok.match(/^CHG=(.*)$/);
          if (m) atom.charge = Number(m[1]);
        });
        atoms.push(atom);
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

    // Also parse separate V3000 charge lines: "M  V30 CHG idx charge"
    if (ln.startsWith('M  V30 CHG')) {
      const parts = ln.trim().split(/\s+/);
      // e.g., M  V30 CHG 2  1 -1  5 1  (count followed by pairs)
      const count = Number(parts[3] || 0);
      for (let k = 0; k < count; k += 1) {
        const idx = Number(parts[4 + 2 * k]);
        const chg = Number(parts[5 + 2 * k]);
        pendingCharges.push({ idx, chg });
      }
    }
  });

  // Apply pending charges if any
  pendingCharges.forEach(({ idx, chg }) => {
    if (Number.isFinite(idx) && atoms[idx - 1]) atoms[idx - 1].charge = chg;
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
    suppressOppositeChargeCoordination = true,
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

  // Simple uniform grid to accelerate neighbor queries
  const cellSize = cutoff; // Å
  const cellKey = (x, y, z) =>
    `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(
      z / cellSize,
    )}`;
  const grid = new Map();
  atoms.forEach((a, i) => {
    const key = cellKey(a.x, a.y, a.z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });

  const neighborIndices = (x, y, z) => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);
    const out = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const bucket = grid.get(key);
          if (bucket) out.push(...bucket);
        }
      }
    }
    return out;
  };

  atoms.forEach((m, mi) => {
    if (!metals.has(m.symbol.toUpperCase())) return;
    const candidatesIdx = neighborIndices(m.x, m.y, m.z);
    if (!candidatesIdx.length) return;

    let dMin = Infinity;
    const dists = [];
    for (let k = 0; k < candidatesIdx.length; k += 1) {
      const li = candidatesIdx[k];
      if (mi === li) ; else {
        const l = atoms[li];
        if (l.symbol.toUpperCase() === 'H') ; else {
      const dx = m.x - l.x;
      const dy = m.y - l.y;
      const dz = m.z - l.z;
      const dist = Math.hypot(dx, dy, dz);
      dists.push({ li, dist });
      if (dist < dMin) dMin = dist;
        }
      }
    }
    if (!dists.length) return;
    const threshold = Math.max(cutoff, dMin * relFactor);
    dists.forEach(({ li, dist }) => {
      if (dist > threshold) return;
      const a = mi + 1;
      const b = li + 1;
      if (suppressOppositeChargeCoordination) {
        const ca = atoms[a - 1]?.charge ?? atoms[a - 1]?.formalCharge ?? 0;
        const cb = atoms[b - 1]?.charge ?? atoms[b - 1]?.formalCharge ?? 0;
        if ((ca > 0 && cb < 0) || (ca < 0 && cb > 0)) return;
      }
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key)) return;
      bonds.push({ beginAtomIdx: a, endAtomIdx: b, order: 0, source: 'inferredCoordination' });
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

  const inRange = (idx) =>
    Number.isFinite(idx) && idx >= 1 && idx <= atoms.length;

  // Build adjacency list
  const adj = new Map(atoms.map((_, i) => [i + 1, []]));
  bonds.forEach(({ beginAtomIdx: rawA, endAtomIdx: rawB }) => {
    const a = Number(rawA);
    const b = Number(rawB);
    if (!inRange(a) || !inRange(b)) return;
    const bucketA = adj.get(a);
    const bucketB = adj.get(b);
    if (bucketA) bucketA.push(b);
    if (bucketB) bucketB.push(a);
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
            source: 'inferredBridge',
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
  const dir = new THREE__namespace.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-6) return false;
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  mesh.position.copy(
    new THREE__namespace.Vector3().addVectors(from, to).multiplyScalar(0.5),
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
  const mesh = new THREE__namespace.Mesh(
    CONE_GEO.clone(),
    new THREE__namespace.MeshBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
    }),
  );
  mesh.scale.set(r, 1, r); // adjust radius to r*2 (base cone radius is 2)
  if (!orientMeshAlong(mesh, a, b, up)) return null;
  group.add(mesh);
  return mesh;
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
  const out = new THREE__namespace.Group();
  const steps = 5;
  const dir = new THREE__namespace.Vector3().subVectors(b, a).divideScalar(steps);
  const baseGeo = CYLINDER_GEO; // reuse shared geometry
  for (let i = 0; i < steps; i += 1) {
    const start = new THREE__namespace.Vector3().addVectors(
      a,
      dir.clone().multiplyScalar(i),
    );
    const end = start.clone().add(dir.clone().multiplyScalar(0.6));
    const mesh = new THREE__namespace.Mesh(
      baseGeo,
      new THREE__namespace.MeshBasicMaterial({ color: 0xaaaaaa }),
    );
    mesh.scale.set(r * (1 - i / steps), 1, r * (1 - i / steps));
    if (orientMeshAlong(mesh, start, end, up)) out.add(mesh);
  }
  group.add(out);
  return out;
}

/**
 * Structured result API: returns LoadResult in addition to creating a THREE.Group.
 * Non-breaking: existing loadSDF keeps returning Group, while attaching the result
 * to group.userData.loadResult. This helper simply exposes the structure.
 */
function loadSDFResult(text, options = {}) {
  const group = loadSDF(text, options);
  return group.userData.loadResult;
}

exports.loadSDF = loadSDF;
exports.loadSDFResult = loadSDFResult;
exports.parseSDF = parseSDF;
exports.parseSDFAll = parseSDFAll;
