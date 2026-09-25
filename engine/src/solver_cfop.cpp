#include <array>
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include "cfop_algs.hpp"
#include "quickcube/solvers.hpp"

namespace quickcube {

namespace {

constexpr int kLocationCount = 24;
constexpr int kTrackedPieceCount = 4;
constexpr int kTableSize = kLocationCount * kLocationCount * kLocationCount * kLocationCount;
constexpr int kSlotCount = 4;
constexpr int kMaxF2lDepth = 20;
constexpr uint8_t kUnvisited = 0xFF;

struct LocationMoves {
    std::array<std::array<uint8_t, kLocationCount>, kMoveCount> corner{};
    std::array<std::array<uint8_t, kLocationCount>, kMoveCount> edge{};
};

struct TrackedPiece {
    bool isCorner = false;
    uint8_t solvedLocation = 0;
};

using TrackedGroup = std::array<TrackedPiece, kTrackedPieceCount>;
using GroupLocations = std::array<uint8_t, kTrackedPieceCount>;

struct F2lState {
    GroupLocations crossEdges{};
    GroupLocations slotCorners{};
    GroupLocations slotEdges{};
};

struct CfopTables {
    LocationMoves locationMoves;
    std::vector<uint8_t> crossDistance;
    std::array<std::vector<uint8_t>, kSlotCount> slotDistance;
    std::vector<int16_t> ollCaseByPattern;
    std::vector<int16_t> pllCaseByPattern;
    std::vector<std::vector<Move>> ollMoves;
    std::vector<std::vector<Move>> pllMoves;
};

uint8_t cornerLocation(int position, int orientation) {
    return static_cast<uint8_t>(position * 3 + orientation);
}

uint8_t edgeLocation(int position, int orientation) {
    return static_cast<uint8_t>(position * 2 + orientation);
}

LocationMoves buildLocationMoves() {
    LocationMoves locationMoves;
    for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
        const CubieCube& move = moveCube(moveIndex);
        for (int target = 0; target < kCornerCount; ++target) {
            const int source = move.cornerPermutation[target];
            for (int orientation = 0; orientation < 3; ++orientation) {
                locationMoves.corner[moveIndex][cornerLocation(source, orientation)] =
                    cornerLocation(target, (orientation + move.cornerOrientation[target]) % 3);
            }
        }
        for (int target = 0; target < kEdgeCount; ++target) {
            const int source = move.edgePermutation[target];
            for (int orientation = 0; orientation < 2; ++orientation) {
                locationMoves.edge[moveIndex][edgeLocation(source, orientation)] =
                    edgeLocation(target, orientation ^ move.edgeOrientation[target]);
            }
        }
    }
    return locationMoves;
}

int groupIndex(const GroupLocations& locations) {
    int index = 0;
    for (const uint8_t location : locations) {
        index = index * kLocationCount + location;
    }
    return index;
}

GroupLocations decodeGroupIndex(int index) {
    GroupLocations locations{};
    for (int slot = kTrackedPieceCount - 1; slot >= 0; --slot) {
        locations[slot] = static_cast<uint8_t>(index % kLocationCount);
        index /= kLocationCount;
    }
    return locations;
}

uint8_t moveLocation(const LocationMoves& locationMoves, bool isCorner, int moveIndex, uint8_t location) {
    return isCorner ? locationMoves.corner[moveIndex][location] : locationMoves.edge[moveIndex][location];
}

std::vector<uint8_t> buildDistanceTable(const LocationMoves& locationMoves, const TrackedGroup& group) {
    std::vector<uint8_t> distance(kTableSize, kUnvisited);
    GroupLocations solvedLocations{};
    for (int piece = 0; piece < kTrackedPieceCount; ++piece) {
        solvedLocations[piece] = group[piece].solvedLocation;
    }
    std::vector<int> frontier{groupIndex(solvedLocations)};
    distance[frontier.front()] = 0;
    for (uint8_t depth = 0; !frontier.empty(); ++depth) {
        std::vector<int> nextFrontier;
        for (const int index : frontier) {
            const GroupLocations locations = decodeGroupIndex(index);
            for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
                GroupLocations movedLocations{};
                for (int piece = 0; piece < kTrackedPieceCount; ++piece) {
                    movedLocations[piece] = moveLocation(locationMoves, group[piece].isCorner, moveIndex, locations[piece]);
                }
                const int movedIndex = groupIndex(movedLocations);
                if (distance[movedIndex] == kUnvisited) {
                    distance[movedIndex] = static_cast<uint8_t>(depth + 1);
                    nextFrontier.push_back(movedIndex);
                }
            }
        }
        frontier.swap(nextFrontier);
    }
    return distance;
}

TrackedGroup crossGroup() {
    TrackedGroup group{};
    for (int piece = 0; piece < kTrackedPieceCount; ++piece) {
        group[piece] = {false, edgeLocation(DR + piece, 0)};
    }
    return group;
}

int adjacentCrossEdge(int slot, int side) {
    return (slot + side) % kSlotCount;
}

TrackedGroup slotGroup(int slot) {
    return {
        TrackedPiece{true, cornerLocation(DFR + slot, 0)},
        TrackedPiece{false, edgeLocation(FR + slot, 0)},
        TrackedPiece{false, edgeLocation(DR + adjacentCrossEdge(slot, 0), 0)},
        TrackedPiece{false, edgeLocation(DR + adjacentCrossEdge(slot, 1), 0)},
    };
}

GroupLocations slotGroupLocations(const F2lState& state, int slot) {
    return {state.slotCorners[slot], state.slotEdges[slot], state.crossEdges[adjacentCrossEdge(slot, 0)],
            state.crossEdges[adjacentCrossEdge(slot, 1)]};
}

bool lastLayerPiecesOnly(const CubieCube& cube) {
    for (int corner = DFR; corner < kCornerCount; ++corner) {
        if (cube.cornerPermutation[corner] != corner || cube.cornerOrientation[corner] != 0) {
            return false;
        }
    }
    for (int edge = DR; edge < kEdgeCount; ++edge) {
        if (cube.edgePermutation[edge] != edge || cube.edgeOrientation[edge] != 0) {
            return false;
        }
    }
    return true;
}

int orientationPattern(const CubieCube& cube) {
    int pattern = 0;
    for (int corner = URF; corner <= UBR; ++corner) {
        pattern = pattern * 3 + cube.cornerOrientation[corner];
    }
    for (int edge = UR; edge <= UB; ++edge) {
        pattern = pattern * 2 + cube.edgeOrientation[edge];
    }
    return pattern;
}

constexpr int kOrientationPatternCount = 81 * 16;
constexpr int kPermutationPatternCount = 1 << 16;

int permutationPattern(const CubieCube& cube) {
    int pattern = 0;
    for (int corner = URF; corner <= UBR; ++corner) {
        pattern = (pattern << 2) | cube.cornerPermutation[corner];
    }
    for (int edge = UR; edge <= UB; ++edge) {
        pattern = (pattern << 2) | cube.edgePermutation[edge];
    }
    return pattern;
}

bool lastLayerOriented(const CubieCube& cube) {
    return lastLayerPiecesOnly(cube) && orientationPattern(cube) == 0;
}

std::vector<Move> upTurn(int quarterTurns) {
    return quarterTurns == 0 ? std::vector<Move>{} : std::vector<Move>{Move{U, static_cast<uint8_t>(quarterTurns)}};
}

std::vector<Move> joinMoves(const std::vector<Move>& first, const std::vector<Move>& second) {
    std::vector<Move> joined = first;
    joined.insert(joined.end(), second.begin(), second.end());
    return joined;
}

void buildOllCases(CfopTables& tables) {
    tables.ollCaseByPattern.assign(kOrientationPatternCount, -1);
    for (const NamedAlgorithm& algorithm : ollAlgorithms()) {
        const std::vector<Move> moves = expandAlgorithm(algorithm.notation);
        CubieCube caseCube;
        caseCube.applyMoves(invertMoves(moves));
        const int caseIndex = static_cast<int>(tables.ollMoves.size());
        tables.ollMoves.push_back(moves);
        if (moves.empty() || !lastLayerPiecesOnly(caseCube)) {
            continue;
        }
        int16_t& entry = tables.ollCaseByPattern[orientationPattern(caseCube)];
        if (entry < 0) {
            entry = static_cast<int16_t>(caseIndex);
        }
    }
}

void buildPllCases(CfopTables& tables) {
    tables.pllCaseByPattern.assign(kPermutationPatternCount, -1);
    for (const NamedAlgorithm& algorithm : pllAlgorithms()) {
        const std::vector<Move> moves = expandAlgorithm(algorithm.notation);
        const int caseIndex = static_cast<int>(tables.pllMoves.size());
        tables.pllMoves.push_back(moves);
        CubieCube caseCube;
        caseCube.applyMoves(invertMoves(moves));
        if (moves.empty() || !lastLayerOriented(caseCube)) {
            continue;
        }
        for (int postTurn = 0; postTurn < 4; ++postTurn) {
            CubieCube postTurnedCase;
            postTurnedCase.applyMoves(invertMoves(upTurn(postTurn)));
            postTurnedCase.applyMoves(invertMoves(moves));
            int16_t& entry = tables.pllCaseByPattern[permutationPattern(postTurnedCase)];
            if (entry < 0) {
                entry = static_cast<int16_t>(caseIndex);
            }
        }
    }
}

CfopTables buildTables() {
    CfopTables tables;
    tables.locationMoves = buildLocationMoves();
    tables.crossDistance = buildDistanceTable(tables.locationMoves, crossGroup());
    for (int slot = 0; slot < kSlotCount; ++slot) {
        tables.slotDistance[slot] = buildDistanceTable(tables.locationMoves, slotGroup(slot));
    }
    buildOllCases(tables);
    buildPllCases(tables);
    return tables;
}

const CfopTables& cfopTables() {
    static const CfopTables tables = buildTables();
    return tables;
}

F2lState f2lStateOf(const CubieCube& cube) {
    F2lState state;
    for (int position = 0; position < kEdgeCount; ++position) {
        const int piece = cube.edgePermutation[position];
        const uint8_t location = edgeLocation(position, cube.edgeOrientation[position]);
        if (piece >= DR && piece <= DB) {
            state.crossEdges[piece - DR] = location;
        } else if (piece >= FR) {
            state.slotEdges[piece - FR] = location;
        }
    }
    for (int position = 0; position < kCornerCount; ++position) {
        const int piece = cube.cornerPermutation[position];
        if (piece >= DFR) {
            state.slotCorners[piece - DFR] = cornerLocation(position, cube.cornerOrientation[position]);
        }
    }
    return state;
}

F2lState applyLocationMove(const LocationMoves& locationMoves, const F2lState& state, int moveIndex) {
    F2lState moved;
    for (int piece = 0; piece < kTrackedPieceCount; ++piece) {
        moved.crossEdges[piece] = locationMoves.edge[moveIndex][state.crossEdges[piece]];
        moved.slotEdges[piece] = locationMoves.edge[moveIndex][state.slotEdges[piece]];
        moved.slotCorners[piece] = locationMoves.corner[moveIndex][state.slotCorners[piece]];
    }
    return moved;
}

bool redundantAfter(int face, int previousFace) {
    return face == previousFace || (previousFace >= 0 && oppositeFace(face) == previousFace && face < previousFace);
}

class CrossSolver {
public:
    explicit CrossSolver(const CfopTables& tables) : tables_(tables) {}

    std::vector<Move> solve(const F2lState& start) const {
        std::vector<Move> path;
        F2lState state = start;
        int remaining = tables_.crossDistance[groupIndex(state.crossEdges)];
        int previousFace = -1;
        while (remaining > 0) {
            for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
                const Move move = Move::fromIndex(moveIndex);
                if (redundantAfter(move.face, previousFace)) {
                    continue;
                }
                const F2lState moved = applyLocationMove(tables_.locationMoves, state, moveIndex);
                const int movedDistance = tables_.crossDistance[groupIndex(moved.crossEdges)];
                if (movedDistance < remaining) {
                    path.push_back(move);
                    state = moved;
                    remaining = movedDistance;
                    previousFace = move.face;
                    break;
                }
            }
        }
        return path;
    }

private:
    const CfopTables& tables_;
};

class PairSolver {
public:
    PairSolver(const CfopTables& tables, int targetSlot, unsigned solvedSlotMask)
        : tables_(tables), requiredSlotMask_(solvedSlotMask | (1u << targetSlot)) {}

    bool searchWithin(const F2lState& start, int depthLimit, std::vector<Move>& solution) {
        path_.clear();
        if (!search(start, depthLimit, -1)) {
            return false;
        }
        solution = path_;
        return true;
    }

private:
    int lowerBound(const F2lState& state) const {
        int bound = tables_.crossDistance[groupIndex(state.crossEdges)];
        for (int slot = 0; slot < kSlotCount; ++slot) {
            if (requiredSlotMask_ & (1u << slot)) {
                const int slotBound = tables_.slotDistance[slot][groupIndex(slotGroupLocations(state, slot))];
                bound = slotBound > bound ? slotBound : bound;
            }
        }
        return bound;
    }

    bool search(const F2lState& state, int depthRemaining, int previousFace) {
        const int bound = lowerBound(state);
        if (bound == 0) {
            return true;
        }
        if (bound > depthRemaining) {
            return false;
        }
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            const Move move = Move::fromIndex(moveIndex);
            if (redundantAfter(move.face, previousFace)) {
                continue;
            }
            path_.push_back(move);
            if (search(applyLocationMove(tables_.locationMoves, state, moveIndex), depthRemaining - 1, move.face)) {
                return true;
            }
            path_.pop_back();
        }
        return false;
    }

    const CfopTables& tables_;
    unsigned requiredSlotMask_;
    std::vector<Move> path_;
};

bool solveNextPair(const CfopTables& tables, const CubieCube& cube, unsigned& solvedSlotMask, std::vector<Move>& pairMoves) {
    const F2lState state = f2lStateOf(cube);
    for (int depthLimit = 0; depthLimit <= kMaxF2lDepth; ++depthLimit) {
        for (int slot = 0; slot < kSlotCount; ++slot) {
            if (solvedSlotMask & (1u << slot)) {
                continue;
            }
            PairSolver pairSolver(tables, slot, solvedSlotMask);
            if (pairSolver.searchWithin(state, depthLimit, pairMoves)) {
                solvedSlotMask |= 1u << slot;
                return true;
            }
        }
    }
    return false;
}

bool solveLastLayerStep(const CubieCube& cube, const std::vector<int16_t>& caseByPattern,
                        const std::vector<std::vector<Move>>& caseMoves, int (*pattern)(const CubieCube&),
                        bool (*finished)(const CubieCube&), int& chosenCase, std::vector<Move>& stepMoves) {
    bool found = false;
    for (int preTurn = 0; preTurn < 4; ++preTurn) {
        CubieCube turned = cube;
        turned.applyMoves(upTurn(preTurn));
        std::vector<Move> candidate;
        int candidateCase = -1;
        if (finished(turned)) {
            candidate = upTurn(preTurn);
        } else {
            const int16_t caseIndex = caseByPattern[pattern(turned)];
            if (caseIndex < 0) {
                continue;
            }
            candidateCase = caseIndex;
            candidate = joinMoves(upTurn(preTurn), caseMoves[caseIndex]);
            for (int postTurn = 0; postTurn < 4; ++postTurn) {
                CubieCube finishedCube = turned;
                finishedCube.applyMoves(caseMoves[caseIndex]);
                finishedCube.applyMoves(upTurn(postTurn));
                if (finished(finishedCube)) {
                    candidate = joinMoves(candidate, upTurn(postTurn));
                    break;
                }
            }
        }
        candidate = simplifyMoves(candidate);
        CubieCube verified = cube;
        verified.applyMoves(candidate);
        if (!finished(verified)) {
            continue;
        }
        if (!found || candidate.size() < stepMoves.size()) {
            found = true;
            stepMoves = candidate;
            chosenCase = candidateCase;
        }
    }
    return found;
}

bool cubeSolved(const CubieCube& cube) {
    return cube.isSolved();
}

}

void initCfopTables() { cfopTables(); }

SolveResult solveCfop(const CubieCube& cube) {
    const auto startTime = std::chrono::steady_clock::now();
    SolveResult result;
    const CfopTables& tables = cfopTables();
    CubieCube working = cube;

    const std::vector<Move> crossMoves = CrossSolver(tables).solve(f2lStateOf(working));
    working.applyMoves(crossMoves);
    result.stages.push_back({"Cross", crossMoves, ""});

    unsigned solvedSlotMask = 0;
    for (int pairNumber = 1; pairNumber <= kSlotCount; ++pairNumber) {
        std::vector<Move> pairMoves;
        if (!solveNextPair(tables, working, solvedSlotMask, pairMoves)) {
            result.error = "F2L search failed";
            return result;
        }
        working.applyMoves(pairMoves);
        result.stages.push_back({"F2L " + std::to_string(pairNumber), pairMoves, ""});
    }

    int ollCase = -1;
    std::vector<Move> ollMoves;
    if (!solveLastLayerStep(working, tables.ollCaseByPattern, tables.ollMoves, orientationPattern, lastLayerOriented,
                            ollCase, ollMoves)) {
        result.error = "Unrecognized OLL case";
        return result;
    }
    working.applyMoves(ollMoves);
    result.stages.push_back({"OLL", ollMoves, ollCase < 0 ? "OLL skip" : ollAlgorithms()[ollCase].name});

    int pllCase = -1;
    std::vector<Move> pllMoves;
    if (!solveLastLayerStep(working, tables.pllCaseByPattern, tables.pllMoves, permutationPattern, cubeSolved,
                            pllCase, pllMoves)) {
        result.error = "Unrecognized PLL case";
        return result;
    }
    working.applyMoves(pllMoves);
    result.stages.push_back({"PLL", pllMoves, pllCase < 0 ? "PLL skip" : pllAlgorithms()[pllCase].name});

    result.ok = working.isSolved();
    if (!result.ok) {
        result.error = "CFOP produced an unsolved cube";
    }
    result.timeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count();
    return result;
}

}
