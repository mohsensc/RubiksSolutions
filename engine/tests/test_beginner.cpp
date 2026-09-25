#include <algorithm>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

#include "quickcube/cube.hpp"
#include "quickcube/json_api.hpp"
#include "quickcube/solvers.hpp"
#include "test_helpers.hpp"

using namespace quickcube;

namespace {

const std::vector<std::string> kExpectedStageNames{
    "First cross",   "First corners", "Middle layer", "Last cross", "Last edges", "Last corners (position)",
    "Last corners (orient)",
};

CubieCube cubeFromMoves(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    parseMoves(text, moves, error);
    CubieCube cube;
    cube.applyMoves(moves);
    return cube;
}

bool edgeSolved(const CubieCube& cube, int edge) {
    return cube.edgePermutation[edge] == edge && cube.edgeOrientation[edge] == 0;
}

bool cornerSolved(const CubieCube& cube, int corner) {
    return cube.cornerPermutation[corner] == corner && cube.cornerOrientation[corner] == 0;
}

bool edgesSolved(const CubieCube& cube, int firstEdge, int lastEdge) {
    for (int edge = firstEdge; edge <= lastEdge; ++edge) {
        if (!edgeSolved(cube, edge)) {
            return false;
        }
    }
    return true;
}

bool cornersSolved(const CubieCube& cube, int firstCorner, int lastCorner) {
    for (int corner = firstCorner; corner <= lastCorner; ++corner) {
        if (!cornerSolved(cube, corner)) {
            return false;
        }
    }
    return true;
}

bool stageGoalReached(const CubieCube& cube, size_t stageIndex) {
    const bool cross = edgesSolved(cube, DR, DB);
    const bool firstLayer = cross && cornersSolved(cube, DFR, DRB);
    const bool twoLayers = firstLayer && edgesSolved(cube, FR, BR);
    bool lastEdgesOriented = true;
    bool lastCornersPlaced = true;
    for (int piece = 0; piece < 4; ++piece) {
        lastEdgesOriented = lastEdgesOriented && cube.edgeOrientation[piece] == 0;
        lastCornersPlaced = lastCornersPlaced && cube.cornerPermutation[piece] == piece;
    }
    const bool lastEdges = twoLayers && edgesSolved(cube, UR, UB);
    switch (stageIndex) {
        case 0: return cross;
        case 1: return firstLayer;
        case 2: return twoLayers;
        case 3: return twoLayers && lastEdgesOriented;
        case 4: return lastEdges;
        case 5: return lastEdges && lastCornersPlaced;
        default: return cube.isSolved();
    }
}

struct SolveStats {
    int solveCount = 0;
    long totalMoves = 0;
    size_t maxMoves = 0;
    double totalTimeMs = 0.0;
    double maxTimeMs = 0.0;
};

void checkSolve(const CubieCube& start, SolveStats& stats) {
    const auto startTime = std::chrono::steady_clock::now();
    const SolveResult result = solveBeginner(start);
    const double elapsedMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count();
    EXPECT(result.ok);
    if (!result.ok) {
        std::cerr << "  error: " << result.error << "\n  facelets: " << start.toFacelets() << "\n";
        return;
    }
    EXPECT_EQ(result.stages.size(), kExpectedStageNames.size());
    CubieCube progress = start;
    for (size_t stageIndex = 0; stageIndex < result.stages.size() && stageIndex < kExpectedStageNames.size(); ++stageIndex) {
        const Stage& stage = result.stages[stageIndex];
        EXPECT_EQ(stage.name, kExpectedStageNames[stageIndex]);
        EXPECT_EQ(formatMoves(stage.moves), formatMoves(simplifyMoves(stage.moves)));
        progress.applyMoves(stage.moves);
        EXPECT(stageGoalReached(progress, stageIndex));
    }
    const std::vector<Move> allMoves = flattenStages(result.stages);
    EXPECT(solvesCube(start, allMoves));
    EXPECT(stagesSolveCube(start, result.stages));
    ++stats.solveCount;
    stats.totalMoves += static_cast<long>(allMoves.size());
    stats.maxMoves = std::max(stats.maxMoves, allMoves.size());
    stats.totalTimeMs += elapsedMs;
    stats.maxTimeMs = std::max(stats.maxTimeMs, elapsedMs);
}

}

TEST_CASE(solvedCubeProducesEmptyStages) {
    const SolveResult result = solveBeginner(CubieCube::solved());
    EXPECT(result.ok);
    EXPECT_EQ(result.stages.size(), kExpectedStageNames.size());
    EXPECT(flattenStages(result.stages).empty());
}

TEST_CASE(handPickedCasesSolve) {
    const std::vector<std::string> cases{
        "R",
        "U",
        "D'",
        "R U R' U'",
        "R2 L2 U2 D2 F2 B2",
        "R U R' U' R' F R2 U' R' U' R U R' F'",
        "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
        "R' D' R D R' D' R D U R' D' R D R' D' R D U'",
        "F R U R' U' F'",
        "R U R' U R U2 R'",
        "U R U' L' U R' U' L",
        "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2 D R2 U",
    };
    SolveStats stats;
    for (const std::string& moves : cases) {
        checkSolve(cubeFromMoves(moves), stats);
    }
}

TEST_CASE(randomScramblesSolve) {
    SolveStats stats;
    for (uint32_t seed = 1; seed <= 600; ++seed) {
        const int length = 20 + static_cast<int>(seed % 11);
        CubieCube cube;
        cube.applyMoves(scramble(seed * 7919u, length));
        checkSolve(cube, stats);
    }
    EXPECT_EQ(stats.solveCount, 600);
    if (stats.solveCount > 0) {
        std::cout << std::fixed << std::setprecision(2) << "beginner: " << stats.solveCount << " solves, avg "
                  << static_cast<double>(stats.totalMoves) / stats.solveCount << " moves, max " << stats.maxMoves
                  << " moves, avg " << stats.totalTimeMs / stats.solveCount << " ms, max " << stats.maxTimeMs
                  << " ms\n";
    }
}

TEST_CASE(jsonApiSolvesWithBeginner) {
    CubieCube cube;
    cube.applyMoves(scramble(42, 25));
    const std::string json = apiSolve(cube.toFacelets(), "beginner");
    EXPECT(json.find("\"ok\":true") != std::string::npos);
    EXPECT(json.find("\"method\":\"beginner\"") != std::string::npos);
    EXPECT(json.find("\"name\":\"Last corners (orient)\"") != std::string::npos);
}

int main() {
    return RUN_ALL_TESTS();
}
