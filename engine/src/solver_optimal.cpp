#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <vector>

#include "quickcube/solvers.hpp"

namespace quickcube {

namespace {

constexpr int kTwistCount = 2187;
constexpr int kFlipCount = 2048;
constexpr int kSliceCount = 495;
constexpr int kSlicePermutationCount = 24;
constexpr int kSliceSortedCount = kSliceCount * kSlicePermutationCount;
constexpr int kCornerPermutationCount = 40320;
constexpr int kUdEdgePermutationCount = 40320;
constexpr int kPhaseTwoMoveCount = 10;
constexpr int kMaxPhaseOneDepth = 20;
constexpr int kMaxPhaseTwoDepth = 18;
constexpr int kTargetLength = 20;
constexpr int kNoSolution = 99;
constexpr double kSearchBudgetMs = 3000.0;
constexpr double kRefineBudgetMs = 60.0;
constexpr long long kClockCheckInterval = 0x3FF;
constexpr uint8_t kUnvisited = 0xFF;
constexpr int kNoFace = -1;

constexpr std::array<int, kPhaseTwoMoveCount> kPhaseTwoMoves{0, 1, 2, 4, 7, 9, 10, 11, 13, 16};

using Clock = std::chrono::steady_clock;

constexpr std::array<int, 13> kFactorials{1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600};

int factorial(int value) { return kFactorials[value]; }

int binomial(int total, int chosen) {
    if (chosen < 0 || chosen > total) {
        return 0;
    }
    int result = 1;
    for (int step = 1; step <= chosen; ++step) {
        result = result * (total - chosen + step) / step;
    }
    return result;
}

template <size_t Size>
int rankPermutation(const std::array<uint8_t, Size>& permutation) {
    int rank = 0;
    for (size_t position = 0; position < Size; ++position) {
        int smallerAfter = 0;
        for (size_t later = position + 1; later < Size; ++later) {
            if (permutation[later] < permutation[position]) {
                ++smallerAfter;
            }
        }
        rank += smallerAfter * factorial(static_cast<int>(Size - 1 - position));
    }
    return rank;
}

template <size_t Size>
std::array<uint8_t, Size> unrankPermutation(int rank) {
    std::vector<uint8_t> remaining;
    for (size_t value = 0; value < Size; ++value) {
        remaining.push_back(static_cast<uint8_t>(value));
    }
    std::array<uint8_t, Size> permutation{};
    for (size_t position = 0; position < Size; ++position) {
        const int blockSize = factorial(static_cast<int>(Size - 1 - position));
        const int pick = rank / blockSize;
        rank %= blockSize;
        permutation[position] = remaining[pick];
        remaining.erase(remaining.begin() + pick);
    }
    return permutation;
}

int twistOf(const CubieCube& cube) {
    int twist = 0;
    for (int corner = 0; corner < kCornerCount - 1; ++corner) {
        twist = twist * 3 + cube.cornerOrientation[corner];
    }
    return twist;
}

void setTwist(CubieCube& cube, int twist) {
    int orientationSum = 0;
    for (int corner = kCornerCount - 2; corner >= 0; --corner) {
        cube.cornerOrientation[corner] = static_cast<uint8_t>(twist % 3);
        orientationSum += twist % 3;
        twist /= 3;
    }
    cube.cornerOrientation[kCornerCount - 1] = static_cast<uint8_t>((3 - orientationSum % 3) % 3);
}

int flipOf(const CubieCube& cube) {
    int flip = 0;
    for (int edge = 0; edge < kEdgeCount - 1; ++edge) {
        flip = flip * 2 + cube.edgeOrientation[edge];
    }
    return flip;
}

void setFlip(CubieCube& cube, int flip) {
    int orientationSum = 0;
    for (int edge = kEdgeCount - 2; edge >= 0; --edge) {
        cube.edgeOrientation[edge] = static_cast<uint8_t>(flip % 2);
        orientationSum += flip % 2;
        flip /= 2;
    }
    cube.edgeOrientation[kEdgeCount - 1] = static_cast<uint8_t>(orientationSum % 2);
}

bool isSliceEdge(int edge) { return edge >= FR; }

int sliceSortedOf(const CubieCube& cube) {
    int slice = 0;
    int sliceEdgesSeen = 0;
    std::array<uint8_t, 4> sliceEdgeOrder{};
    for (int position = kEdgeCount - 1; position >= 0; --position) {
        const int edge = cube.edgePermutation[position];
        if (isSliceEdge(edge)) {
            slice += binomial(kEdgeCount - 1 - position, sliceEdgesSeen + 1);
            sliceEdgeOrder[3 - sliceEdgesSeen] = static_cast<uint8_t>(edge - FR);
            ++sliceEdgesSeen;
        }
    }
    return slice * kSlicePermutationCount + rankPermutation(sliceEdgeOrder);
}

int cornerPermutationOf(const CubieCube& cube) { return rankPermutation(cube.cornerPermutation); }

int udEdgePermutationOf(const std::array<uint8_t, kEdgeCount>& edgePermutation) {
    std::array<uint8_t, 8> udEdges{};
    std::copy(edgePermutation.begin(), edgePermutation.begin() + 8, udEdges.begin());
    return rankPermutation(udEdges);
}

bool isPhaseTwoMove(int moveIndex) {
    const int face = moveIndex / 3;
    const int turns = moveIndex % 3 + 1;
    return face == U || face == D || turns == 2;
}

bool isRedundantAfter(int face, int lastFace) {
    if (lastFace == kNoFace) {
        return false;
    }
    return face == lastFace || (face % 3 == lastFace % 3 && face < lastFace);
}

struct OptimalTables {
    std::vector<uint16_t> twistMoves;
    std::vector<uint16_t> flipMoves;
    std::vector<uint16_t> sliceSortedMoves;
    std::vector<uint16_t> sliceMoves;
    std::vector<uint16_t> cornerPermutationMoves;
    std::vector<uint16_t> phaseTwoCornerMoves;
    std::vector<uint16_t> phaseTwoEdgeMoves;
    std::vector<uint16_t> phaseTwoSliceMoves;
    std::vector<uint8_t> sliceTwistDistance;
    std::vector<uint8_t> sliceFlipDistance;
    std::vector<uint8_t> twistFlipDistance;
    std::vector<uint8_t> slicePermutationCornerDistance;
    std::vector<uint8_t> slicePermutationEdgeDistance;
};

std::vector<uint16_t> buildOrientationMoves(int coordinateCount, void (*setCoordinate)(CubieCube&, int), int (*getCoordinate)(const CubieCube&)) {
    std::vector<uint16_t> table(static_cast<size_t>(coordinateCount) * kMoveCount);
    for (int coordinate = 0; coordinate < coordinateCount; ++coordinate) {
        CubieCube cube;
        setCoordinate(cube, coordinate);
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            CubieCube moved = cube;
            moved.multiply(moveCube(moveIndex));
            table[coordinate * kMoveCount + moveIndex] = static_cast<uint16_t>(getCoordinate(moved));
        }
    }
    return table;
}

std::vector<uint16_t> buildSliceSortedMoves() {
    std::vector<uint16_t> table(static_cast<size_t>(kSliceSortedCount) * kMoveCount);
    for (int positionMask = 0; positionMask < (1 << kEdgeCount); ++positionMask) {
        if (__builtin_popcount(positionMask) != 4) {
            continue;
        }
        for (int orderRank = 0; orderRank < kSlicePermutationCount; ++orderRank) {
            const auto sliceEdgeOrder = unrankPermutation<4>(orderRank);
            CubieCube cube;
            int sliceEdgesPlaced = 0;
            int nextOtherEdge = UR;
            for (int position = 0; position < kEdgeCount; ++position) {
                const bool holdsSliceEdge = (positionMask >> position) & 1;
                cube.edgePermutation[position] =
                    static_cast<uint8_t>(holdsSliceEdge ? FR + sliceEdgeOrder[sliceEdgesPlaced++] : nextOtherEdge++);
            }
            const int sliceSorted = sliceSortedOf(cube);
            for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
                CubieCube moved = cube;
                moved.edgeMultiply(moveCube(moveIndex));
                table[sliceSorted * kMoveCount + moveIndex] = static_cast<uint16_t>(sliceSortedOf(moved));
            }
        }
    }
    return table;
}

std::vector<uint16_t> buildSliceMoves(const std::vector<uint16_t>& sliceSortedMoves) {
    std::vector<uint16_t> table(static_cast<size_t>(kSliceCount) * kMoveCount);
    for (int slice = 0; slice < kSliceCount; ++slice) {
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            table[slice * kMoveCount + moveIndex] =
                static_cast<uint16_t>(sliceSortedMoves[slice * kSlicePermutationCount * kMoveCount + moveIndex] / kSlicePermutationCount);
        }
    }
    return table;
}

std::vector<uint16_t> buildCornerPermutationMoves() {
    std::vector<uint16_t> table(static_cast<size_t>(kCornerPermutationCount) * kMoveCount);
    for (int coordinate = 0; coordinate < kCornerPermutationCount; ++coordinate) {
        CubieCube cube;
        cube.cornerPermutation = unrankPermutation<kCornerCount>(coordinate);
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            CubieCube moved = cube;
            moved.cornerMultiply(moveCube(moveIndex));
            table[coordinate * kMoveCount + moveIndex] = static_cast<uint16_t>(cornerPermutationOf(moved));
        }
    }
    return table;
}

std::vector<uint16_t> buildPhaseTwoEdgeMoves() {
    std::vector<uint16_t> table(static_cast<size_t>(kUdEdgePermutationCount) * kPhaseTwoMoveCount);
    for (int coordinate = 0; coordinate < kUdEdgePermutationCount; ++coordinate) {
        CubieCube cube;
        const auto udEdges = unrankPermutation<8>(coordinate);
        std::copy(udEdges.begin(), udEdges.end(), cube.edgePermutation.begin());
        for (int phaseTwoMove = 0; phaseTwoMove < kPhaseTwoMoveCount; ++phaseTwoMove) {
            CubieCube moved = cube;
            moved.edgeMultiply(moveCube(kPhaseTwoMoves[phaseTwoMove]));
            table[coordinate * kPhaseTwoMoveCount + phaseTwoMove] = static_cast<uint16_t>(udEdgePermutationOf(moved.edgePermutation));
        }
    }
    return table;
}

std::vector<uint16_t> restrictToPhaseTwoMoves(const std::vector<uint16_t>& fullMoves, int coordinateCount) {
    std::vector<uint16_t> table(static_cast<size_t>(coordinateCount) * kPhaseTwoMoveCount);
    for (int coordinate = 0; coordinate < coordinateCount; ++coordinate) {
        for (int phaseTwoMove = 0; phaseTwoMove < kPhaseTwoMoveCount; ++phaseTwoMove) {
            table[coordinate * kPhaseTwoMoveCount + phaseTwoMove] = fullMoves[coordinate * kMoveCount + kPhaseTwoMoves[phaseTwoMove]];
        }
    }
    return table;
}

std::vector<uint8_t> buildDistanceTable(int outerCount, int innerCount, int moveCount, const std::vector<uint16_t>& outerMoves,
                                        const std::vector<uint16_t>& innerMoves) {
    const int stateCount = outerCount * innerCount;
    std::vector<uint8_t> distance(stateCount, kUnvisited);
    std::vector<int> frontier{0};
    distance[0] = 0;
    for (uint8_t depth = 0; !frontier.empty(); ++depth) {
        std::vector<int> nextFrontier;
        for (const int state : frontier) {
            const int outer = state / innerCount;
            const int inner = state % innerCount;
            for (int moveSlot = 0; moveSlot < moveCount; ++moveSlot) {
                const int nextOuter = outerMoves[outer * moveCount + moveSlot];
                const int nextInner = innerMoves[inner * moveCount + moveSlot];
                const int nextState = nextOuter * innerCount + nextInner;
                if (distance[nextState] == kUnvisited) {
                    distance[nextState] = static_cast<uint8_t>(depth + 1);
                    nextFrontier.push_back(nextState);
                }
            }
        }
        frontier.swap(nextFrontier);
    }
    return distance;
}

OptimalTables buildTables() {
    OptimalTables tables;
    tables.twistMoves = buildOrientationMoves(kTwistCount, setTwist, twistOf);
    tables.flipMoves = buildOrientationMoves(kFlipCount, setFlip, flipOf);
    tables.sliceSortedMoves = buildSliceSortedMoves();
    tables.sliceMoves = buildSliceMoves(tables.sliceSortedMoves);
    tables.cornerPermutationMoves = buildCornerPermutationMoves();
    tables.phaseTwoCornerMoves = restrictToPhaseTwoMoves(tables.cornerPermutationMoves, kCornerPermutationCount);
    tables.phaseTwoEdgeMoves = buildPhaseTwoEdgeMoves();
    tables.phaseTwoSliceMoves = restrictToPhaseTwoMoves(tables.sliceSortedMoves, kSlicePermutationCount);

    tables.sliceTwistDistance = buildDistanceTable(kSliceCount, kTwistCount, kMoveCount, tables.sliceMoves, tables.twistMoves);
    tables.sliceFlipDistance = buildDistanceTable(kSliceCount, kFlipCount, kMoveCount, tables.sliceMoves, tables.flipMoves);
    tables.twistFlipDistance = buildDistanceTable(kTwistCount, kFlipCount, kMoveCount, tables.twistMoves, tables.flipMoves);
    tables.slicePermutationCornerDistance = buildDistanceTable(kSlicePermutationCount, kCornerPermutationCount, kPhaseTwoMoveCount,
                                                               tables.phaseTwoSliceMoves, tables.phaseTwoCornerMoves);
    tables.slicePermutationEdgeDistance = buildDistanceTable(kSlicePermutationCount, kUdEdgePermutationCount, kPhaseTwoMoveCount,
                                                             tables.phaseTwoSliceMoves, tables.phaseTwoEdgeMoves);
    return tables;
}

const OptimalTables& optimalTables() {
    static const OptimalTables tables = buildTables();
    return tables;
}

CubieCube diagonalRotation() {
    CubieCube rotation;
    rotation.cornerPermutation = {URF, DFR, DLF, UFL, UBR, DRB, DBL, ULB};
    rotation.cornerOrientation = {1, 2, 1, 2, 2, 1, 2, 1};
    rotation.edgePermutation = {UF, FR, DF, FL, UB, BR, DB, BL, UR, DR, DL, UL};
    rotation.edgeOrientation = {1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1};
    return rotation;
}

CubieCube conjugate(const CubieCube& rotation, const CubieCube& cube) {
    CubieCube result = rotation.inverse();
    result.multiply(cube);
    result.multiply(rotation);
    return result;
}

std::array<int, kMoveCount> buildRotatedMoveMap(const CubieCube& rotation) {
    std::array<int, kMoveCount> rotatedMove{};
    const CubieCube inverseRotation = rotation.inverse();
    for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
        const CubieCube mapped = conjugate(inverseRotation, moveCube(moveIndex));
        rotatedMove[moveIndex] = moveIndex;
        for (int candidate = 0; candidate < kMoveCount; ++candidate) {
            if (moveCube(candidate) == mapped) {
                rotatedMove[moveIndex] = candidate;
            }
        }
    }
    return rotatedMove;
}

struct SearchOrientation {
    CubieCube cube;
    int rotationCount = 0;
    bool inverted = false;
};

std::vector<SearchOrientation> buildOrientations(const CubieCube& startCube) {
    const CubieCube rotation = diagonalRotation();
    std::vector<SearchOrientation> orientations;
    for (const bool inverted : {false, true}) {
        CubieCube oriented = inverted ? startCube.inverse() : startCube;
        for (int rotationCount = 0; rotationCount < 3; ++rotationCount) {
            const bool isDuplicate = std::any_of(orientations.begin(), orientations.end(),
                                                 [&](const SearchOrientation& existing) { return existing.cube == oriented; });
            if (!isDuplicate) {
                orientations.push_back(SearchOrientation{oriented, rotationCount, inverted});
            }
            oriented = conjugate(rotation, oriented);
        }
    }
    return orientations;
}

std::vector<Move> toOriginalFrame(const std::vector<int>& orientedMoves, const SearchOrientation& orientation) {
    static const std::array<int, kMoveCount> rotatedMove = buildRotatedMoveMap(diagonalRotation());
    std::vector<Move> moves;
    for (int moveIndex : orientedMoves) {
        for (int turn = 0; turn < orientation.rotationCount; ++turn) {
            moveIndex = rotatedMove[moveIndex];
        }
        moves.push_back(Move::fromIndex(moveIndex));
    }
    return orientation.inverted ? invertMoves(moves) : moves;
}

class TwoPhaseSearch {
public:
    TwoPhaseSearch(const CubieCube& startCube, const OptimalTables& tables)
        : orientations(buildOrientations(startCube)), tables(tables), startTime(Clock::now()) {}

    std::vector<Move> run() {
        for (int phaseOneDepth = 0; phaseOneDepth <= kMaxPhaseOneDepth && phaseOneDepth < bestLength && !stopRequested; ++phaseOneDepth) {
            for (const SearchOrientation& orientation : orientations) {
                activeOrientation = &orientation;
                const int twist = twistOf(orientation.cube);
                const int flip = flipOf(orientation.cube);
                const int sliceSorted = sliceSortedOf(orientation.cube);
                const int cornerPermutation = cornerPermutationOf(orientation.cube);
                if (phaseOneDistance(twist, flip, sliceSorted / kSlicePermutationCount) <= phaseOneDepth) {
                    searchPhaseOne(twist, flip, sliceSorted, cornerPermutation, 0, phaseOneDepth, kNoFace);
                }
                if (stopRequested || phaseOneDepth >= bestLength) {
                    break;
                }
            }
        }
        return bestSolution;
    }

private:
    const std::vector<SearchOrientation> orientations;
    const OptimalTables& tables;
    const SearchOrientation* activeOrientation = nullptr;
    Clock::time_point startTime;
    std::array<int, kMaxPhaseOneDepth + kMaxPhaseTwoDepth + 1> currentMoves{};
    std::vector<Move> bestSolution;
    int bestLength = kNoSolution;
    long long nodeCounter = 0;
    bool stopRequested = false;

    int phaseOneDistance(int twist, int flip, int slice) const {
        return std::max({tables.sliceTwistDistance[slice * kTwistCount + twist], tables.sliceFlipDistance[slice * kFlipCount + flip],
                         tables.twistFlipDistance[twist * kFlipCount + flip]});
    }

    int phaseTwoCornerDistance(int cornerPermutation, int slicePermutation) const {
        return tables.slicePermutationCornerDistance[slicePermutation * kCornerPermutationCount + cornerPermutation];
    }

    int phaseTwoDistance(int cornerPermutation, int udEdgePermutation, int slicePermutation) const {
        return std::max<int>(phaseTwoCornerDistance(cornerPermutation, slicePermutation),
                             tables.slicePermutationEdgeDistance[slicePermutation * kUdEdgePermutationCount + udEdgePermutation]);
    }

    bool shouldStop() {
        if (stopRequested) {
            return true;
        }
        if (bestLength == kNoSolution || (++nodeCounter & kClockCheckInterval) != 0) {
            return false;
        }
        const double elapsedMs = std::chrono::duration<double, std::milli>(Clock::now() - startTime).count();
        const double budgetMs = bestLength <= kTargetLength ? kRefineBudgetMs : kSearchBudgetMs;
        stopRequested = elapsedMs >= budgetMs;
        return stopRequested;
    }

    bool searchPhaseOne(int twist, int flip, int sliceSorted, int cornerPermutation, int depth, int movesLeft, int lastFace) {
        if (movesLeft == 0) {
            const bool endsWithPhaseOneMove = depth == 0 || !isPhaseTwoMove(currentMoves[depth - 1]);
            if (endsWithPhaseOneMove && depth < bestLength) {
                startPhaseTwo(cornerPermutation, sliceSorted, depth, lastFace);
            }
            return shouldStop();
        }
        const bool staysInPhaseTwoOnly = movesLeft < 5 && phaseOneDistance(twist, flip, sliceSorted / kSlicePermutationCount) == 0;
        for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
            const int face = moveIndex / 3;
            if (isRedundantAfter(face, lastFace) || (staysInPhaseTwoOnly && isPhaseTwoMove(moveIndex))) {
                continue;
            }
            const int nextTwist = tables.twistMoves[twist * kMoveCount + moveIndex];
            const int nextFlip = tables.flipMoves[flip * kMoveCount + moveIndex];
            const int nextSliceSorted = tables.sliceSortedMoves[sliceSorted * kMoveCount + moveIndex];
            if (phaseOneDistance(nextTwist, nextFlip, nextSliceSorted / kSlicePermutationCount) > movesLeft - 1) {
                continue;
            }
            const int nextCornerPermutation = tables.cornerPermutationMoves[cornerPermutation * kMoveCount + moveIndex];
            currentMoves[depth] = moveIndex;
            if (searchPhaseOne(nextTwist, nextFlip, nextSliceSorted, nextCornerPermutation, depth + 1, movesLeft - 1, face)) {
                return true;
            }
        }
        return shouldStop();
    }

    int udEdgePermutationAfterPhaseOne(int phaseOneLength) const {
        std::array<uint8_t, kEdgeCount> edgePermutation = activeOrientation->cube.edgePermutation;
        for (int step = 0; step < phaseOneLength; ++step) {
            const auto& moveEdges = moveCube(currentMoves[step]).edgePermutation;
            std::array<uint8_t, kEdgeCount> movedEdges{};
            for (int position = 0; position < kEdgeCount; ++position) {
                movedEdges[position] = edgePermutation[moveEdges[position]];
            }
            edgePermutation = movedEdges;
        }
        return udEdgePermutationOf(edgePermutation);
    }

    void startPhaseTwo(int cornerPermutation, int slicePermutation, int phaseOneLength, int lastFace) {
        const int maxPhaseTwoLength = std::min(kMaxPhaseTwoDepth, bestLength - 1 - phaseOneLength);
        if (phaseTwoCornerDistance(cornerPermutation, slicePermutation) > maxPhaseTwoLength) {
            return;
        }
        const int udEdgePermutation = udEdgePermutationAfterPhaseOne(phaseOneLength);
        const int lowerBound = phaseTwoDistance(cornerPermutation, udEdgePermutation, slicePermutation);
        for (int phaseTwoLength = lowerBound; phaseTwoLength <= maxPhaseTwoLength; ++phaseTwoLength) {
            if (searchPhaseTwo(cornerPermutation, udEdgePermutation, slicePermutation, phaseOneLength, phaseTwoLength, lastFace)) {
                recordSolution(phaseOneLength + phaseTwoLength);
                return;
            }
            if (shouldStop()) {
                return;
            }
        }
    }

    bool searchPhaseTwo(int cornerPermutation, int udEdgePermutation, int slicePermutation, int depth, int movesLeft, int lastFace) {
        if (movesLeft == 0) {
            return cornerPermutation == 0 && udEdgePermutation == 0 && slicePermutation == 0;
        }
        if (shouldStop()) {
            return false;
        }
        for (int phaseTwoMove = 0; phaseTwoMove < kPhaseTwoMoveCount; ++phaseTwoMove) {
            const int moveIndex = kPhaseTwoMoves[phaseTwoMove];
            const int face = moveIndex / 3;
            if (isRedundantAfter(face, lastFace)) {
                continue;
            }
            const int nextCorner = tables.phaseTwoCornerMoves[cornerPermutation * kPhaseTwoMoveCount + phaseTwoMove];
            const int nextEdge = tables.phaseTwoEdgeMoves[udEdgePermutation * kPhaseTwoMoveCount + phaseTwoMove];
            const int nextSlice = tables.phaseTwoSliceMoves[slicePermutation * kPhaseTwoMoveCount + phaseTwoMove];
            if (phaseTwoDistance(nextCorner, nextEdge, nextSlice) > movesLeft - 1) {
                continue;
            }
            currentMoves[depth] = moveIndex;
            if (searchPhaseTwo(nextCorner, nextEdge, nextSlice, depth + 1, movesLeft - 1, face)) {
                return true;
            }
        }
        return false;
    }

    void recordSolution(int length) {
        bestLength = length;
        bestSolution = toOriginalFrame(std::vector<int>(currentMoves.begin(), currentMoves.begin() + length), *activeOrientation);
    }
};

}

void initOptimalTables() { optimalTables(); }

SolveResult solveOptimal(const CubieCube& cube) {
    const OptimalTables& tables = optimalTables();
    const auto startTime = Clock::now();
    SolveResult result;
    std::vector<Move> solution = TwoPhaseSearch(cube, tables).run();
    result.timeMs = std::chrono::duration<double, std::milli>(Clock::now() - startTime).count();
    if (solution.empty() && !cube.isSolved()) {
        result.error = "No two-phase solution found";
        return result;
    }
    result.ok = true;
    result.stages.push_back(Stage{"Two-phase", std::move(solution), ""});
    return result;
}

}
