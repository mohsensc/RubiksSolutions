import { describe, expect, it } from 'vitest'
import { solvedFacelets } from './facelets'
import { allMoves, applyMoves } from './moves'
import { generateScramble } from './scramble'

interface QuickCubeModule {
  cwrap: (name: string, returnType: 'string', argumentTypes: string[]) => (...args: Array<string | number>) => string
}

const wasmModuleLoaders = import.meta.glob<{ default: () => Promise<QuickCubeModule> }>('../wasm/quickcube.js')
const loadWasmModule = wasmModuleLoaders['../wasm/quickcube.js']

describe.skipIf(!loadWasmModule)('engine parity', () => {
  it('applies every move sequence exactly like the engine', async () => {
    const wasmModule = await (await loadWasmModule!()).default()
    wasmModule.cwrap('qc_init', 'string', [])()
    const engineApply = wasmModule.cwrap('qc_apply', 'string', ['string', 'string'])
    const sequences = [...allMoves.map((move) => [move]), ...Array.from({ length: 200 }, (_, index) => generateScramble(1 + (index % 40)))]
    for (const sequence of sequences) {
      const moves = sequence.join(' ')
      const engineResult = JSON.parse(engineApply(solvedFacelets, moves))
      expect(engineResult.facelets, moves).toBe(applyMoves(solvedFacelets, sequence))
      const chainedEngine = JSON.parse(engineApply(engineResult.facelets, moves)).facelets
      expect(chainedEngine, moves).toBe(applyMoves(engineResult.facelets, sequence))
    }
  })
})
