#!/usr/bin/env bash
set -euo pipefail

engineDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
outputDir="$engineDir/../web/src/wasm"

if ! command -v em++ >/dev/null 2>&1; then
    echo "em++ not found: install Emscripten (brew install emscripten)" >&2
    exit 1
fi

mkdir -p "$outputDir"

em++ -O3 -std=c++17 \
    -I "$engineDir/include" \
    "$engineDir"/src/*.cpp "$engineDir/wasm/api.cpp" \
    -o "$outputDir/quickcube.js" \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sSINGLE_FILE=1 \
    -sENVIRONMENT=web,worker \
    -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORT_NAME=createQuickCube \
    -sEXPORTED_FUNCTIONS=_qc_init,_qc_validate,_qc_apply,_qc_scramble,_qc_solve \
    -sEXPORTED_RUNTIME_METHODS=cwrap,ccall

echo "wrote $outputDir/quickcube.js"
