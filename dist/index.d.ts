import * as THREE from 'three';

// Back-compat options (existing)
export interface LoadSDFOptions {
  showHydrogen?: boolean;
  elementColors?: Record<string, THREE.ColorRepresentation>;
  elementRadii?: Record<string, number>;
  attachAtomData?: boolean;
  attachProperties?: boolean;
  renderMultipleBonds?: boolean;
  multipleBondOffset?: number;
  useCylinders?: boolean;
  bondRadius?: number;
  autoDetectMetalBonds?: boolean;
  relFactor?: number;
  cutoff?: number;
  layout?: 'auto' | '2d' | '3d';
  inferBridgingBonds?: boolean;
  addThreeCenterBonds?: boolean;
  hiddenElements?: string[];
}

// New extended options
export interface LoaderOptions extends LoadSDFOptions {
  instancing?: boolean;
  createBonds?: boolean;
  includeHydrogens?: boolean;
  materialFactory?: (role: 'atom' | 'atomInstanced' | 'bondCylinder' | 'bondLine' | 'bondDashed', defaultMaterial: THREE.Material) => THREE.Material;
  palette?: 'default' | 'jmol' | 'material';
  style?: 'ballStick' | 'spaceFill' | 'licorice';
  instancedBonds?: boolean;
  headless?: boolean;
  hideIsolatedAtoms?: boolean;
  isolatedAtomCutoff?: number; // Å
  atomGeometry?: {
    type?: 'icosahedron' | 'sphere';
    detail?: number;
    widthSegments?: number;
    segments?: number;
    radius?: number;
  };
  bondGeometry?: {
    type?: 'cylinder' | 'line';
    radius?: number;
    segments?: number;
  };
  performance?: {
    skipBondsOverAtomThreshold?: number;
    atomSegments?: number;
    bondSegments?: number;
  };
  onProgress?: (stage: string, value: number) => void;
  coordinateScale?: number;
  units?: 'angstrom' | 'nm' | 'scene';
  index?: number; // selected record index for multi-record SDF
  // coordination inference controls
  coordinationMode?: 'none' | 'transitionOnly' | 'all';
  suppressOppositeChargeCoordination?: boolean;
}

export interface AtomMeta {
  index: number; // 0-based
  element: string; // uppercase symbol
  atomicNumber?: number;
  formalCharge?: number;
  aromatic?: boolean;
}

/** Source of bond data: from the original molfile or inferred */
export type BondSource = 'molfile' | 'inferredCoordination' | 'inferredBridge';

export interface BondMeta {
  index: number; // 0-based
  beginAtomIndex: number; // 0-based
  endAtomIndex: number; // 0-based
  /** Normalized bond order (1-4) used for rendering */
  order: 1 | 2 | 3 | 4;
  /** Original bond order from molfile or inference (0 for coordination, 4 for aromatic, etc.) */
  originalOrder: number;
  /** @deprecated Use isAromatic instead */
  aromatic?: boolean;
  /** True when originalOrder === 4 (aromatic bond) */
  isAromatic?: boolean;
  /** True when originalOrder === 0 (coordination/ionic bond) */
  isCoordination?: boolean;
  /** True when bond is a bridging bond (three-center bond) */
  isBridge?: boolean;
  /** Source of bond data */
  source: BondSource;
  /** Stereo type for wedge/hash bonds */
  stereo?: 'up' | 'down' | 'wavy';
}

export interface LoadResult {
  root: THREE.Group;
  atomsGroup: THREE.Group; // virtual container
  bondsGroup?: THREE.Group; // virtual container
  metadata: {
    atomCount: number;
    bondCount: number;
    title?: string;
    sdfFormatVersion?: 'V2000' | 'V3000' | string;
    source?: 'pubchem' | 'nist' | 'cactus' | 'other';
  };
  mappings: {
    atomIndexToMesh?: Array<THREE.Mesh | null>;
    meshUuidToAtomIndex?: Map<string, number>;
    instancedAtoms?: {
      mesh: THREE.InstancedMesh;
      instanceToAtomIndex: Uint32Array;
    };
    bondIndexToMesh?: Array<THREE.Object3D | null>;
    meshUuidToBondIndex?: Map<string, number>;
    /** Instanced bonds metadata for picking/selection when instancedBonds: true */
    instancedBonds?: {
      mesh: THREE.InstancedMesh;
      /** Maps instance index to bond index in bondTable */
      instanceToBondIndex: Uint32Array;
      /** Bond metadata keyed by bond index */
      bondTable: BondMeta[];
    };
  };
  chemistry: {
    atoms: Array<
      AtomMeta & {
        x: number;
        y: number;
        z: number;
      }
    >;
    bonds: BondMeta[];
  };
}

export interface AtomRecord {
  x: number;
  y: number;
  z: number;
  symbol: string;
  charge?: number;
  isotope?: number;
  radical?: number;
  [key: string]: unknown;
}

export interface MoleculeRecord {
  atoms: AtomRecord[];
  bonds: unknown[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Returns a THREE.Group ready for rendering. Also attaches `group.userData.loadResult` */
export function loadSDF(text: string, options?: LoaderOptions): THREE.Group;

/** Returns a structured result alongside the root THREE.Group. */
export function loadSDFResult(
  text: string,
  options?: LoaderOptions,
): LoadResult;

/** Thin wrapper around sdf-parser returning a parsed molecule record. */
export function parseSDF(
  text: string,
  options?: Record<string, unknown>,
): MoleculeRecord;

/** Returns all parsed molecule records from a multi-record SDF string */
export function parseSDFAll(
  text: string,
  options?: Record<string, unknown>,
): MoleculeRecord[];

/** Positions a camera to optimally view a 2D molecular structure */
export function createPlanarView(
  camera: THREE.Camera,
  boundingBox: THREE.Box3,
  margin?: number,
): void;
