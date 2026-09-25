#include <set>
#include <string>
#include <vector>

#include "quickcube/cube.hpp"
#include "test_helpers.hpp"

using namespace quickcube;

namespace {

std::vector<Move> movesOf(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    EXPECT(parseMoves(text, moves, error));
    return moves;
}

int orderOf(const std::string& text) {
    const std::vector<Move> moves = movesOf(text);
    CubieCube cube;
    for (int order = 1; order <= 5000; ++order) {
        cube.applyMoves(moves);
        if (cube.isSolved()) {
            return order;
        }
    }
    return -1;
}

bool errorContains(const std::string& facelets, const std::string& fragment) {
    const FaceletParseResult parsed = parseFacelets(facelets);
    if (parsed.ok || parsed.error.find(fragment) == std::string::npos) {
        std::cerr << "  facelets " << facelets << " gave: " << (parsed.ok ? "ok" : parsed.error) << "\n";
        return false;
    }
    return true;
}

}

TEST_CASE(everyMoveHasOrderFour) {
    for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
        const Move move = Move::fromIndex(moveIndex);
        CubieCube cube;
        for (int repetition = 0; repetition < 4; ++repetition) {
            cube.applyMove(move);
            EXPECT_EQ(cube.isSolved(), repetition == 3 || (move.turns == 2 && repetition == 1));
        }
        CubieCube withInverse;
        withInverse.applyMove(move);
        withInverse.applyMove(move.inverse());
        EXPECT(withInverse.isSolved());
        EXPECT(moveCube(moveIndex).verify().empty());
    }
}

TEST_CASE(knownSequenceOrders) {
    EXPECT_EQ(orderOf("R U R' U'"), 6);
    EXPECT_EQ(orderOf("R U"), 105);
    EXPECT_EQ(orderOf("R U2 D' B D'"), 1260);
    EXPECT_EQ(orderOf("R U R' U' R' F R2 U' R' U' R U R' F'"), 2);
    EXPECT_EQ(orderOf("R2 U2"), 6);
    EXPECT_EQ(orderOf("F B'"), 4);
}

TEST_CASE(superflipFlipsEveryEdgeOnly) {
    CubieCube cube;
    cube.applyMoves(movesOf("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"));
    EXPECT(cube.cornerPermutation == CubieCube{}.cornerPermutation);
    EXPECT(cube.cornerOrientation == CubieCube{}.cornerOrientation);
    EXPECT(cube.edgePermutation == CubieCube{}.edgePermutation);
    for (const uint8_t orientation : cube.edgeOrientation) {
        EXPECT_EQ(static_cast<int>(orientation), 1);
    }
}

TEST_CASE(singleMovesMatchKociembaFacelets) {
    const std::vector<std::pair<std::string, std::string>> references = {
        {"U", "UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB"},
        {"R", "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB"},
        {"F", "UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB"},
        {"D", "UUUUUUUUURRRRRRFFFFFFFFFLLLDDDDDDDDDLLLLLLBBBBBBBBBRRR"},
        {"L", "BUUBUUBUURRRRRRRRRUFFUFFUFFFDDFDDFDDLLLLLLLLLBBDBBDBBD"},
        {"B", "RRRUUUUUURRDRRDRRDFFFFFFFFFDDDDDDLLLULLULLULLBBBBBBBBB"},
    };
    for (const auto& [moveText, expected] : references) {
        CubieCube cube;
        cube.applyMoves(movesOf(moveText));
        EXPECT_EQ(cube.toFacelets(), expected);
        EXPECT_EQ(applyMovesToFacelets(kSolvedFacelets, movesOf(moveText)), expected);
    }
}

TEST_CASE(faceletRoundTripForRandomScrambles) {
    for (uint32_t seed = 1; seed <= 300; ++seed) {
        const std::vector<Move> moves = scramble(seed, 25);
        CubieCube cube;
        cube.applyMoves(moves);
        const std::string facelets = cube.toFacelets();
        EXPECT_EQ(applyMovesToFacelets(kSolvedFacelets, moves), facelets);
        const FaceletParseResult parsed = parseFacelets(facelets);
        EXPECT(parsed.ok);
        EXPECT(parsed.cube == cube);
        EXPECT(solvesCube(cube, invertMoves(moves)));
        CubieCube product = cube;
        product.multiply(cube.inverse());
        EXPECT(product.isSolved());
    }
}

TEST_CASE(colorRelativeCentersAreAccepted) {
    std::string recolored = kSolvedFacelets;
    for (char& sticker : recolored) {
        sticker = sticker == 'U' ? 'D' : sticker == 'D' ? 'U' : sticker == 'R' ? 'L' : sticker == 'L' ? 'R' : sticker;
    }
    const FaceletParseResult parsed = parseFacelets(recolored);
    EXPECT(parsed.ok);
    EXPECT(parsed.cube.isSolved());
}

TEST_CASE(validationRejectsEachErrorClass) {
    EXPECT(errorContains("UUU", "Expected 54 stickers"));

    std::string invalidSticker = kSolvedFacelets;
    invalidSticker[7] = 'X';
    EXPECT(errorContains(invalidSticker, "Invalid sticker 'X' at position 7"));

    std::string wrongCount = kSolvedFacelets;
    wrongCount[0] = 'R';
    EXPECT(errorContains(wrongCount, "Color U has 8 stickers"));

    std::string duplicateCenter = kSolvedFacelets;
    std::swap(duplicateCenter[4], duplicateCenter[9]);
    EXPECT(errorContains(duplicateCenter, "Duplicate center color R"));

    std::string swappedCenters = kSolvedFacelets;
    std::swap(swappedCenters[4], swappedCenters[13]);
    EXPECT(errorContains(swappedCenters, "Center colors are in an impossible arrangement"));

    std::string mirroredCenters = kSolvedFacelets;
    std::swap(mirroredCenters[4], mirroredCenters[31]);
    EXPECT(errorContains(mirroredCenters, "Center colors are in an impossible arrangement"));

    std::string invalidCorner = kSolvedFacelets;
    std::swap(invalidCorner[9], invalidCorner[38]);
    EXPECT(errorContains(invalidCorner, "Invalid corner at URF"));

    std::string duplicateCorner = kSolvedFacelets;
    duplicateCorner[18] = 'R';
    duplicateCorner[38] = 'F';
    duplicateCorner[10] = 'L';
    EXPECT(errorContains(duplicateCorner, "Duplicate corner: piece URF"));

    std::string invalidEdge = kSolvedFacelets;
    std::swap(invalidEdge[10], invalidEdge[3]);
    EXPECT(errorContains(invalidEdge, "Invalid edge at UR"));

    std::string duplicateEdge = kSolvedFacelets;
    duplicateEdge[19] = 'R';
    duplicateEdge[12] = 'F';
    EXPECT(errorContains(duplicateEdge, "Duplicate edge: piece UR"));

    CubieCube twisted;
    twisted.cornerOrientation[URF] = 1;
    EXPECT(errorContains(twisted.toFacelets(), "Twisted corner"));

    CubieCube flipped;
    flipped.edgeOrientation[UF] = 1;
    EXPECT(errorContains(flipped.toFacelets(), "Flipped edge"));

    CubieCube swapped;
    std::swap(swapped.edgePermutation[UR], swapped.edgePermutation[UF]);
    EXPECT(errorContains(swapped.toFacelets(), "Parity error"));

    CubieCube scrambledTwist;
    scrambledTwist.applyMoves(scramble(42, 30));
    scrambledTwist.cornerOrientation[DBL] = static_cast<uint8_t>((scrambledTwist.cornerOrientation[DBL] + 2) % 3);
    EXPECT(errorContains(scrambledTwist.toFacelets(), "Twisted corner"));
}

TEST_CASE(moveParsingAndPrinting) {
    const std::vector<Move> moves = movesOf("  R U' F2 D L2' B3  ");
    EXPECT_EQ(formatMoves(moves), std::string("R U' F2 D L2 B'"));
    std::vector<Move> parsed;
    std::string error;
    EXPECT(!parseMoves("R X", parsed, error));
    EXPECT_EQ(error, std::string("Invalid move 'X'"));
    EXPECT(!parseMoves("R2x", parsed, error));
    EXPECT(parseMoves("", parsed, error));
    EXPECT(parsed.empty());
    for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
        EXPECT_EQ(movesOf(moveToString(Move::fromIndex(moveIndex)))[0].index(), moveIndex);
    }
}

TEST_CASE(simplifyMergesAndCancels) {
    const std::vector<std::pair<std::string, std::string>> cases = {
        {"R R", "R2"},
        {"R R'", ""},
        {"R2 R2", ""},
        {"R R R", "R'"},
        {"R U U' R'", ""},
        {"U D U", "U2 D"},
        {"R L R'", "L"},
        {"F B F' B'", ""},
        {"R U R' U'", "R U R' U'"},
        {"D U R R' U' D2", "D'"},
    };
    for (const auto& [input, expected] : cases) {
        const std::vector<Move> simplified = simplifyMoves(movesOf(input));
        EXPECT_EQ(formatMoves(simplified), expected);
        CubieCube original;
        original.applyMoves(movesOf(input));
        CubieCube reduced;
        reduced.applyMoves(simplified);
        EXPECT(original == reduced);
    }
}

TEST_CASE(scrambleIsDeterministicAndClean) {
    EXPECT_EQ(formatMoves(scramble(7, 20)), formatMoves(scramble(7, 20)));
    EXPECT(formatMoves(scramble(7, 20)) != formatMoves(scramble(8, 20)));
    std::set<std::string> distinctScrambles;
    for (uint32_t seed = 0; seed < 200; ++seed) {
        const std::vector<Move> moves = scramble(seed, 25);
        EXPECT_EQ(moves.size(), static_cast<size_t>(25));
        EXPECT_EQ(simplifyMoves(moves).size(), moves.size());
        distinctScrambles.insert(formatMoves(moves));
    }
    EXPECT_EQ(distinctScrambles.size(), static_cast<size_t>(200));
}

int main() {
    return RUN_ALL_TESTS();
}
