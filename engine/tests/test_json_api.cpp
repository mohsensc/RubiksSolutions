#include <string>

#include "quickcube/cube.hpp"
#include "quickcube/json_api.hpp"
#include "quickcube/solvers.hpp"
#include "test_helpers.hpp"

using namespace quickcube;

TEST_CASE(validateReportsOkAndErrors) {
    EXPECT_EQ(apiValidate(kSolvedFacelets), std::string("{\"ok\":true}"));
    EXPECT_EQ(apiValidate("UUU"), std::string("{\"ok\":false,\"error\":\"Expected 54 stickers but got 3\"}"));
}

TEST_CASE(applyReturnsFacelets) {
    EXPECT_EQ(apiApply(kSolvedFacelets, "R"),
              std::string("{\"ok\":true,\"facelets\":\"UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB\"}"));
    EXPECT_EQ(apiApply(kSolvedFacelets, "R Q"), std::string("{\"ok\":false,\"error\":\"Invalid move 'Q'\"}"));
}

TEST_CASE(initWarmsEverySolver) {
    EXPECT_EQ(apiInit(), std::string("{\"ok\":true}"));
    for (const std::string method : {"cfop", "beginner", "optimal"}) {
        const std::string json = apiSolve(kSolvedFacelets, method);
        EXPECT(json.find("\"timeMs\":0.") != std::string::npos);
    }
}

TEST_CASE(scrambleMatchesEngine) {
    EXPECT_EQ(apiScramble(3, 12), "{\"ok\":true,\"moves\":\"" + formatMoves(scramble(3, 12)) + "\"}");
    EXPECT(apiScramble(3, -1).find("\"ok\":false") != std::string::npos);
}

TEST_CASE(solveRejectsBadInput) {
    EXPECT(apiSolve("UUU", "cfop").find("Expected 54 stickers") != std::string::npos);
    std::string accentedFacelets;
    for (int index = 0; index < 54; ++index) {
        accentedFacelets += "\xC3\xA9";
    }
    EXPECT_EQ(apiValidate(accentedFacelets), std::string("{\"ok\":false,\"error\":\"Invalid sticker at position 0 (expected one of U R F D L B)\"}"));
    EXPECT_EQ(apiValidate("\xC3\xA9\xC3\xA9"), std::string("{\"ok\":false,\"error\":\"Expected 54 stickers but got 2\"}"));
    EXPECT(apiSolve(kSolvedFacelets, "magic").find("Unknown method 'magic'") != std::string::npos);
}

std::vector<Move> movesOf(const std::string& text) {
    std::vector<Move> moves;
    std::string error;
    EXPECT(parseMoves(text, moves, error));
    return moves;
}

TEST_CASE(stageBordersCancelAndFold) {
    std::vector<Stage> stages{
        {"First", movesOf("R U R' U'"), ""},
        {"Second", movesOf("U R U2"), ""},
        {"Empty", {}, ""},
        {"Third", movesOf("U2 D F"), ""},
        {"Fourth", movesOf("F' D' B"), ""},
    };
    const std::vector<Move> original = flattenStages(stages);
    simplifyStages(stages);
    EXPECT_EQ(formatMoves(stages[0].moves), std::string("R U"));
    EXPECT_EQ(formatMoves(stages[1].moves), std::string(""));
    EXPECT_EQ(formatMoves(stages[2].moves), std::string(""));
    EXPECT_EQ(formatMoves(stages[3].moves), std::string(""));
    EXPECT_EQ(formatMoves(stages[4].moves), std::string("B"));
    CubieCube expected;
    expected.applyMoves(original);
    CubieCube actual;
    actual.applyMoves(flattenStages(stages));
    EXPECT(expected == actual);
}

TEST_CASE(solveOutputHasNoCancellingNeighbors) {
    for (const std::string method : {"beginner", "cfop"}) {
        for (uint32_t seed = 1; seed <= 60; ++seed) {
            CubieCube cube;
            cube.applyMoves(scramble(seed, 25));
            const std::string json = apiSolve(cube.toFacelets(), method);
            EXPECT(json.rfind("{\"ok\":true", 0) == 0);
            const size_t movesStart = json.find("\"moves\":[") + 9;
            const std::string moveList = json.substr(movesStart, json.find(']', movesStart) - movesStart);
            std::string moveText;
            for (const char character : moveList) {
                if (character != '"') {
                    moveText += character == ',' ? ' ' : character;
                }
            }
            const std::vector<Move> moves = movesOf(moveText);
            for (size_t index = 1; index < moves.size(); ++index) {
                EXPECT(moves[index].face != moves[index - 1].face);
            }
        }
    }
}

int main() {
    return RUN_ALL_TESTS();
}
