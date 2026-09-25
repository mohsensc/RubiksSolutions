# Rubiks Solutions interface contract (engine <-> web)

This file is the single source of truth shared by the C++ engine (`engine/`) and the web app (`web/`).

## Layout

```
engine/            C++17 solver library ("backend"), CMake, native tests, wasm build
  include/quickcube/*.hpp
  src/*.cpp
  tests/*.cpp
  wasm/api.cpp     extern "C" exports
  build_wasm.sh    emcc -> web/src/wasm/quickcube.js (ES6 module, SINGLE_FILE)
web/               Vite + React + TypeScript + react-three-fiber app
docs/CONTRACT.md
```

## Facelet string (Kociemba convention)

54 chars, faces in order **U R F D L B**, each face 9 stickers read row by row
(index 0..8) as seen looking straight at that face with this orientation:

- U: viewed from above, B side at the top of the grid, F side at the bottom.
- R, F, L, B: viewed from outside, U side at top.
- D: viewed from below, F side at top, B side at bottom.

Face offsets: U=0, R=9, F=18, D=27, L=36, B=45. Center of face = offset+4.
Each char is one of `U R F D L B` = which face's color that sticker has.
Solved: `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`.

Default color scheme (Western): U=white, R=red, F=green, D=yellow, L=orange, B=blue.

## Moves

Outer face turns only, Singmaster notation: `U U' U2 R R' R2 F F' F2 D D' D2 L L' L2 B B' B2`.
A clockwise turn is clockwise when looking at that face from outside the cube.
Move sequences are space-separated strings.

## WASM exports (C ABI, called via `cwrap`)

Every function returns a pointer to a NUL-terminated UTF-8 JSON string owned by the
engine (valid until the next call). No manual freeing.

| export | args | returns JSON |
|---|---|---|
| `qc_init()` | – | `{"ok":true}` (builds tables; call once, may take ~1 s) |
| `qc_validate(facelets)` | string | `{"ok":true}` or `{"ok":false,"error":"..."}` |
| `qc_apply(facelets, moves)` | string, string | `{"ok":true,"facelets":"..."}` |
| `qc_scramble(seed, length)` | int, int | `{"ok":true,"moves":"R U2 F' ..."}` (random-state not required; no consecutive same-face or redundant moves) |
| `qc_solve(facelets, method)` | string, string (`"optimal"` \| `"beginner"` \| `"cfop"`) | see below |

Solve result:

```json
{
  "ok": true,
  "method": "cfop",
  "moves": ["R", "U'", "F2"],
  "moveCount": 57,
  "timeMs": 12.3,
  "stages": [
    {"name": "Cross", "moves": ["..."]},
    {"name": "F2L 1", "moves": ["..."]},
    {"name": "OLL", "moves": ["..."], "case": "OLL 21"},
    {"name": "PLL", "moves": ["..."], "case": "T-perm"}
  ]
}
```

`moves` equals the concatenation of all stage moves. Applying `moves` to the input state
must yield the solved state. Errors: `{"ok":false,"error":"human readable reason"}`.

- `optimal`: Kociemba two-phase. Stops shortly after reaching <= 20 moves; otherwise returns the best found within a 3 s budget (never above 22 in practice).
  Single stage `{"name":"Two-phase"}` (or "Phase 1"/"Phase 2").
- `beginner`: layer-by-layer with stages exactly: `First cross`, `First corners`, `Middle layer`,
  `Last cross`, `Last edges`, `Last corners (position)`, `Last corners (orient)`. The engine builds the
  first layer on the **D face** (whatever color is at the D center) so the user watches it
  form on the bottom; stage names use the actual center colors only in the UI, the engine
  uses the names listed here.
- `cfop`: Cross on D, 4 F2L pairs, OLL, PLL. Stage names as above; OLL/PLL include case names.

Moves are always simplified within a stage (merge `R R` -> `R2`, cancel `R R'`). Across a stage
border, moves that cancel are removed from both stages; a partial merge is folded into the later stage.
