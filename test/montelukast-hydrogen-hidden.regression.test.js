/* eslint-disable import/extensions */
import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { loadSDF } from '../src/index.js'

const MONTELUKAST_2D_SDF = fs.readFileSync(new URL('./montelukast_2d.sdf', import.meta.url), 'utf8')

describe('montelukast regression (CID 5281040)', () => {
  it('does not render a stereo wedge bond to a hidden hydrogen when showHydrogen=false', () => {
    const g = loadSDF(MONTELUKAST_2D_SDF, { showHydrogen: false, attachAtomData: true })

    const hydrogenAtoms = g.children.filter(
      (c) => c.isMesh && (c.userData?.atom?.element || c.userData?.atom?.symbol) === 'H',
    )
    expect(hydrogenAtoms).toHaveLength(0)

    const coneWedges = g.children.filter((c) => c.isMesh && c.geometry?.type === 'ConeGeometry')
    expect(coneWedges).toHaveLength(0)
  })
})

