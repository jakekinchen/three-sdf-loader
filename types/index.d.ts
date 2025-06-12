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
export function parseSDF(text: string, options?: Record<string, unknown>): MoleculeRecord; 