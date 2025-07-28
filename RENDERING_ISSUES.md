# Rendering Engine Issues Tracking

This document tracks known rendering engine blind-spots and their fix status for the three-sdf-loader package.

## Priority Issues

| Priority | Problem                                                   | Impact                              | Fix Status     |
| -------- | --------------------------------------------------------- | ----------------------------------- | -------------- |
| 1        | Aromatic bonds (order 4) mistaken for triple              | Ubiquitous (all benzene-like rings) | ✅ **FIXED**   |
| 2        | "Unknown/coordinate" bonds (order 0/9) rendered as triple | Many metallo-organic SDFs           | ✅ **FIXED**   |
| 3        | Wedge/hashed stereobonds ignored                          | Chiral drugs, biochem ligands       | ✅ **FIXED**   |
| 4        | V3000 blocks unsupported                                  | Growing share of files              | ✅ **FIXED**   |
| 5        | Metal list too small                                      | Most bio-inorganic structures       | ✅ **FIXED**   |
| 6        | Bridging heavy atoms hidden when excluded                 | Al₂Cl₆, μ-oxo dimers                | ✅ **FIXED**   |
| 7        | Atom-based aromatic flags (APT/SAP) skipped               | Edge-case vendor files              | ⏳ **PENDING** |
| 8        | Polymer (STY/SLB/SBT) blocks flattened                    | Polymers/biopolymers                | ⏳ **PENDING** |
| 9        | Isotopes & charges not visualised                         | Niche visual cue                    | ⏳ **PENDING** |

## Fixed Issues Details

### Priority 1: Aromatic Bonds ✅

**Problem**: Aromatic bonds (order 4) were being rendered as triple bonds, making benzene rings look incorrect.
**Solution**: Added order normalization to treat orders < 1 or > 3 as single bonds.
**Implementation**: Modified bond rendering logic in `loadSDF` function to normalize `order` before rendering.
**Files Changed**: `src/index.js` (lines ~158-162)

### Priority 2: Unknown/Coordinate Bonds ✅

**Problem**: Unknown/coordinate bonds (order 0/9) were rendered as triple bonds instead of single coordination bonds.
**Solution**: Same order normalization fix as Priority 1 - orders 0, 8, 9 now render as single bonds.
**Implementation**: Same normalization logic handles all non-standard bond orders.
**Files Changed**: `src/index.js` (lines ~158-162)

### Priority 3: Stereobonds ✅

**Problem**: Wedge and hashed stereobonds were ignored, losing important 3D chirality information.
**Solution**: Added stereo flag parsing and wedge rendering with solid cones (stereo=1) and hashed cylinders (stereo=6).
**Implementation**:

- Modified `simpleParse` to capture stereo field from SDF bond lines
- Added helper functions: `orientMeshAlong`, `addSolidWedge`, `addHashedWedge`
- Added stereo rendering logic in bond processing loop
  **Files Changed**: `src/index.js` (multiple sections)

### Priority 4: V3000 Support ✅

**Problem**: V3000 format SDF files were not supported, only V2000 format.
**Solution**: Added V3000 detection and minimal parser for M V30 atom and bond blocks.
**Implementation**:

- Added regex detection `/^\s*M\s+V30\b/m` in `parseSDF` function
- Implemented `parseV3000` function to handle BEGIN ATOM/END ATOM and BEGIN BOND/END BOND blocks
- Parses basic atom coordinates and bond connectivity from M V30 lines
  **Files Changed**: `src/index.js` (parseSDF function and new parseV3000 function)

### Priority 5: Extended Metal Coverage ✅

**Problem**: Metal detection was limited to 9 common transition metals, missing most bio-inorganic structures.
**Solution**: Expanded to full IUPAC metallic element set (67 elements total).
**Implementation**: Replaced `DEFAULT_METALS` with comprehensive list including:

- Alkali metals: Li, Na, K, Rb, Cs, Fr
- Alkaline earth: Be, Mg, Ca, Sr, Ba, Ra
- Transition metals: Sc-Zn, Y-Cd, La, Hf-Hg
- Post-transition: Al, Ga, In, Tl, Sn, Pb, Bi, Po, Fl, Lv, Nh, Mc
- Lanthanides: La-Lu
- Actinides: Ac-Lr
  **Files Changed**: `src/index.js` (DEFAULT_METALS constant)

### Priority 6: Generic Bridging Bonds ✅

**Problem**: Only hydrogen bridging was handled; other bridging atoms (Cl, O, etc.) were ignored.
**Solution**: Generalized bridging bond inference to any hidden element and added `hiddenElements` option.
**Implementation**:

- Added `hiddenElements` array option to `loadSDF` function
- Created `hiddenSet` that combines `hiddenElements` with legacy `showHydrogen` flag
- Replaced `inferThreeCenterBonds` with `inferBridgingBonds` that works with any hidden element
- Updated atom rendering to skip any element in `hiddenSet`
- Bridging bonds now connect heavy atoms through any hidden bridging atom (H, Cl, O, etc.)
  **Files Changed**: `src/index.js` (loadSDF options, atom rendering, inferBridgingBonds function)

## Pending Issues

### Priority 7: Aromatic Flags

**Impact**: Edge cases in vendor-specific files
**Complexity**: Medium - requires APT/SAP block parsing

### Priority 8: Polymer Blocks

**Impact**: Biopolymers and synthetic polymers not handled
**Complexity**: High - requires STY/SLB/SBT block support

### Priority 9: Isotopes & Charges

**Impact**: Visual cues for specialized chemistry
**Complexity**: Low - just need visual indicators

## Implementation Notes

- Priorities 1-6 were implemented without breaking API changes
- All fixes maintain backward compatibility
- Stereo rendering uses existing Three.js primitives (cones, cylinders)
- Order normalization is applied before any bond rendering logic
- V3000 support is minimal but handles most common cases
- Metal detection now covers all IUPAC metallic elements
- Generic bridging bonds work with any hidden element type
- `hiddenElements` option provides fine-grained control over atom visibility
- Shared geometry caches (`SPHERE_GEO_CACHE`, `CYLINDER_GEO`, `CONE_GEO`) cut memory usage
- Aromatic bonds (order 4) render dashed when `useCylinders` is `false` for clearer visuals
- **Bridging pseudo‑bonds (`isBridge`) now also render as dashed lines in line‑mode for unmistakable three‑centre indication**
- **Type declarations updated:** `bondRadius` default in `types/index.d.ts` corrected to **0.02** so IDE hints match runtime

## Usage Examples

```javascript
// Hide all hydrogens (legacy behavior)
loadSDF(text, { showHydrogen: false });

// Hide specific elements but keep structural links
loadSDF(al2cl6Sdf, { hiddenElements: ['Cl'] });

// V3000 files are automatically detected and parsed
loadSDF(v3000Text); // works automatically

// Extended metal detection works for bio-inorganic structures
loadSDF(metalloproteinSdf); // lanthanides, actinides now recognized
```
