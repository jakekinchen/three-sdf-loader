Fixes to implement
Critical correctness
	•	[x] Bond radius doubled. CYLINDER_GEO has base radius 1. You scale X/Z by bondRadiusFinal * 2, which makes diameter = 2r. Use r.

// before
mesh.scale.set(bondRadiusFinal * 2, len, bondRadiusFinal * 2);
// after
mesh.scale.set(bondRadiusFinal, len, bondRadiusFinal);

	•	[x] Atoms/Bonds subgroups never used. You create atomsGroup/bondsGroup in the returned loadResult but add meshes directly to group. Either remove them from the API or add them and populate.

const atomsGroup = new THREE.Group(); atomsGroup.name = 'atoms';
const bondsGroup = new THREE.Group(); bondsGroup.name = 'bonds';
group.add(atomsGroup, bondsGroup);
// …add atom meshes to atomsGroup; bond meshes/lines to bondsGroup
loadResult.atomsGroup = atomsGroup; loadResult.bondsGroup = bondsGroup;

	•	[x] Multi‑record SDF discarded. text.split('$$$$')[0] drops all but the first molecule. Provide an API that returns all records and have loadSDF pick index 0.

export function parseSDFAll(text, options={}) {
  return text.split(/\$\$\$\$\s*/).filter(Boolean).map(t => parseSDF(t, options));
}

	•	[x] No bond picking for line mode. meshUuidToBondIndex only fills for cylinder bonds. For LineSegments, you can’t map a single UUID to many segments. Expose a CPU‑side spatial query or switch bonds to InstancedMesh so each instance is pickable.

⸻

Parsing fidelity
	•	[ ] V3000 parser is minimal. You ignore charges, isotopes, radicals, atom mapping numbers, stereochemistry flags, and property blocks. At minimum: parse M  CHG, V3000 CHG=, and per‑atom charge fields. Also surface RAD if present.

// V2000 extras after bond block:
if (ln.startsWith('M  CHG')) { /* parse count + (idx, charge) pairs and apply */ }
// V3000: lines like "M  V30 CHG idx charge"

	•	[x] V2000 “fixed‑width” tolerance. Your simpleParse atom line uses whitespace split. That’s usually fine, but official MOL V2000 uses fixed columns. Keep your tolerant parse, but fall back to fixed‑width slices when split fails (NaN).
	•	[x] Stereochemistry. You only check bond.stereo and draw wedge/hash, but you don’t interpret up/down indicators from V2000/V3000 consistently. Make parseSDF normalize stereo to a small enum and drive rendering from that.

⸻

Three.js/visual quality
	•	[x] Instanced atoms have no per‑instance color. In instancing mode every atom is white. Enable instance colors and set one material with vertexColors.

const material = new THREE.MeshBasicMaterial({ vertexColors: true });
const imesh = new THREE.InstancedMesh(geometry, material, instanceCount);
// for each instance:
const color = new THREE.Color(elementColors[sym] ?? DEFAULT_COLORS[sym] ?? 0xffffff);
imesh.setColorAt(instanceId, color);
imesh.instanceColor.needsUpdate = true;

	•	[ ] Line thickness and WebGPU. LineDashedMaterial is thin and not supported under WebGPU. Prefer Line2/LineMaterial/LineSegments2 from three/examples for fat/dashed lines, gated by a flag.
	•	[x] Lighting. MeshBasicMaterial is fast but flat. Expose materialFactory option so consumers can swap to MeshStandardMaterial with scene lights/IBL without modifying your code.
	•	[x] Space‑filling/surface styles. Add a high‑level style option: ballStick (current), spaceFill (scale by VdW radii; no bonds), licorice (thicker bonds). Each style can remap atom radius/bond radius internally.

⸻

Performance
	•	[ ] O(n²) distance checks for metal inference. For larger molecules this spikes. Use a uniform grid or k‑d tree to restrict neighbor checks.
	•	[ ] O(n³) plane normal search. Replace with PCA of atom positions (fast covariance + eigenvector) for a stable “molecule plane.”
	•	[x] Wedge hash clones geometry. addHashedWedge calls CYLINDER_GEO.clone() per dash and scales geometry. Reuse the shared geometry and scale the mesh instead; no geometry clones.

const base = CYLINDER_GEO;
for (let i=0;i<steps;i++){
  const mesh = new THREE.Mesh(base, cylMat);
  mesh.scale.set(r*(1 - i/steps), segmentLen, r*(1 - i/steps)); // scale mesh, not geometry
  // orient and add…
}

	•	[ ] Instanced bonds. When using cylinders, emit a single InstancedMesh for bonds. Your per‑bond meshes explode draw calls.
	•	[x] Geometry detail knobs. Sphere 16×16 and cylinder 8 segments are hardcoded. Surface this as performance.atomSegments and performance.bondSegments.
	•	[ ] Skip‑threshold is one‑sided. You gate bond creation by skipBondsOverAtomThreshold but still build atom metadata for all. Add an early exit path that only returns parsed chemistry when in “headless” mode.

⸻

API/DX
	•	[x] Consistent options naming. You support legacy flags; good. Add a normalized, documented options snapshot on group.userData.optionsUsed for reproducibility.
	•	[x] Centering and fit. Provide center: 'none'|'center'|'centerAndScale' to translate and optionally uniform‑scale the model to a target radius. Also compute and export boundingBox/boundingSphere.
	•	[ ] Unit handling. State units explicitly (Å). Keep coordinateScale but add units: 'angstrom'|'nm'|'scene' to avoid ambiguity.
	•	[ ] Events/progress. Your onProgress tags are coarse. Emit parse:start|done, buildAtoms:start|done, buildBonds:start|done, final done with fractional progress.

⸻

Data correctness and tables
	•	[x] Radii table duplicates. DEFAULT_RADII repeats CL, BR, I; last write wins but it’s confusing. Deduplicate and document the source dataset. Consider a complete covalent/VdW table.
	•	[ ] Atomic numbers table is partial. Add a full periodic map or compute from a canonical table once and cache.
	•	[x] Colors. Expose multiple palettes: CPK, Jmol, material design. Provide a palette name option, not just overrides.

⸻

Picking and metadata
	•	[x] Instanced picking. You already store instanceToAtomIndex; good. Add a tiny helper to translate raycast hits to atom indices and surface it on group.userData.pickAtom(hit).
	•	[x] Bond picking in line mode. Either move lines to instanced cylinders with very small radius for pickability or maintain a BVH over segments and return the closest bond index.

⸻

Memory management
	•	[x] Dispose path. Provide dispose() to clear caches, materials, and geometries (and empty SPHERE_GEO_CACHE). Attach it to group.userData.dispose.

group.userData.dispose = () => {
  group.traverse(o => {
    if (o.geometry?.dispose) o.geometry.dispose();
    if (o.material?.dispose) o.material.dispose();
  });
  SPHERE_GEO_CACHE.forEach(g => g.dispose());
  SPHERE_GEO_CACHE.clear();
};


⸻

Minor polish
	•	[x] Expose atomSegments and icoDetail for atomGeometry.
	•	[ ] Parameterize multipleBondOffset relative to bond radius or bond length.
	•	[ ] Normalize element symbols once (normalizeEl(symbol)).
	•	[ ] Add TypeScript .d.ts or JSDoc typedefs for LoadResult, ChemAtom, ChemBond.
	•	[x] Set group.name from SDF title if present; mirror on metadata.title.

⸻

Suggested small API additions (high ROI)
	1.	[x] parseSDFAll(text) returning an array.
	2.	[ ] loadSDFResult(text, { index }) selecting a record.
	3.	[x] style preset with internal radii/bond defaults.
	4.	[x] materialFactory hook.
	5.	[x] dispose() hook.
	6.	[ ] instancedBonds: true with per‑instance color by order/aromatic.

Implement those plus the bond radius fix, subgroup wiring, instanced atom colors, V3000/V2000 charge parsing, and a spatial neighbor search. That gets you from “good” to “production‑grade.”