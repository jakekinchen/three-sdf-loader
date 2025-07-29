import * as THREE from 'three';

export interface LoadSDFOptions {
  /** Render hydrogens when true (default: false) */
  showHydrogen?: boolean;
  /** Override per-element material colours */
  elementColors?: Record<string, THREE.ColorRepresentation>;
  /** Override per-element sphere radii */
  elementRadii?: Record<string, number>;
  /** Attach full atom record to each Mesh.userData when true (default: true) */
  attachAtomData?: boolean;
  /** Attach molecule properties to Group.userData when true (default: true) */
  attachProperties?: boolean;
  /** Render double/triple bonds as parallel lines when true (default: true) */
  renderMultipleBonds?: boolean;
  /** Distance between parallel lines for multiple bonds (scene units, default: 0.1) */
  multipleBondOffset?: number;
  /** Render bonds as cylinders instead of line segments (default: true) */
  useCylinders?: boolean;
  /** Radius of cylinder bonds when useCylinders=true (scene units, default: 0.02) */
  bondRadius?: number;
  /** Automatically infer coordination (order 0) bonds for common metals (default: true) */
  autoDetectMetalBonds?: boolean;
  /** Multiplier applied to closest metal–ligand distance for adaptive cutoff (default: 1.4) */
  relFactor?: number;
  /** Layout mode: 'auto' | '2d' | '3d' (default: 'auto') */
  layout?: 'auto' | '2d' | '3d';
  /** Automatically infer three-center bonds (e.g., B–H–B bridges) when true (default: true) */
  inferBridgingBonds?: boolean;
  addThreeCenterBonds?: boolean; // deprecated, use inferBridgingBonds
  /** Array of element symbols to hide from rendering (e.g., ['Cl', 'O']) */
  hiddenElements?: string[];
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

/**
 * Parse SDF (V2000) text and return a `THREE.Group` ready for rendering.
 */
export function loadSDF(text: string, options?: LoadSDFOptions): THREE.Group;

/**
 * Thin wrapper around `sdf-parser` returning a parsed molecule record.
 */
export function parseSDF(
  text: string,
  options?: Record<string, unknown>,
): MoleculeRecord;

/**
 * Positions a camera to optimally view a 2D molecular structure
 */
export function createPlanarView(
  camera: THREE.Camera,
  boundingBox: THREE.Box3,
  margin?: number,
): void;
