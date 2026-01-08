# Contributing to three-sdf-loader

## Development Setup

```bash
npm ci
npm test
npm run lint
```

## Running Tests

```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode
npm run test:coverage    # With coverage report
```

## Building

```bash
npm run build            # Creates dist/index.js, dist/index.cjs, dist/index.d.ts
```

## Release Process

### Prerequisites

- You must have npm publish access to `three-sdf-loader`
- Trusted Publishing is configured via GitHub Actions (no token needed for CI)
- `package.json` includes `"repository.url": "https://github.com/jakekinchen/three-sdf-loader"` (required for provenance verification)

### Release via CI (recommended)

1. **Bump version and commit:**
   ```bash
   npm version patch   # or minor, major
   ```
   This automatically:
   - Updates `package.json` version
   - Creates a git commit
   - Creates a git tag `v{version}`

2. **Push with tags:**
   ```bash
   git push --follow-tags
   ```

3. **Let GitHub Actions publish:**
   - The `.github/workflows/publish.yml` workflow runs on `v*` tags and publishes via npm Trusted Publishing (OIDC).
   - Verify the release on npm (example): `npm view three-sdf-loader version`

### CI/CD (GitHub Actions)

The repo has a publish workflow at `.github/workflows/publish.yml` configured for npm Trusted Publishing.

**Trusted Publishing setup (if needed):**
1. Go to npmjs.com → Package Settings → Trusted Publishing
2. Add GitHub Actions publisher:
   - Owner: `jakekinchen`
   - Repository: `three-sdf-loader`
   - Workflow: `publish.yml`
   - Environment: *(empty)*

**Notes:**
- npm Trusted Publishing requires npm CLI `>= 11.5.1` (the publish workflow installs a compatible npm version).
- Avoid using long-lived npm tokens in CI; Trusted Publishing should be sufficient.

### Manual Publish (fallback)

Only use manual publishing if CI publishing is unavailable.

```bash
npm run lint
npm run test:coverage
npm run size
npm run build
npm login
npm publish --access public
```

### CI Checks

On every push/PR, GitHub Actions runs:
- `npm run lint`
- `npm test -- --coverage`
- `npm run size` (bundle size limit: 150 kB)

## Code Style

- ESLint enforces style (run `npm run lint`)
- Use destructuring where possible
- Prefer `const` over `let`
- No semicolons (project uses ASI)

## Testing Guidelines

- Tests are in `test/*.test.js` using Vitest
- Test files should import from `../src/index`
- Use descriptive test names
- Add regression tests when fixing bugs

## Project Structure

```
src/index.js          # Main source (single file)
types/index.d.ts      # TypeScript declarations
dist/                 # Built output (generated)
test/                 # Test files
.github/workflows/    # CI configuration
```

## Key APIs

### Bond Metadata (v0.6.4+)

Bond meshes expose classification metadata:
- `originalOrder`: Raw bond order (0=coordination, 4=aromatic)
- `isCoordination`: True for ionic/metal-ligand bonds
- `isBridge`: True for three-center bonds
- `isAromatic`: True for aromatic bonds
- `source`: `'molfile'` | `'inferredCoordination'` | `'inferredBridge'`

See README.md "Bond Metadata" section for usage examples.
