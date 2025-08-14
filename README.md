# three-sdf-loader

> Convert `.sdf` (V2000) molecular files into ready-to-render `THREE.Group` objects. Zero patches to Three.js — only public APIs.

![Demo Image](https://raw.githubusercontent.com/jakekinchen/three-sdf-loader/main/screenshot.png)

---

## Install

```bash
npm install three three-sdf-loader
```

> **Peer-dep**: Three.js (r151+) must be installed alongside.

## Quick usage

```js
import { loadSDF, parseSDF } from 'three-sdf-loader';
import * as THREE from 'three';

const text = await fetch('caffeine.sdf').then((r) => r.text());

// Auto-detects 2-D vs 3-D layout (see next section)
const molecule = loadSDF(text, { showHydrogen: false });

// Example: switch to orthographic camera for purely planar files
if (molecule.userData.layoutMode === '2d') {
  camera = new THREE.OrthographicCamera(
    innerWidth / -2,
    innerWidth / 2,
    innerHeight / 2,
    innerHeight / -2,
    0.1,
    1000,
  );
  camera.position.set(0, 0, 10);
}

scene.add(molecule);

// … render loop …
```

### Options

| Name                  | Type                             | Default | Description                                                    |
| --------------------- | -------------------------------- | ------- | -------------------------------------------------------------- |
| `showHydrogen`        | `boolean`                        | `false` | Render hydrogens (H) when `true`.                              |
| `elementColors`       | `Record<string, THREE.ColorRep>` | preset  | Per-element material colors.                                   |
| `elementRadii`        | `Record<string, number>`         | preset  | Per-element sphere radii (in scene units).                     |
| `attachAtomData`      | `boolean`                        | `true`  | Copy each atom record onto corresponding `mesh.userData.atom`. |
| `attachProperties`    | `boolean`                        | `true`  | Copy molecule-level `properties` onto `group.userData`.        |
| `layout`              | `'auto' \| '2d' \| '3d'`         | `auto`  | Force 2‑D or 3‑D handling; `'auto'` infers from Z‑coordinates. |
| `renderMultipleBonds` | `boolean`                        | `true`  | Render double / triple bonds as parallel lines.                |
| `multipleBondOffset`  | `number`                         | `0.1`   | Separation between parallel lines (scene units).               |
| `addThreeCenterBonds` | `boolean`                        | `true`  | Infer three-center bonds (e.g., B–H–B bridges in diborane).    |
| `coordinationMode`    | `'none'|'transitionOnly'|'all'`  | `transitionOnly` | Scope of coordination bond inference. `'all'` mirrors older behavior. |
| `suppressOppositeChargeCoordination` | `boolean`         | `true`  | When inferring coordination, skip links between oppositely charged ions. |
| `relFactor`           | `number`                         | `1.4`   | Relative factor on closest distance for adaptive thresholding. |
| `cutoff`              | `number`                         | `3.0`   | Hard minimum distance (Å) for coordination inference.          |
| `instancing`          | `boolean`                        | `false` | Use `InstancedMesh` for atoms.                                 |
| `instancedBonds`      | `boolean`                        | `false` | Use `InstancedMesh` for cylinder bonds (perf).                 |
| `useCylinders`        | `boolean`                        | `true`  | Cylinder bonds; set `false` for lines (order‑0 bonds render dashed). |
| `useFatLines`         | `boolean`                        | — | Removed. Only classic `LineSegments` or cylinder bonds are supported. |
| `hideIsolatedAtoms`   | `boolean`                        | `false` | Hide atoms with zero bonds that are farther than cutoff from any neighbor. |
| `isolatedAtomCutoff`  | `number`                         | `3.0`   | Distance threshold (Å) used when `hideIsolatedAtoms` is true. |
| `style`               | `'ballStick'\|'spaceFill'\|'licorice'` | `ballStick` | Visual preset adjusting atom/bond scale.                       |
| `palette`             | `'default'\|'jmol'\|'material'` | `default` | Element color palette; `elementColors` overrides per-element.  |
| `materialFactory`     | `(role, default)=>material`      | —       | Hook to override materials by role.                            |
| `coordinateScale`     | `number`                         | `1.0`   | Global scale for coordinates (scene units per Å or nm).        |
| `units`               | `'angstrom'\|'nm'\|'scene'`   | `angstrom` | Input coordinate units.                                        |
| `index`               | `number`                         | `0`     | For multi-record SDFs, selects which record to load.           |
| `headless`            | `boolean`                        | `false` | Parse-only mode; returns chemistry/metadata without geometry.  |
| `performance.atomSegments` | `number`                   | `16`    | Sphere segments (memoized).                                    |
| `performance.bondSegments` | `number`                   | `8`     | Cylinder segments.                                             |
| `performance.buildBondBVH` | `boolean`                   | `true`  | Build BVH for fast line-mode bond picking.                     |
| `performance.usePCANormal` | `boolean`                   | `false` | Use PCA for multiple-bond offset direction.                    |

## 2-D vs 3-D layout detection

`three-sdf-loader` now tags every returned `THREE.Group` with `group.userData.layoutMode`:

```js
const group = loadSDF(text);      // ← auto-detects layout
console.log(group.userData.layoutMode); // '2d' or '3d'
```

When the layout is `'2d'`, the loader skips coordination-bond inference to avoid false positives and lets your app decide how to frame the molecule (e.g., swap to an orthographic camera). However, if any metal atoms have zero explicit bonds, coordination inference will still run to fix common cases like ferrocene (honoring `coordinationMode`). You can override detection with `layout: '2d' | '3d'` if needed.

## Example (browser)

Below is a zero-build browser snippet (ES modules + CDN). It uses the
`loadSDF` **named export** and maps dependencies with an import-map so that
sub-modules resolve correctly.

````html
<!-- index.html -->
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.151.3/build/three.module.js",
      "sdf-parser": "https://cdn.jsdelivr.net/npm/sdf-parser@2.0.0/+esm"
    }
  }
</script>

<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.151.3/examples/jsm/controls/OrbitControls.js';
  import { loadSDF } from 'https://unpkg.com/three-sdf-loader@latest/src/index.js';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    innerWidth / innerHeight,
    0.1,
    100,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const sdfText = await (
    await fetch(
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/caffeine/SDF?record_type=3d',
    )
  ).text();
  const mol = loadSDF(sdfText);
  scene.add(mol);
</script>

### Lighting tips After loading, swap the default `MeshBasicMaterial` for
`MeshStandardMaterial` to get PBR shading, then add a HemisphereLight +
DirectionalLights: ```js mol.traverse((o) => { if (o.isMesh) o.material = new
THREE.MeshStandardMaterial({ color: o.material.color, metalness: 0.1, roughness:
0.8, }); });
````

Make sure to enable `renderer.physicallyCorrectLights = true` and set
`renderer.outputEncoding = THREE.sRGBEncoding`.

---

### Picking & Metadata

The loader attaches a structured `LoadResult` to the returned `THREE.Group` at `group.userData.loadResult`. It contains stable indices, chemistry arrays, and mappings for picking.

Non‑instanced picking:

```js
const group = loadSDF(sdfText, { showHydrogen: true, useCylinders: false });
const res = group.userData.loadResult; // { metadata, chemistry, mappings, ... }

// Raycast → mesh → atom index
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouse, camera);
const hit = raycaster.intersectObject(group, true)[0];
if (hit?.object?.userData?.role === 'atom') {
  const { index, element } = hit.object.userData.atom; // 0-based index
  console.log(index, element);
}
```

Instanced picking:

```js
const group = loadSDF(sdfText, { includeHydrogens: true, instancing: true });
const res = group.userData.loadResult;

const hit = raycaster.intersectObject(res.mappings.instancedAtoms.mesh, true)[0];
if (hit && hit.instanceId != null) {
  const atomIndex = res.mappings.instancedAtoms.instanceToAtomIndex[hit.instanceId];
  const atom = res.chemistry.atoms[atomIndex];
}
```

Notes:

- Indices are 0‑based and align with SDF atom/bond block order.
- Coordinates are in Å by default in `chemistry`. Set `units: 'nm'` to interpret inputs as nanometers. Visuals can be scaled using `coordinateScale` or by transforming the returned `Group`.

#### LoaderOptions (additions)

```ts
type LoaderOptions = {
  instancing?: boolean;
  instancedBonds?: boolean;
  headless?: boolean;
  createBonds?: boolean;
  includeHydrogens?: boolean;
  hideIsolatedAtoms?: boolean;
  isolatedAtomCutoff?: number;
  atomGeometry?: { type?: 'icosahedron' | 'sphere'; detail?: number; widthSegments?: number; radius?: number };
  bondGeometry?: { type?: 'cylinder' | 'line'; radius?: number; segments?: number };
  performance?: { skipBondsOverAtomThreshold?: number; atomSegments?: number; bondSegments?: number; buildBondBVH?: boolean; usePCANormal?: boolean };
  onProgress?: (stage: string, value: number) => void;
  coordinateScale?: number;
  units?: 'angstrom' | 'nm' | 'scene';
  palette?: 'default' | 'jmol' | 'material';
  style?: 'ballStick' | 'spaceFill' | 'licorice';
  index?: number;
  materialFactory?: (role: 'atom'|'atomInstanced'|'bondCylinder'|'bondLine'|'bondDashed', defaultMaterial: THREE.Material) => THREE.Material;
};
```

The existing options remain supported. The group remains structured exactly as before for backward compatibility; the new metadata is available via `group.userData.loadResult`.

#### Palettes and data sources

- Default colors are CPK‑ish and inspired by community conventions.
- The `'jmol'` palette approximates the Jmol color set.
- The `'material'` palette provides muted Material‑style hues for UI consistency.
- Atomic numbers table covers 1–118 based on periodic table ordering.

You can always override any entry with `elementColors`.

### Recipes

#### Parse-only (headless) usage

```js
import { loadSDF } from 'three-sdf-loader';

const group = loadSDF(text, { headless: true });
const { chemistry, metadata } = group.userData.loadResult;
console.log(metadata.title, chemistry.atoms.length, chemistry.bonds.length);
```

#### Instanced atoms and bonds (performance)

```js
const group = loadSDF(text, {
  includeHydrogens: true,
  instancing: true,        // atoms via InstancedMesh
  instancedBonds: true,    // cylinders via InstancedMesh
});
scene.add(group);
```

<!-- Fat lines support removed in 0.6.0 -->

#### Center and fit to a target radius

```js
const group = loadSDF(text);
// Compute bounds and re-center (and optionally uniform-scale)
group.userData.center('centerAndScale', 5.0); // fit to radius=5 scene units
```

#### Bond picking in line mode (BVH-accelerated)

```js
const group = loadSDF(text, { useCylinders: false });
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouse, camera);
const hit = group.userData.pickBond(raycaster, { threshold: 0.05 });
if (hit) {
  console.log('Bond index:', hit.bondIndex, 'Distance:', Math.sqrt(hit.distanceSq));
}
```

#### Atom picking (instanced and non‑instanced)

```js
const res = group.userData.loadResult;
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouse, camera);
const hit = raycaster.intersectObject(group, true)[0];
const atomIndex = group.userData.pickAtom(hit); // null if none
```

#### Custom materials via materialFactory

```js
const group = loadSDF(text, {
  materialFactory: (role, defaultMat) => {
    if (role === 'atom') return new THREE.MeshStandardMaterial({ color: defaultMat.color });
    if (role === 'bondCylinder') return new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.1, roughness: 0.8 });
    return defaultMat;
  },
});
```

#### Multi‑record selection and units

```js
// Select the 3rd record from a multi-record SDF and interpret as nanometers
const group = loadSDF(text, { index: 2, units: 'nm' });
```
