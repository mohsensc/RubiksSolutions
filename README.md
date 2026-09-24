# QuickCube

A 3D Rubik's cube in the browser, solved by a C++ engine compiled to WebAssembly.

**Live:** https://mohsensc.github.io/QuickCube/

```mermaid
flowchart LR
  UI["React + three.js UI"] -- postMessage --> Worker["Web Worker"]
  Worker -- cwrap --> Engine["C++ engine (WASM)"]
```

## Solvers

| Method | Approach | Avg moves | Avg time |
|---|---|---|---|
| Optimal | Kociemba two-phase with pruning tables | 19.1 | 60 ms |
| CFOP | Optimal cross, F2L pair search, 57 OLL + 21 PLL cases | 54.4 | 0.2 ms |
| Beginner | Layer by layer from the D face, 7 stages | 140.1 | 0.1 ms |

Measured by `ctest` on random scrambles (120 optimal, 600 CFOP and beginner), native build on an Apple Silicon Mac. Optimal table setup takes about 0.4 s once.

## Run

```sh
cd web && npm install && npm run dev
```

`web/src/wasm/quickcube.js` is committed, so the app runs without Emscripten.

## Build and test

```sh
cmake -S engine -B engine/build && cmake --build engine/build -j
ctest --test-dir engine/build
engine/build_wasm.sh
cd web && npm test && npm run build
```

## Keys

`U R F D L B` turn a face, `Shift` reverses, `Backspace` undoes, `Space` plays or pauses, arrows step.

## Layout

- `engine/` C++17 solvers, `qc` CLI, native tests
- `web/` Vite, React, react-three-fiber
- `docs/CONTRACT.md` engine to web interface

Pushes to `main` test, build and deploy to GitHub Pages.
