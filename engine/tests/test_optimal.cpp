#include <algorithm>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

#include "quickcube/cube.hpp"
#include "quickcube/solvers.hpp"
#include "test_helpers.hpp"

using namespace quickcube;

namespace {

using Clock = std::chrono::steady_clock;

constexpr int kRandomScrambleCount = 120;
constexpr int kMaxAcceptedLength = 22;

double elapsedMs(Clock::time_point since) { return std::chrono::duration<double, std::milli>(Clock::now() - since).count(); }

std::vector<Move> movesOf(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    EXPECT(parseMoves(text, moves, error));
    return moves;
}

bool hasRedundantNeighbors(const std::vector<Move>& moves) {
    for (size_t index = 1; index < moves.size(); ++index) {
        if (moves[index].face == moves[index - 1].face) {
            return true;
        }
    }
    return false;
}

struct SolveCheck {
    bool solved = false;
    int moveCount = 0;
    double timeMs = 0.0;
};

SolveCheck solveAndVerify(const CubieCube& cube, const std::string& label) {
    const auto startTime = Clock::now();
    const SolveResult result = solveOptimal(cube);
    SolveCheck check;
    check.timeMs = elapsedMs(startTime);
    EXPECT(result.ok);
    EXPECT_EQ(result.stages.size(), static_cast<size_t>(1));
    if (!result.ok || result.stages.size() != 1) {
        std::cerr << "  failed on " << label << ": " << result.error << "\n";
        return check;
    }
    EXPECT_EQ(result.stages.front().name, std::string("Two-phase"));
    EXPECT(result.stages.front().caseName.empty());
    const std::vector<Move> solution = flattenStages(result.stages);
    EXPECT(!hasRedundantNeighbors(solution));
    check.solved = stagesSolveCube(cube, result.stages);
    check.moveCount = static_cast<int>(solution.size());
    if (!check.solved) {
        std::cerr << "  solution does not solve " << label << ": " << formatMoves(solution) << "\n";
    }
    EXPECT(check.solved);
    EXPECT(check.moveCount <= kMaxAcceptedLength);
    return check;
}

CubieCube cubeAfter(const std::string& moveText) {
    CubieCube cube;
    cube.applyMoves(movesOf(moveText));
    return cube;
}

}

TEST_CASE(tablesBuildOnceAndQuickly) {
    const auto firstStart = Clock::now();
    initOptimalTables();
    const double firstMs = elapsedMs(firstStart);
    const auto secondStart = Clock::now();
    initOptimalTables();
    const double secondMs = elapsedMs(secondStart);
    std::cout << "  table build " << std::fixed << std::setprecision(1) << firstMs << " ms, second call " << secondMs << " ms\n";
    EXPECT(firstMs < 3000.0);
    EXPECT(secondMs < 1.0);
}

TEST_CASE(solvedCubeNeedsNoMoves) {
    const SolveResult result = solveOptimal(CubieCube::solved());
    EXPECT(result.ok);
    EXPECT_EQ(result.stages.size(), static_cast<size_t>(1));
    if (!result.stages.empty()) {
        EXPECT_EQ(result.stages.front().name, std::string("Two-phase"));
        EXPECT(result.stages.front().moves.empty());
    }
}

TEST_CASE(shortScramblesGetShortSolutions) {
    const std::vector<std::pair<std::string, int>> shortCases{
        {"R", 1}, {"U2", 1}, {"F'", 1}, {"R U", 2}, {"D L2", 2}, {"R U R' U'", 4}, {"F B'", 2}, {"U D2 R", 3},
    };
    for (const auto& [moveText, optimalLength] : shortCases) {
        const SolveCheck check = solveAndVerify(cubeAfter(moveText), moveText);
        EXPECT(check.moveCount <= optimalLength + 2);
    }
}

TEST_CASE(handPickedPatternsSolve) {
    const std::vector<std::string> patterns{
        "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
        "R2 L2 U2 D2 F2 B2",
        "R U R' U' R' F R2 U' R' U' R U R' F'",
        "F B2 R' D2 B R U D' R L' D' F' R2 D F2 B'",
        "U D' R L' F B' U D'",
        "R L U2 F' U2 D2 R2 L2 F' D2 F2 D R2 L2 F2 B2 D B2 L2",
    };
    for (const std::string& pattern : patterns) {
        const SolveCheck check = solveAndVerify(cubeAfter(pattern), pattern);
        std::cout << "  " << check.moveCount << " moves, " << std::fixed << std::setprecision(1) << check.timeMs << " ms  <- " << pattern << "\n";
    }
}

TEST_CASE(superflipReachesTwentyMoves) {
    const std::string superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    const SolveCheck check = solveAndVerify(cubeAfter(superflip), superflip);
    std::cout << "  superflip " << check.moveCount << " moves, " << std::fixed << std::setprecision(1) << check.timeMs << " ms\n";
    EXPECT(check.moveCount <= 20);
}

TEST_CASE(randomScramblesSolveNearOptimally) {
    int solvedCount = 0;
    int totalMoves = 0;
    int maxMoves = 0;
    double totalMs = 0.0;
    double maxMs = 0.0;
    std::vector<int> lengthHistogram(kMaxAcceptedLength + 8, 0);
    for (int seed = 1; seed <= kRandomScrambleCount; ++seed) {
        const int scrambleLength = 20 + seed % 11;
        const std::vector<Move> scrambleMoves = scramble(static_cast<uint32_t>(seed), scrambleLength);
        CubieCube cube;
        cube.applyMoves(scrambleMoves);
        const SolveCheck check = solveAndVerify(cube, formatMoves(scrambleMoves));
        solvedCount += check.solved ? 1 : 0;
        totalMoves += check.moveCount;
        maxMoves = std::max(maxMoves, check.moveCount);
        totalMs += check.timeMs;
        maxMs = std::max(maxMs, check.timeMs);
        if (check.moveCount < static_cast<int>(lengthHistogram.size())) {
            ++lengthHistogram[check.moveCount];
        }
    }
    const double averageMoves = static_cast<double>(totalMoves) / kRandomScrambleCount;
    std::cout << std::fixed << std::setprecision(2) << "  solved " << solvedCount << "/" << kRandomScrambleCount << ", avg " << averageMoves
              << " moves, max " << maxMoves << " moves, avg " << totalMs / kRandomScrambleCount << " ms, max " << maxMs << " ms\n  lengths:";
    for (size_t length = 0; length < lengthHistogram.size(); ++length) {
        if (lengthHistogram[length] > 0) {
            std::cout << " " << length << "x" << lengthHistogram[length];
        }
    }
    std::cout << "\n";
    EXPECT_EQ(solvedCount, kRandomScrambleCount);
    EXPECT(averageMoves <= 21.0);
    EXPECT(maxMoves <= 20);
}

int main() { return RUN_ALL_TESTS(); }
