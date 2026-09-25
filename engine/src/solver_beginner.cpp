#include <array>
#include <chrono>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "quickcube/solvers.hpp"

namespace quickcube {

namespace {

constexpr int kEdgeLocationCount = kEdgeCount * 2;
constexpr uint8_t kUnvisited = 255;
constexpr std::array<Edge, 4> kCrossEdges{DR, DF, DL, DB};
constexpr std::array<Face, 4> kSideFaces{F, R, B, L};
constexpr std::array<Corner, 4> kFrameBottomCorner{DFR, DRB, DBL, DLF};
constexpr std::array<Corner, 4> kFrameTopCorner{URF, UBR, ULB, UFL};
constexpr int kMaxCornerTriggerRepeats = 6;
constexpr int kMaxOrientTriggerRepeats = 3;

using CubePredicate = std::function<bool(const CubieCube&)>;

std::vector<Move> movesFromText(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    parseMoves(text, moves, error);
    return moves;
}

Move mapMoveToFrame(Move move, int frame) {
    for (int sideIndex = 0; sideIndex < 4; ++sideIndex) {
        if (move.face == kSideFaces[sideIndex]) {
            return Move{static_cast<uint8_t>(kSideFaces[(sideIndex + frame) % 4]), move.turns};
        }
    }
    return move;
}

std::vector<Move> mapMovesToFrame(const std::vector<Move>& moves, int frame) {
    std::vector<Move> mapped;
    mapped.reserve(moves.size());
    for (const Move move : moves) {
        mapped.push_back(mapMoveToFrame(move, frame));
    }
    return mapped;
}

bool isEdgeSolved(const CubieCube& cube, int edge) {
    return cube.edgePermutation[edge] == edge && cube.edgeOrientation[edge] == 0;
}

bool isCornerSolved(const CubieCube& cube, int corner) {
    return cube.cornerPermutation[corner] == corner && cube.cornerOrientation[corner] == 0;
}

int findEdge(const CubieCube& cube, int edge) {
    for (int position = 0; position < kEdgeCount; ++position) {
        if (cube.edgePermutation[position] == edge) {
            return position;
        }
    }
    return -1;
}

int findCorner(const CubieCube& cube, int corner) {
    for (int position = 0; position < kCornerCount; ++position) {
        if (cube.cornerPermutation[position] == corner) {
            return position;
        }
    }
    return -1;
}

bool isCrossSolved(const CubieCube& cube) {
    for (const Edge edge : kCrossEdges) {
        if (!isEdgeSolved(cube, edge)) {
            return false;
        }
    }
    return true;
}

bool isFirstLayerSolved(const CubieCube& cube) {
    if (!isCrossSolved(cube)) {
        return false;
    }
    for (int corner = DFR; corner <= DRB; ++corner) {
        if (!isCornerSolved(cube, corner)) {
            return false;
        }
    }
    return true;
}

int solvedMiddleEdgeMask(const CubieCube& cube) {
    int mask = 0;
    for (int edge = FR; edge <= BR; ++edge) {
        if (isEdgeSolved(cube, edge)) {
            mask |= 1 << (edge - FR);
        }
    }
    return mask;
}

bool areFirstTwoLayersSolved(const CubieCube& cube) {
    return isFirstLayerSolved(cube) && solvedMiddleEdgeMask(cube) == 0b1111;
}

bool areLastLayerEdgesOriented(const CubieCube& cube) {
    for (int edge = UR; edge <= UB; ++edge) {
        if (cube.edgeOrientation[edge] != 0) {
            return false;
        }
    }
    return true;
}

bool areLastLayerEdgesSolved(const CubieCube& cube) {
    for (int edge = UR; edge <= UB; ++edge) {
        if (!isEdgeSolved(cube, edge)) {
            return false;
        }
    }
    return true;
}

bool areLastLayerCornersPlaced(const CubieCube& cube) {
    for (int corner = URF; corner <= UBR; ++corner) {
        if (cube.cornerPermutation[corner] != corner) {
            return false;
        }
    }
    return true;
}

class CrossDistanceTables {
public:
    CrossDistanceTables() {
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            const CubieCube& move = moveCube(moveIndex);
            for (int position = 0; position < kEdgeCount; ++position) {
                const int source = move.edgePermutation[position];
                for (int orientation = 0; orientation < 2; ++orientation) {
                    const int newOrientation = orientation ^ move.edgeOrientation[position];
                    locationAfterMove[moveIndex][source * 2 + orientation] = static_cast<uint8_t>(position * 2 + newOrientation);
                }
            }
        }
    }

    const std::vector<uint8_t>& distancesFor(int edgeMask) {
        auto existing = tablesByMask.find(edgeMask);
        if (existing != tablesByMask.end()) {
            return existing->second;
        }
        return tablesByMask.emplace(edgeMask, buildTable(edgeMask)).first->second;
    }

    int stateIndex(const CubieCube& cube, int edgeMask) const {
        int index = 0;
        for (const Edge edge : kCrossEdges) {
            if (edgeMask & (1 << edge)) {
                const int position = findEdge(cube, edge);
                index = index * kEdgeLocationCount + position * 2 + cube.edgeOrientation[position];
            }
        }
        return index;
    }

private:
    std::array<std::array<uint8_t, kEdgeLocationCount>, kMoveCount> locationAfterMove{};
    std::map<int, std::vector<uint8_t>> tablesByMask;

    static std::vector<int> trackedEdges(int edgeMask) {
        std::vector<int> edges;
        for (const Edge edge : kCrossEdges) {
            if (edgeMask & (1 << edge)) {
                edges.push_back(edge);
            }
        }
        return edges;
    }

    static int encode(const std::vector<int>& locations) {
        int index = 0;
        for (const int location : locations) {
            index = index * kEdgeLocationCount + location;
        }
        return index;
    }

    static std::vector<int> decode(int index, size_t count) {
        std::vector<int> locations(count);
        for (size_t slot = count; slot-- > 0;) {
            locations[slot] = index % kEdgeLocationCount;
            index /= kEdgeLocationCount;
        }
        return locations;
    }

    std::vector<uint8_t> buildTable(int edgeMask) const {
        const std::vector<int> edges = trackedEdges(edgeMask);
        int stateCount = 1;
        for (size_t slot = 0; slot < edges.size(); ++slot) {
            stateCount *= kEdgeLocationCount;
        }
        std::vector<uint8_t> distances(stateCount, kUnvisited);
        std::vector<int> solvedLocations;
        for (const int edge : edges) {
            solvedLocations.push_back(edge * 2);
        }
        std::vector<int> frontier{encode(solvedLocations)};
        distances[frontier.front()] = 0;
        for (uint8_t depth = 0; !frontier.empty(); ++depth) {
            std::vector<int> nextFrontier;
            for (const int state : frontier) {
                const std::vector<int> locations = decode(state, edges.size());
                for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
                    std::vector<int> movedLocations(locations.size());
                    for (size_t slot = 0; slot < locations.size(); ++slot) {
                        movedLocations[slot] = locationAfterMove[moveIndex][locations[slot]];
                    }
                    const int nextState = encode(movedLocations);
                    if (distances[nextState] == kUnvisited) {
                        distances[nextState] = static_cast<uint8_t>(depth + 1);
                        nextFrontier.push_back(nextState);
                    }
                }
            }
            frontier = std::move(nextFrontier);
        }
        return distances;
    }
};

CrossDistanceTables& crossDistanceTables() {
    static CrossDistanceTables tables;
    return tables;
}

struct Macro {
    std::vector<Move> moves;
    bool isLayerTurn = false;
};

std::vector<Macro> layerTurnMacros() {
    return {Macro{{Move{U, 1}}, true}, Macro{{Move{U, 2}}, true}, Macro{{Move{U, 3}}, true}};
}

std::vector<Macro> withLayerTurns(const std::vector<std::vector<Move>>& algorithms) {
    std::vector<Macro> macros = layerTurnMacros();
    for (const auto& algorithm : algorithms) {
        macros.push_back(Macro{algorithm, false});
    }
    return macros;
}

class MacroSearch {
public:
    MacroSearch(const std::vector<Macro>& macros, const CubePredicate& goal) : macros(macros), goal(goal) {}

    std::optional<std::vector<Move>> run(const CubieCube& start, int maxDepth) {
        for (int depthLimit = 0; depthLimit <= maxDepth; ++depthLimit) {
            bestSolution.reset();
            std::vector<Move> path;
            explore(start, depthLimit, false, path);
            if (bestSolution) {
                return bestSolution;
            }
        }
        return std::nullopt;
    }

private:
    const std::vector<Macro>& macros;
    const CubePredicate& goal;
    std::optional<std::vector<Move>> bestSolution;

    void explore(const CubieCube& cube, int remainingDepth, bool lastWasLayerTurn, std::vector<Move>& path) {
        if (remainingDepth == 0) {
            if (goal(cube)) {
                std::vector<Move> simplified = simplifyMoves(path);
                if (!bestSolution || simplified.size() < bestSolution->size()) {
                    bestSolution = std::move(simplified);
                }
            }
            return;
        }
        for (const Macro& macro : macros) {
            if (macro.isLayerTurn && lastWasLayerTurn) {
                continue;
            }
            CubieCube next = cube;
            next.applyMoves(macro.moves);
            const size_t pathSize = path.size();
            path.insert(path.end(), macro.moves.begin(), macro.moves.end());
            explore(next, remainingDepth - 1, macro.isLayerTurn, path);
            path.resize(pathSize);
        }
    }
};

class BeginnerSolver {
public:
    explicit BeginnerSolver(const CubieCube& start) : cube(start) {}

    SolveResult solve() {
        SolveResult result;
        const std::array<std::pair<const char*, std::function<bool()>>, 7> stageRunners{{
            {"First cross", [this] { return solveFirstCross(); }},
            {"First corners", [this] { return solveFirstCorners(); }},
            {"Middle layer", [this] { return solveMiddleLayer(); }},
            {"Last cross", [this] { return solveLastCross(); }},
            {"Last edges", [this] { return solveLastEdges(); }},
            {"Last corners (position)", [this] { return placeLastCorners(); }},
            {"Last corners (orient)", [this] { return orientLastCorners(); }},
        }};
        for (const auto& [stageName, runStage] : stageRunners) {
            stageMoves.clear();
            if (!runStage()) {
                result.error = std::string("Beginner solver could not complete stage '") + stageName + "'";
                result.stages.clear();
                return result;
            }
            result.stages.push_back(Stage{stageName, simplifyMoves(stageMoves), ""});
        }
        result.ok = cube.isSolved();
        if (!result.ok) {
            result.error = "Beginner solver finished without solving the cube";
            result.stages.clear();
        }
        return result;
    }

private:
    CubieCube cube;
    std::vector<Move> stageMoves;

    void apply(const std::vector<Move>& moves) {
        cube.applyMoves(moves);
        stageMoves.insert(stageMoves.end(), moves.begin(), moves.end());
    }

    bool solveFirstCross() {
        CrossDistanceTables& tables = crossDistanceTables();
        int solvedMask = 0;
        for (const Edge edge : kCrossEdges) {
            if (isEdgeSolved(cube, edge)) {
                solvedMask |= 1 << edge;
            }
        }
        while (!isCrossSolved(cube)) {
            int bestMask = -1;
            int bestDistance = kUnvisited;
            for (const Edge edge : kCrossEdges) {
                if (solvedMask & (1 << edge)) {
                    continue;
                }
                const int candidateMask = solvedMask | (1 << edge);
                const int distance = tables.distancesFor(candidateMask)[tables.stateIndex(cube, candidateMask)];
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMask = candidateMask;
                }
            }
            if (bestMask < 0 || !descendCrossTable(bestMask)) {
                return false;
            }
            solvedMask = bestMask;
        }
        return true;
    }

    bool descendCrossTable(int edgeMask) {
        CrossDistanceTables& tables = crossDistanceTables();
        const std::vector<uint8_t>& distances = tables.distancesFor(edgeMask);
        int distance = distances[tables.stateIndex(cube, edgeMask)];
        while (distance > 0) {
            bool improved = false;
            for (int moveIndex = 0; moveIndex < kMoveCount && !improved; ++moveIndex) {
                CubieCube next = cube;
                next.applyMove(Move::fromIndex(moveIndex));
                if (distances[tables.stateIndex(next, edgeMask)] < distance) {
                    apply({Move::fromIndex(moveIndex)});
                    distance = distances[tables.stateIndex(cube, edgeMask)];
                    improved = true;
                }
            }
            if (!improved) {
                return false;
            }
        }
        return true;
    }

    static std::vector<Move> cornerTrigger(int frame) {
        return mapMovesToFrame(movesFromText("R U R' U'"), frame);
    }

    static int frameOfBottomCorner(int corner) {
        for (int frame = 0; frame < 4; ++frame) {
            if (kFrameBottomCorner[frame] == corner) {
                return frame;
            }
        }
        return -1;
    }

    static bool preservesFirstLayerProgress(const CubieCube& candidate, int solvedCornerMask) {
        if (!isCrossSolved(candidate)) {
            return false;
        }
        for (int corner = DFR; corner <= DRB; ++corner) {
            if ((solvedCornerMask & (1 << corner)) && !isCornerSolved(candidate, corner)) {
                return false;
            }
        }
        return true;
    }

    static bool repeatTriggerUntilSolved(CubieCube& working, std::vector<Move>& moves, int frame, int corner) {
        const std::vector<Move> trigger = cornerTrigger(frame);
        for (int repeat = 0; repeat < kMaxCornerTriggerRepeats; ++repeat) {
            if (isCornerSolved(working, corner)) {
                return true;
            }
            working.applyMoves(trigger);
            moves.insert(moves.end(), trigger.begin(), trigger.end());
        }
        return isCornerSolved(working, corner);
    }

    static std::optional<std::vector<Move>> planCornerInsertion(const CubieCube& start, int corner) {
        const int frame = frameOfBottomCorner(corner);
        CubieCube working = start;
        std::vector<Move> moves;
        int position = findCorner(working, corner);
        if (position == corner) {
            CubieCube twistedAttempt = working;
            std::vector<Move> twistedMoves;
            if (repeatTriggerUntilSolved(twistedAttempt, twistedMoves, frame, corner)) {
                return twistedMoves;
            }
        }
        if (position >= DFR) {
            const std::vector<Move> popOut = cornerTrigger(frameOfBottomCorner(position));
            working.applyMoves(popOut);
            moves.insert(moves.end(), popOut.begin(), popOut.end());
            position = findCorner(working, corner);
            if (position >= DFR) {
                return std::nullopt;
            }
        }
        for (int turns = 0; turns < 4 && position != kFrameTopCorner[frame]; ++turns) {
            working.applyMove(Move{U, 1});
            moves.push_back(Move{U, 1});
            position = findCorner(working, corner);
        }
        if (position != kFrameTopCorner[frame] || !repeatTriggerUntilSolved(working, moves, frame, corner)) {
            return std::nullopt;
        }
        return simplifyMoves(moves);
    }

    bool solveFirstCorners() {
        for (int iteration = 0; iteration <= 4; ++iteration) {
            int solvedCornerMask = 0;
            for (int corner = DFR; corner <= DRB; ++corner) {
                if (isCornerSolved(cube, corner)) {
                    solvedCornerMask |= 1 << corner;
                }
            }
            if (isFirstLayerSolved(cube)) {
                return true;
            }
            std::optional<std::vector<Move>> bestPlan;
            for (int corner = DFR; corner <= DRB; ++corner) {
                if (solvedCornerMask & (1 << corner)) {
                    continue;
                }
                std::optional<std::vector<Move>> plan = planCornerInsertion(cube, corner);
                if (!plan) {
                    continue;
                }
                CubieCube candidate = cube;
                candidate.applyMoves(*plan);
                if (!preservesFirstLayerProgress(candidate, solvedCornerMask | (1 << corner))) {
                    continue;
                }
                if (!bestPlan || plan->size() < bestPlan->size()) {
                    bestPlan = std::move(plan);
                }
            }
            if (!bestPlan) {
                return false;
            }
            apply(*bestPlan);
        }
        return isFirstLayerSolved(cube);
    }

    bool solveMiddleLayer() {
        const std::vector<Move> rightInsert = movesFromText("U R U' R' U' F' U F");
        const std::vector<Move> leftInsert = movesFromText("U' L' U L U F U' F'");
        std::vector<std::vector<Move>> algorithms;
        for (int frame = 0; frame < 4; ++frame) {
            algorithms.push_back(mapMovesToFrame(rightInsert, frame));
            algorithms.push_back(mapMovesToFrame(leftInsert, frame));
        }
        const std::vector<Macro> macros = withLayerTurns(algorithms);
        for (int iteration = 0; iteration <= 4; ++iteration) {
            const int solvedMask = solvedMiddleEdgeMask(cube);
            if (solvedMask == 0b1111) {
                return true;
            }
            const CubePredicate insertsAnotherEdge = [solvedMask](const CubieCube& candidate) {
                const int candidateMask = solvedMiddleEdgeMask(candidate);
                return isFirstLayerSolved(candidate) && (candidateMask & solvedMask) == solvedMask &&
                       candidateMask != solvedMask;
            };
            if (!runMacroSearch(macros, insertsAnotherEdge, 5)) {
                return false;
            }
        }
        return areFirstTwoLayersSolved(cube);
    }

    bool solveLastCross() {
        const std::vector<Macro> macros = withLayerTurns({movesFromText("F R U R' U' F'")});
        const CubePredicate goal = [](const CubieCube& candidate) {
            return areFirstTwoLayersSolved(candidate) && areLastLayerEdgesOriented(candidate);
        };
        return runMacroSearch(macros, goal, 7);
    }

    bool solveLastEdges() {
        const std::vector<Macro> macros = withLayerTurns({movesFromText("R U R' U R U2 R'")});
        const CubePredicate goal = [](const CubieCube& candidate) {
            return areFirstTwoLayersSolved(candidate) && areLastLayerEdgesSolved(candidate);
        };
        return runMacroSearch(macros, goal, 9);
    }

    bool placeLastCorners() {
        const std::vector<Move> cornerCycle = movesFromText("U R U' L' U R' U' L");
        std::vector<Macro> macros;
        for (int frame = 0; frame < 4; ++frame) {
            macros.push_back(Macro{mapMovesToFrame(cornerCycle, frame), false});
        }
        const CubePredicate goal = [](const CubieCube& candidate) {
            return areFirstTwoLayersSolved(candidate) && areLastLayerEdgesSolved(candidate) &&
                   areLastLayerCornersPlaced(candidate);
        };
        return runMacroSearch(macros, goal, 4);
    }

    bool orientLastCorners() {
        const std::vector<Move> twistTrigger = movesFromText("R' D' R D R' D' R D");
        for (int corner = 0; corner <= 4; ++corner) {
            for (int turns = 0; turns < 4 && cube.cornerOrientation[URF] == 0; ++turns) {
                apply({Move{U, 1}});
            }
            if (cube.cornerOrientation[URF] == 0) {
                break;
            }
            for (int repeat = 0; repeat < kMaxOrientTriggerRepeats && cube.cornerOrientation[URF] != 0; ++repeat) {
                apply(twistTrigger);
            }
            if (cube.cornerOrientation[URF] != 0) {
                return false;
            }
        }
        for (int turns = 0; turns < 4 && !cube.isSolved(); ++turns) {
            apply({Move{U, 1}});
        }
        return cube.isSolved();
    }

    bool runMacroSearch(const std::vector<Macro>& macros, const CubePredicate& goal, int maxDepth) {
        MacroSearch search(macros, goal);
        std::optional<std::vector<Move>> solution = search.run(cube, maxDepth);
        if (!solution) {
            return false;
        }
        apply(*solution);
        return true;
    }
};

}

void initBeginnerTables() { crossDistanceTables(); }

SolveResult solveBeginner(const CubieCube& cube) {
    const auto startTime = std::chrono::steady_clock::now();
    SolveResult result = BeginnerSolver(cube).solve();
    result.timeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count();
    return result;
}

}
