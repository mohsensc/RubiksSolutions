#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace quickcube {

enum Face : uint8_t { U, R, F, D, L, B };

enum Corner : uint8_t { URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB };

enum Edge : uint8_t { UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR };

constexpr int kFaceCount = 6;
constexpr int kCornerCount = 8;
constexpr int kEdgeCount = 12;
constexpr int kMoveCount = 18;
constexpr int kFaceletCount = 54;

extern const char kFaceNames[kFaceCount + 1];
extern const std::string kSolvedFacelets;

struct Move {
    uint8_t face = U;
    uint8_t turns = 1;

    int index() const { return face * 3 + turns - 1; }
    static Move fromIndex(int moveIndex) { return Move{static_cast<uint8_t>(moveIndex / 3), static_cast<uint8_t>(moveIndex % 3 + 1)}; }
    Move inverse() const { return Move{face, static_cast<uint8_t>(4 - turns)}; }
    bool operator==(const Move& other) const { return face == other.face && turns == other.turns; }
    bool operator!=(const Move& other) const { return !(*this == other); }
};

inline Face oppositeFace(int face) { return static_cast<Face>((face + 3) % kFaceCount); }

struct CubieCube {
    std::array<uint8_t, kCornerCount> cornerPermutation{URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB};
    std::array<uint8_t, kCornerCount> cornerOrientation{};
    std::array<uint8_t, kEdgeCount> edgePermutation{UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR};
    std::array<uint8_t, kEdgeCount> edgeOrientation{};

    static CubieCube solved() { return CubieCube{}; }

    void cornerMultiply(const CubieCube& other);
    void edgeMultiply(const CubieCube& other);
    void multiply(const CubieCube& other);
    void applyMove(Move move);
    void applyMoves(const std::vector<Move>& moves);
    CubieCube inverse() const;

    bool isSolved() const;
    int cornerParity() const;
    int edgeParity() const;
    std::string verify() const;
    std::string toFacelets() const;

    bool operator==(const CubieCube& other) const;
    bool operator!=(const CubieCube& other) const { return !(*this == other); }
};

const CubieCube& moveCube(int moveIndex);

struct FaceletParseResult {
    bool ok = false;
    std::string error;
    CubieCube cube;
};

FaceletParseResult parseFacelets(const std::string& facelets);
std::string checkFaceletAlphabet(const std::string& facelets);
void applyMoveToFacelets(std::string& facelets, Move move);
std::string applyMovesToFacelets(std::string facelets, const std::vector<Move>& moves);

bool parseMoves(const std::string& text, std::vector<Move>& moves, std::string& error);
std::string moveToString(Move move);
std::string formatMoves(const std::vector<Move>& moves);
std::vector<Move> simplifyMoves(const std::vector<Move>& moves);
std::vector<Move> invertMoves(const std::vector<Move>& moves);
std::vector<Move> scramble(uint32_t seed, int length);

bool solvesCube(const CubieCube& start, const std::vector<Move>& moves);

}
