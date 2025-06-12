# three-sdf-loader

> Convert `.sdf` (V2000) molecular files into ready-to-render `THREE.Group` objects. Zero patches to Three.js — only public APIs.

![Demo GIF](https://raw.githubusercontent.com/ajchem/three-sdf-loader-assets/main/demo.gif)

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
const molecule = loadSDF(text, { showHydrogen: false });
scene.add(molecule);
```

### Options

| Name            | Type                                   | Default | Description                                                     |
| --------------- | -------------------------------------- | ------- | --------------------------------------------------------------- |
| `showHydrogen`  | `boolean`                              | `false` | Render hydrogens (H) when `true`.                              |
| `elementColors` | `Record<string, THREE.ColorRep>`       | preset  | Per-element material colors.                                    |
| `elementRadii`  | `Record<string, number>`               | preset  | Per-element sphere radii (in scene units).                      |
| `attachAtomData`| `boolean`                              | `true`  | Copy each atom record onto corresponding `mesh.userData.atom`.  |
| `attachProperties`| `boolean`                            | `true`  | Copy molecule-level `properties` onto `group.userData`.         |
| `renderMultipleBonds`| `boolean`                         | `true`  | Render double / triple bonds as parallel lines.                 |
| `multipleBondOffset`| `number`                           | `0.1`   | Separation between parallel lines (scene units).                |

## Example (browser)

Below is a zero-build browser snippet (ES modules + CDN). It uses the
`loadSDF` **named export** and maps dependencies with an import-map so that
sub-modules resolve correctly.

```html
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
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const sdfText = await (await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/caffeine/SDF?record_type=3d')).text();
  const mol = loadSDF(sdfText);
  scene.add(mol);
</script>

### Lighting tips

After loading, swap the default `MeshBasicMaterial` for `MeshStandardMaterial` to
get PBR shading, then add a HemisphereLight + DirectionalLights:

```js
mol.traverse((o) => {
  if (o.isMesh) o.material = new THREE.MeshStandardMaterial({
    color: o.material.color,
    metalness: 0.1,
    roughness: 0.8,
  });
});
```

Make sure to enable `renderer.physicallyCorrectLights = true` and set
`renderer.outputEncoding = THREE.sRGBEncoding`.

---