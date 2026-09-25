import { faceColorNames, isFace } from '../cube/facelets'

const stageExplainers: Array<[RegExp, string]> = [
  [/^two-phase$/i, 'Shortest route, computed'],
  [/^phase 1$/i, 'Orient every piece'],
  [/^phase 2$/i, 'Finish with restricted turns'],
  [/^first cross$/i, 'Build a cross underneath'],
  [/^first corners$/i, 'Complete the bottom layer'],
  [/^middle layer$/i, 'Slot the four middle edges'],
  [/^last cross$/i, 'Form a cross on top'],
  [/^last edges$/i, 'Match top edges to sides'],
  [/^last corners \(position\)$/i, 'Move top corners home'],
  [/^last corners \(orient\)$/i, 'Twist top corners solved'],
  [/^cross$/i, 'Solve the bottom cross'],
  [/^f2l/i, 'Pair and insert corner-edge'],
  [/^oll$/i, 'Make the top one color'],
  [/^pll$/i, 'Permute last layer to solved'],
]

export function stageExplainer(stageName: string): string {
  return stageExplainers.find(([pattern]) => pattern.test(stageName))?.[1] ?? ''
}

function colorName(facelets: string, centerIndex: number): string {
  const center = facelets[centerIndex]
  return isFace(center) ? faceColorNames[center] : ''
}

export function stageDisplayName(stageName: string, facelets: string): string {
  const bottomColor = colorName(facelets, 31)
  const topColor = colorName(facelets, 4)
  return stageName
    .replace(/^First /, `${bottomColor} `)
    .replace(/^Last corners \(position\)$/, `${topColor} corners · place`)
    .replace(/^Last corners \(orient\)$/, `${topColor} corners · twist`)
    .replace(/^Last /, `${topColor} `)
}
