# Rubiks Solutions

A 3D Rubik's cube you can play with in the browser, and a solver that shows you exactly how to finish it. Live at [rubiks.solutions](https://rubiks.solutions).

## What it does

- Spin and turn a floating 3D cube with buttons, keys (`U R F D L B`, `Shift` for prime) or by dragging stickers
- Shuffle, reset and undo
- Paint your own cube: it unfolds flat, you tap in your colors, and it tells you if the pattern is impossible
- Solve it three ways and watch every move play out at the speed you pick
- A short handbook behind the `?` button

## The C++ behind it

All solving happens in a C++17 engine compiled to WebAssembly, so it runs right in your browser.

- **Fastest** uses Kociemba's two-phase algorithm: IDA* search over cube coordinates with precomputed move and pruning tables. Averages about 19 moves.
- **CFOP** finds an optimal cross with IDA*, solves each F2L pair with a bounded search, then finishes with lookup tables for all 57 OLL and 21 PLL cases. Around 55 moves.
- **Beginner** follows the classic layer-by-layer method, using small constrained searches per piece. Longer (about 140 moves) but easy to follow.

To run it locally:

```sh
cd web && npm install && npm run dev
```

The engine has its own tests (`cmake -S engine -B engine/build && ctest --test-dir engine/build`) and rebuilds to WASM with `engine/build_wasm.sh`.
