# three-sdf-loader

> Convert `.sdf` (V2000) molecular files into ready-to-render `THREE.Group` objects. Zero patches to Three.js — only public APIs.

![Demo GIF](https://raw.githubusercontent.com/ajchem/three-sdf-loader-assets/main/demo.gif)

---

## Install

```bash
npm install three three-sdf-loader
```

> **Peer-dep**: Three.js (r160+) must be installed alongside.

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

## Example (browser)

Open `examples/webgl_loader_sdf.html` or view the live version:
<https://your-demo-link.example.com>

## CLI / CI

```bash
npm run lint   # ESLint (airbnb-base) + Prettier
npm test       # Vitest with 100 % coverage
npm run size   # size-limit ≤ 3 KB gzipped
```

## License

MIT © 2025 Your Name 

## Advanced parsing only

Need raw data without any Three.js visuals? Use `parseSDF()` – a thin wrapper around [sdf-parser](https://www.npmjs.com/package/sdf-parser):

```js
import { parseSDF } from 'three-sdf-loader';

const { atoms, bonds, properties } = parseSDF(await fetch('molecule.sdf').then(r => r.text()));
console.log(properties.PUBCHEM_COMPOUND_CID);
``` 