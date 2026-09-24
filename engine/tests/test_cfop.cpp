#include <algorithm>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <set>
#include <string>
#include <vector>

#include "../src/cfop_algs.hpp"
#include "quickcube/solvers.hpp"
#include "test_helpers.hpp"

using namespace quickcube;

namespace {

const std::vector<std::string> kExpectedStageNames = {"Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"};

std::vector<Move> movesOf(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    EXPECT(parseMoves(text, moves, error));
    return moves;
}

std::vector<Move> upTurn(int quarterTurns) {
    return quarterTurns == 0 ? std::vector<Move>{} : std::vector<Move>{Move{U, static_cast<uint8_t>(quarterTurns)}};
}

CubieCube cubeFrom(const std::vector<Move>& moves) {
    CubieCube cube;
    cube.applyMoves(moves);
    return cube;
}

bool isLastLayerOnly(const CubieCube& cube) {
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

bool isLastLayerOriented(const CubieCube& cube) {
    if (!isLastLayerOnly(cube)) {
        return false;
    }
    for (int corner = URF; corner <= UBR; ++corner) {
        if (cube.cornerOrientation[corner] != 0) {
            return false;
        }
    }
    for (int edge = UR; edge <= UB; ++edge) {
        if (cube.edgeOrientation[edge] != 0) {
            return false;
        }
    }
    return true;
}

bool checkSolveResult(const CubieCube& cube, const SolveResult& result) {
    EXPECT(result.ok);
    if (!result.ok) {
        std::cerr << "  error: " << result.error << "\n";
        return false;
    }
    EXPECT_EQ(result.stages.size(), kExpectedStageNames.size());
    if (result.stages.size() != kExpectedStageNames.size()) {
        return false;
    }
    bool allGood = true;
    for (size_t stageIndex = 0; stageIndex < result.stages.size(); ++stageIndex) {
        const Stage& stage = result.stages[stageIndex];
        EXPECT_EQ(stage.name, kExpectedStageNames[stageIndex]);
        EXPECT_EQ(formatMoves(simplifyMoves(stage.moves)), formatMoves(stage.moves));
        allGood = allGood && stage.name == kExpectedStageNames[stageIndex];
    }
    EXPECT(!result.stages[5].caseName.empty());
    EXPECT(!result.stages[6].caseName.empty());
    const bool solves = stagesSolveCube(cube, result.stages);
    EXPECT(solves);
    return allGood && solves;
}

bool crossSolved(const CubieCube& cube) {
    for (int edge = DR; edge <= DB; ++edge) {
        if (cube.edgePermutation[edge] != edge || cube.edgeOrientation[edge] != 0) {
            return false;
        }
    }
    return true;
}

}

TEST_CASE(everyOllAlgorithmIsRecognizedAsItsOwnCase) {
    EXPECT_EQ(ollAlgorithms().size(), size_t{57});
    for (const NamedAlgorithm& algorithm : ollAlgorithms()) {
        const std::vector<Move> moves = expandAlgorithm(algorithm.notation);
        EXPECT(!moves.empty());
        const CubieCube caseCube = cubeFrom(invertMoves(moves));
        EXPECT(isLastLayerOnly(caseCube));
        EXPECT(!isLastLayerOriented(caseCube));
        for (int preTurn = 0; preTurn < 4; ++preTurn) {
            CubieCube turnedCase = cubeFrom(upTurn(preTurn));
            turnedCase.applyMoves(invertMoves(moves));
            const SolveResult result = solveCfop(turnedCase);
            if (checkSolveResult(turnedCase, result)) {
                EXPECT_EQ(result.stages[5].caseName, algorithm.name);
                EXPECT(result.stages[0].moves.empty());
            }
        }
    }
}

TEST_CASE(everyPllAlgorithmIsRecognizedAsItsOwnCase) {
    EXPECT_EQ(pllAlgorithms().size(), size_t{21});
    for (const NamedAlgorithm& algorithm : pllAlgorithms()) {
        const std::vector<Move> moves = expandAlgorithm(algorithm.notation);
        EXPECT(!moves.empty());
        const CubieCube caseCube = cubeFrom(invertMoves(moves));
        EXPECT(isLastLayerOriented(caseCube));
        EXPECT(!caseCube.isSolved());
        for (int preTurn = 0; preTurn < 4; ++preTurn) {
            for (int postTurn = 0; postTurn < 4; ++postTurn) {
                CubieCube turnedCase = cubeFrom(upTurn(preTurn));
                turnedCase.applyMoves(invertMoves(moves));
                turnedCase.applyMoves(upTurn(postTurn));
                const SolveResult result = solveCfop(turnedCase);
                if (checkSolveResult(turnedCase, result)) {
                    EXPECT_EQ(result.stages[5].caseName, std::string("OLL skip"));
                    EXPECT_EQ(result.stages[6].caseName, algorithm.name);
                }
            }
        }
    }
}

TEST_CASE(everyLastLayerOrientationIsSolved) {
    std::set<std::string> ollCaseNames;
    int orientationStates = 0;
    for (int cornerTwists = 0; cornerTwists < 81; ++cornerTwists) {
        for (int edgeFlips = 0; edgeFlips < 16; ++edgeFlips) {
            CubieCube cube;
            int twistSum = 0;
            int flipSum = 0;
            int remainingTwists = cornerTwists;
            for (int corner = URF; corner <= UBR; ++corner) {
                const int twist = remainingTwists % 3;
                remainingTwists /= 3;
                cube.cornerOrientation[corner] = static_cast<uint8_t>(twist);
                twistSum += twist;
            }
            for (int edge = UR; edge <= UB; ++edge) {
                const int flip = (edgeFlips >> edge) & 1;
                cube.edgeOrientation[edge] = static_cast<uint8_t>(flip);
                flipSum += flip;
            }
            if (twistSum % 3 != 0 || flipSum % 2 != 0) {
                continue;
            }
            ++orientationStates;
            const SolveResult result = solveCfop(cube);
            if (checkSolveResult(cube, result)) {
                ollCaseNames.insert(result.stages[5].caseName);
            }
        }
    }
    EXPECT_EQ(orientationStates, 216);
    EXPECT_EQ(ollCaseNames.size(), size_t{58});
}

TEST_CASE(everyLastLayerPermutationIsSolved) {
    std::set<std::string> pllCaseNames;
    std::vector<uint8_t> cornerOrder{URF, UFL, ULB, UBR};
    int permutationStates = 0;
    do {
        std::vector<uint8_t> edgeOrder{UR, UF, UL, UB};
        do {
            CubieCube cube;
            std::copy(cornerOrder.begin(), cornerOrder.end(), cube.cornerPermutation.begin());
            std::copy(edgeOrder.begin(), edgeOrder.end(), cube.edgePermutation.begin());
            if (cube.cornerParity() != cube.edgeParity()) {
                continue;
            }
            ++permutationStates;
            const SolveResult result = solveCfop(cube);
            if (checkSolveResult(cube, result)) {
                pllCaseNames.insert(result.stages[6].caseName);
            }
        } while (std::next_permutation(edgeOrder.begin(), edgeOrder.end()));
    } while (std::next_permutation(cornerOrder.begin(), cornerOrder.end()));
    EXPECT_EQ(permutationStates, 288);
    EXPECT_EQ(pllCaseNames.size(), size_t{22});
}

TEST_CASE(handPickedCubesAreSolved) {
    const SolveResult solvedResult = solveCfop(CubieCube::solved());
    if (checkSolveResult(CubieCube::solved(), solvedResult)) {
        EXPECT(flattenStages(solvedResult.stages).empty());
        EXPECT_EQ(solvedResult.stages[5].caseName, std::string("OLL skip"));
        EXPECT_EQ(solvedResult.stages[6].caseName, std::string("PLL skip"));
    }
    const std::vector<std::string> handPicked = {
        "U",
        "D",
        "R",
        "U2 D2 F2 B2 L2 R2",
        "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
        "R U R' U'",
        "F R U R' U' F'",
        "R U R' U' R' F R2 U' R' U' R U R' F'",
        "D R' D' R D R' D' R",
        "L' U2 L U L' U L R U2 R' U' R U' R'",
        "B2 D2 L2 F2 R2 U2",
    };
    for (const std::string& scrambleText : handPicked) {
        const CubieCube cube = cubeFrom(movesOf(scrambleText));
        const SolveResult result = solveCfop(cube);
        checkSolveResult(cube, result);
    }
}

TEST_CASE(crossStageIsOptimalAndPreservedThroughF2l) {
    for (uint32_t seed = 1; seed <= 60; ++seed) {
        const CubieCube cube = cubeFrom(scramble(seed, 25));
        const SolveResult result = solveCfop(cube);
        if (!checkSolveResult(cube, result)) {
            continue;
        }
        EXPECT(result.stages[0].moves.size() <= 8);
        CubieCube working = cube;
        working.applyMoves(result.stages[0].moves);
        EXPECT(crossSolved(working));
        for (int stageIndex = 1; stageIndex <= 4; ++stageIndex) {
            working.applyMoves(result.stages[stageIndex].moves);
            EXPECT(crossSolved(working));
        }
        EXPECT(isLastLayerOnly(working));
        working.applyMoves(result.stages[5].moves);
        EXPECT(isLastLayerOriented(working));
    }
}

TEST_CASE(randomScramblesAreSolved) {
    solveCfop(CubieCube::solved());
    constexpr int kScrambleCount = 600;
    long totalMoves = 0;
    size_t maxMoves = 0;
    double totalMs = 0.0;
    double maxMs = 0.0;
    int solvedCount = 0;
    for (int scrambleIndex = 0; scrambleIndex < kScrambleCount; ++scrambleIndex) {
        const uint32_t seed = 1000u + static_cast<uint32_t>(scrambleIndex) * 7919u;
        const int length = 20 + scrambleIndex % 11;
        const CubieCube cube = cubeFrom(scramble(seed, length));
        const auto startTime = std::chrono::steady_clock::now();
        const SolveResult result = solveCfop(cube);
        const double elapsedMs =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count();
        if (!checkSolveResult(cube, result)) {
            std::cerr << "  failed scramble seed " << seed << " length " << length << "\n";
            continue;
        }
        ++solvedCount;
        const size_t moveCount = flattenStages(result.stages).size();
        totalMoves += static_cast<long>(moveCount);
        maxMoves = std::max(maxMoves, moveCount);
        totalMs += elapsedMs;
        maxMs = std::max(maxMs, elapsedMs);
    }
    EXPECT_EQ(solvedCount, kScrambleCount);
    EXPECT(maxMs < 300.0);
    std::cout << std::fixed << std::setprecision(2) << "  " << solvedCount << " scrambles, moves avg "
              << static_cast<double>(totalMoves) / std::max(solvedCount, 1) << " max " << maxMoves << ", time avg "
              << totalMs / std::max(solvedCount, 1) << " ms max " << maxMs << " ms\n";
}

int main() {
    const auto startTime = std::chrono::steady_clock::now();
    solveCfop(CubieCube::solved());
    std::cout << std::fixed << std::setprecision(2) << "  table build "
              << std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count()
              << " ms\n";
    return RUN_ALL_TESTS();
}
