export function minimumCostAssignment(cost: number[][]): number[] {
  const rows = cost.length
  const columns = cost[0]?.length ?? 0
  if (rows > columns) throw new Error('Assignment needs at least as many columns as rows')
  const rowPotential = new Float64Array(rows + 1)
  const columnPotential = new Float64Array(columns + 1)
  const rowOfColumn = new Int32Array(columns + 1)
  const previousColumn = new Int32Array(columns + 1)
  for (let row = 1; row <= rows; row++) {
    rowOfColumn[0] = row
    let currentColumn = 0
    const slack = new Float64Array(columns + 1).fill(Infinity)
    const visited = new Uint8Array(columns + 1)
    do {
      visited[currentColumn] = 1
      const currentRow = rowOfColumn[currentColumn]
      let delta = Infinity
      let nextColumn = 0
      for (let column = 1; column <= columns; column++) {
        if (visited[column]) continue
        const reduced = cost[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column]
        if (reduced < slack[column]) {
          slack[column] = reduced
          previousColumn[column] = currentColumn
        }
        if (slack[column] < delta) {
          delta = slack[column]
          nextColumn = column
        }
      }
      for (let column = 0; column <= columns; column++) {
        if (visited[column]) {
          rowPotential[rowOfColumn[column]] += delta
          columnPotential[column] -= delta
        } else {
          slack[column] -= delta
        }
      }
      currentColumn = nextColumn
    } while (rowOfColumn[currentColumn] !== 0)
    do {
      const column = previousColumn[currentColumn]
      rowOfColumn[currentColumn] = rowOfColumn[column]
      currentColumn = column
    } while (currentColumn !== 0)
  }
  const columnOfRow = new Array<number>(rows).fill(-1)
  for (let column = 1; column <= columns; column++) {
    if (rowOfColumn[column] !== 0) columnOfRow[rowOfColumn[column] - 1] = column - 1
  }
  return columnOfRow
}
