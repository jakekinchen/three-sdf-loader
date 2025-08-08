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

## 2-D vs 3-D layout detection

`three-sdf-loader` now tags every returned `THREE.Group` with `group.userData.layoutMode`:

```js
const group = loadSDF(text);      // ← auto-detects layout
console.log(group.userData.layoutMode); // '2d' or '3d'
```

When the layout is `'2d'`, the loader skips coordination-bond inference to avoid false positives and lets your app decide how to frame the molecule (e.g., swap to an orthographic camera). However, if any metal atoms have zero explicit bonds, coordination inference will still run to fix common cases like ferrocene. You can override detection with `layout: '2d' | '3d'` if needed.

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
- Coordinates are kept in Å in the `chemistry` arrays. Visuals can be scaled using `coordinateScale` or by transforming the returned `Group`.

#### LoaderOptions (additions)

```ts
type LoaderOptions = {
  instancing?: boolean; // default false
  createBonds?: boolean; // default true
  includeHydrogens?: boolean; // default true (overrides legacy showHydrogen)
  atomGeometry?: { type?: 'icosahedron' | 'sphere'; detail?: number; radius?: number };
  bondGeometry?: { type?: 'cylinder' | 'line'; radius?: number };
  performance?: { skipBondsOverAtomThreshold?: number };
  onProgress?: (stage: string, value: number) => void;
  coordinateScale?: number; // default 1.0
};
```

The existing options remain supported. The group remains structured exactly as before for backward compatibility; the new metadata is available via `group.userData.loadResult`.
