#include "quickcube/cube.hpp"

#include <algorithm>
#include <sstream>

namespace quickcube {

const char kFaceNames[kFaceCount + 1] = "URFDLB";
const std::string kSolvedFacelets = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

namespace {

const char* const kCornerNames[kCornerCount] = {"URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"};
const char* const kEdgeNames[kEdgeCount] = {"UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"};

const uint8_t kCornerFacelets[kCornerCount][3] = {
    {8, 9, 20}, {6, 18, 38}, {0, 36, 47}, {2, 45, 11},
    {29, 26, 15}, {27, 44, 24}, {33, 53, 42}, {35, 17, 51},
};

const uint8_t kEdgeFacelets[kEdgeCount][2] = {
    {5, 10}, {7, 19}, {3, 37}, {1, 46}, {32, 16}, {28, 25},
    {30, 43}, {34, 52}, {23, 12}, {21, 41}, {50, 39}, {48, 14},
};

const uint8_t kCornerColors[kCornerCount][3] = {
    {U, R, F}, {U, F, L}, {U, L, B}, {U, B, R},
    {D, F, R}, {D, L, F}, {D, B, L}, {D, R, B},
};

const uint8_t kEdgeColors[kEdgeCount][2] = {
    {U, R}, {U, F}, {U, L}, {U, B}, {D, R}, {D, F},
    {D, L}, {D, B}, {F, R}, {F, L}, {B, L}, {B, R},
};

CubieCube makeBasicMove(std::array<uint8_t, kCornerCount> cornerPermutation,
                        std::array<uint8_t, kCornerCount> cornerOrientation,
                        std::array<uint8_t, kEdgeCount> edgePermutation,
                        std::array<uint8_t, kEdgeCount> edgeOrientation) {
    CubieCube cube;
    cube.cornerPermutation = cornerPermutation;
    cube.cornerOrientation = cornerOrientation;
    cube.edgePermutation = edgePermutation;
    cube.edgeOrientation = edgeOrientation;
    return cube;
}

std::array<CubieCube, kFaceCount> buildBasicMoves() {
    return {
        makeBasicMove({UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB}, {0, 0, 0, 0, 0, 0, 0, 0},
                      {UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}),
        makeBasicMove({DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR}, {2, 0, 0, 1, 1, 0, 0, 2},
                      {FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}),
        makeBasicMove({UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB}, {1, 2, 0, 0, 2, 1, 0, 0},
                      {UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR}, {0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0}),
        makeBasicMove({URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR}, {0, 0, 0, 0, 0, 0, 0, 0},
                      {UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}),
        makeBasicMove({URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB}, {0, 1, 2, 0, 0, 2, 1, 0},
                      {UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}),
        makeBasicMove({URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL}, {0, 0, 1, 2, 0, 0, 2, 1},
                      {UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB}, {0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1}),
    };
}

std::array<CubieCube, kMoveCount> buildMoveCubes() {
    const auto basicMoves = buildBasicMoves();
    std::array<CubieCube, kMoveCount> moveCubes;
    for (int face = 0; face < kFaceCount; ++face) {
        CubieCube cube;
        for (int turns = 1; turns <= 3; ++turns) {
            cube.multiply(basicMoves[face]);
            moveCubes[face * 3 + turns - 1] = cube;
        }
    }
    return moveCubes;
}

const std::array<CubieCube, kMoveCount>& allMoveCubes() {
    static const std::array<CubieCube, kMoveCount> moveCubes = buildMoveCubes();
    return moveCubes;
}

using FaceletPermutation = std::array<uint8_t, kFaceletCount>;

std::array<FaceletPermutation, kMoveCount> buildFaceletMoves() {
    std::array<FaceletPermutation, kMoveCount> faceletMoves;
    for (int moveIndex = 0; moveIndex < kMoveCount; ++moveIndex) {
        FaceletPermutation& sourceOf = faceletMoves[moveIndex];
        for (int facelet = 0; facelet < kFaceletCount; ++facelet) {
            sourceOf[facelet] = static_cast<uint8_t>(facelet);
        }
        const CubieCube& cube = allMoveCubes()[moveIndex];
        for (int position = 0; position < kCornerCount; ++position) {
            for (int sticker = 0; sticker < 3; ++sticker) {
                const int target = kCornerFacelets[position][(sticker + cube.cornerOrientation[position]) % 3];
                sourceOf[target] = kCornerFacelets[cube.cornerPermutation[position]][sticker];
            }
        }
        for (int position = 0; position < kEdgeCount; ++position) {
            for (int sticker = 0; sticker < 2; ++sticker) {
                const int target = kEdgeFacelets[position][(sticker + cube.edgeOrientation[position]) % 2];
                sourceOf[target] = kEdgeFacelets[cube.edgePermutation[position]][sticker];
            }
        }
    }
    return faceletMoves;
}

const std::array<FaceletPermutation, kMoveCount>& allFaceletMoves() {
    static const std::array<FaceletPermutation, kMoveCount> faceletMoves = buildFaceletMoves();
    return faceletMoves;
}

int faceIndexOf(char faceLetter) {
    for (int face = 0; face < kFaceCount; ++face) {
        if (kFaceNames[face] == faceLetter) {
            return face;
        }
    }
    return -1;
}

bool isRealCenterArrangement(const std::string& facelets) {
    std::array<int, kFaceCount> centerColors;
    for (int face = 0; face < kFaceCount; ++face) {
        centerColors[face] = faceIndexOf(facelets[face * 9 + 4]);
    }
    for (int face = 0; face < kFaceCount; ++face) {
        if (centerColors[oppositeFace(face)] != oppositeFace(centerColors[face])) {
            return false;
        }
    }
    for (int piece = 0; piece < kCornerCount; ++piece) {
        for (int rotation = 0; rotation < 3; ++rotation) {
            if (kCornerColors[piece][rotation] == centerColors[U] && kCornerColors[piece][(rotation + 1) % 3] == centerColors[R] &&
                kCornerColors[piece][(rotation + 2) % 3] == centerColors[F]) {
                return true;
            }
        }
    }
    return false;
}

template <size_t Size>
int permutationParity(const std::array<uint8_t, Size>& permutation) {
    int inversions = 0;
    for (size_t high = Size - 1; high > 0; --high) {
        for (size_t low = 0; low < high; ++low) {
            if (permutation[low] > permutation[high]) {
                ++inversions;
            }
        }
    }
    return inversions % 2;
}

uint32_t nextRandom(uint32_t& state) {
    state += 0x6D2B79F5u;
    uint32_t mixed = state;
    mixed = (mixed ^ (mixed >> 15)) * (mixed | 1u);
    mixed ^= mixed + (mixed ^ (mixed >> 7)) * (mixed | 61u);
    return mixed ^ (mixed >> 14);
}

}

void CubieCube::cornerMultiply(const CubieCube& other) {
    std::array<uint8_t, kCornerCount> newPermutation;
    std::array<uint8_t, kCornerCount> newOrientation;
    for (int position = 0; position < kCornerCount; ++position) {
        const int source = other.cornerPermutation[position];
        newPermutation[position] = cornerPermutation[source];
        newOrientation[position] = static_cast<uint8_t>((cornerOrientation[source] + other.cornerOrientation[position]) % 3);
    }
    cornerPermutation = newPermutation;
    cornerOrientation = newOrientation;
}

void CubieCube::edgeMultiply(const CubieCube& other) {
    std::array<uint8_t, kEdgeCount> newPermutation;
    std::array<uint8_t, kEdgeCount> newOrientation;
    for (int position = 0; position < kEdgeCount; ++position) {
        const int source = other.edgePermutation[position];
        newPermutation[position] = edgePermutation[source];
        newOrientation[position] = static_cast<uint8_t>(edgeOrientation[source] ^ other.edgeOrientation[position]);
    }
    edgePermutation = newPermutation;
    edgeOrientation = newOrientation;
}

void CubieCube::multiply(const CubieCube& other) {
    cornerMultiply(other);
    edgeMultiply(other);
}

void CubieCube::applyMove(Move move) {
    multiply(allMoveCubes()[move.index()]);
}

void CubieCube::applyMoves(const std::vector<Move>& moves) {
    for (const Move move : moves) {
        applyMove(move);
    }
}

CubieCube CubieCube::inverse() const {
    CubieCube result;
    for (int position = 0; position < kCornerCount; ++position) {
        const int piece = cornerPermutation[position];
        result.cornerPermutation[piece] = static_cast<uint8_t>(position);
        result.cornerOrientation[piece] = static_cast<uint8_t>((3 - cornerOrientation[position]) % 3);
    }
    for (int position = 0; position < kEdgeCount; ++position) {
        const int piece = edgePermutation[position];
        result.edgePermutation[piece] = static_cast<uint8_t>(position);
        result.edgeOrientation[piece] = edgeOrientation[position];
    }
    return result;
}

bool CubieCube::isSolved() const {
    return *this == CubieCube{};
}

int CubieCube::cornerParity() const {
    return permutationParity(cornerPermutation);
}

int CubieCube::edgeParity() const {
    return permutationParity(edgePermutation);
}

std::string CubieCube::verify() const {
    std::array<int, kCornerCount> cornerSeen{};
    for (const uint8_t piece : cornerPermutation) {
        if (piece >= kCornerCount) {
            return "Invalid corner piece";
        }
        if (++cornerSeen[piece] > 1) {
            return std::string("Corner ") + kCornerNames[piece] + " appears more than once";
        }
    }
    std::array<int, kEdgeCount> edgeSeen{};
    for (const uint8_t piece : edgePermutation) {
        if (piece >= kEdgeCount) {
            return "Invalid edge piece";
        }
        if (++edgeSeen[piece] > 1) {
            return std::string("Edge ") + kEdgeNames[piece] + " appears more than once";
        }
    }
    int cornerTwist = 0;
    for (const uint8_t orientation : cornerOrientation) {
        cornerTwist += orientation;
    }
    if (cornerTwist % 3 != 0) {
        return "Twisted corner: one corner is rotated in place and the cube cannot be solved";
    }
    int edgeFlip = 0;
    for (const uint8_t orientation : edgeOrientation) {
        edgeFlip += orientation;
    }
    if (edgeFlip % 2 != 0) {
        return "Flipped edge: one edge is flipped in place and the cube cannot be solved";
    }
    if (cornerParity() != edgeParity()) {
        return "Parity error: two pieces are swapped and the cube cannot be solved";
    }
    return "";
}

std::string CubieCube::toFacelets() const {
    std::string facelets = kSolvedFacelets;
    for (int position = 0; position < kCornerCount; ++position) {
        const int piece = cornerPermutation[position];
        for (int sticker = 0; sticker < 3; ++sticker) {
            facelets[kCornerFacelets[position][(sticker + cornerOrientation[position]) % 3]] = kFaceNames[kCornerColors[piece][sticker]];
        }
    }
    for (int position = 0; position < kEdgeCount; ++position) {
        const int piece = edgePermutation[position];
        for (int sticker = 0; sticker < 2; ++sticker) {
            facelets[kEdgeFacelets[position][(sticker + edgeOrientation[position]) % 2]] = kFaceNames[kEdgeColors[piece][sticker]];
        }
    }
    return facelets;
}

bool CubieCube::operator==(const CubieCube& other) const {
    return cornerPermutation == other.cornerPermutation && cornerOrientation == other.cornerOrientation &&
           edgePermutation == other.edgePermutation && edgeOrientation == other.edgeOrientation;
}

const CubieCube& moveCube(int moveIndex) {
    return allMoveCubes()[moveIndex];
}

std::string checkFaceletAlphabet(const std::string& facelets) {
    const auto isContinuationByte = [](char byte) { return (static_cast<unsigned char>(byte) & 0xC0) == 0x80; };
    size_t characterCount = 0;
    for (const char byte : facelets) {
        characterCount += isContinuationByte(byte) ? 0 : 1;
    }
    if (characterCount != kFaceletCount) {
        return "Expected 54 stickers but got " + std::to_string(characterCount);
    }
    size_t characterPosition = 0;
    for (size_t byteIndex = 0; byteIndex < facelets.size(); ++byteIndex) {
        const unsigned char byte = static_cast<unsigned char>(facelets[byteIndex]);
        if (isContinuationByte(facelets[byteIndex])) {
            continue;
        }
        if (faceIndexOf(facelets[byteIndex]) < 0) {
            const bool isPrintableAscii = byte >= 0x20 && byte < 0x7F;
            const std::string shownSticker = isPrintableAscii ? " '" + std::string(1, facelets[byteIndex]) + "'" : "";
            return "Invalid sticker" + shownSticker + " at position " + std::to_string(characterPosition) +
                   " (expected one of U R F D L B)";
        }
        ++characterPosition;
    }
    return "";
}

FaceletParseResult parseFacelets(const std::string& facelets) {
    FaceletParseResult result;
    result.error = checkFaceletAlphabet(facelets);
    if (!result.error.empty()) {
        return result;
    }

    std::array<int, kFaceCount> stickerCounts{};
    for (const char sticker : facelets) {
        ++stickerCounts[faceIndexOf(sticker)];
    }
    for (int face = 0; face < kFaceCount; ++face) {
        if (stickerCounts[face] != 9) {
            result.error = std::string("Color ") + kFaceNames[face] + " has " + std::to_string(stickerCounts[face]) +
                           " stickers (expected 9)";
            return result;
        }
    }

    std::array<int, kFaceCount> faceOfColor;
    faceOfColor.fill(-1);
    for (int face = 0; face < kFaceCount; ++face) {
        const int centerColor = faceIndexOf(facelets[face * 9 + 4]);
        if (faceOfColor[centerColor] >= 0) {
            result.error = std::string("Duplicate center color ") + kFaceNames[centerColor] + " on faces " +
                           kFaceNames[faceOfColor[centerColor]] + " and " + kFaceNames[face];
            return result;
        }
        faceOfColor[centerColor] = face;
    }
    if (!isRealCenterArrangement(facelets)) {
        result.error = "Center colors are in an impossible arrangement";
        return result;
    }

    std::array<uint8_t, kFaceletCount> stickerFaces;
    for (int position = 0; position < kFaceletCount; ++position) {
        stickerFaces[position] = static_cast<uint8_t>(faceOfColor[faceIndexOf(facelets[position])]);
    }

    CubieCube& cube = result.cube;
    std::array<bool, kCornerCount> cornerUsed{};
    for (int position = 0; position < kCornerCount; ++position) {
        const uint8_t* stickers = kCornerFacelets[position];
        int orientation = 0;
        while (orientation < 3 && stickerFaces[stickers[orientation]] != U && stickerFaces[stickers[orientation]] != D) {
            ++orientation;
        }
        int matchedPiece = -1;
        if (orientation < 3) {
            const uint8_t firstColor = stickerFaces[stickers[(orientation + 1) % 3]];
            const uint8_t secondColor = stickerFaces[stickers[(orientation + 2) % 3]];
            for (int piece = 0; piece < kCornerCount; ++piece) {
                if (kCornerColors[piece][0] == stickerFaces[stickers[orientation]] && kCornerColors[piece][1] == firstColor &&
                    kCornerColors[piece][2] == secondColor) {
                    matchedPiece = piece;
                }
            }
        }
        if (matchedPiece < 0) {
            result.error = std::string("Invalid corner at ") + kCornerNames[position] + ": stickers " +
                           facelets[stickers[0]] + facelets[stickers[1]] + facelets[stickers[2]] +
                           " do not form a real corner piece";
            return result;
        }
        if (cornerUsed[matchedPiece]) {
            result.error = std::string("Duplicate corner: piece ") + kCornerNames[matchedPiece] + " appears more than once";
            return result;
        }
        cornerUsed[matchedPiece] = true;
        cube.cornerPermutation[position] = static_cast<uint8_t>(matchedPiece);
        cube.cornerOrientation[position] = static_cast<uint8_t>(orientation);
    }

    std::array<bool, kEdgeCount> edgeUsed{};
    for (int position = 0; position < kEdgeCount; ++position) {
        const uint8_t firstColor = stickerFaces[kEdgeFacelets[position][0]];
        const uint8_t secondColor = stickerFaces[kEdgeFacelets[position][1]];
        int matchedPiece = -1;
        int orientation = 0;
        for (int piece = 0; piece < kEdgeCount; ++piece) {
            if (kEdgeColors[piece][0] == firstColor && kEdgeColors[piece][1] == secondColor) {
                matchedPiece = piece;
                orientation = 0;
            } else if (kEdgeColors[piece][0] == secondColor && kEdgeColors[piece][1] == firstColor) {
                matchedPiece = piece;
                orientation = 1;
            }
        }
        if (matchedPiece < 0) {
            result.error = std::string("Invalid edge at ") + kEdgeNames[position] + ": stickers " +
                           facelets[kEdgeFacelets[position][0]] + facelets[kEdgeFacelets[position][1]] +
                           " do not form a real edge piece";
            return result;
        }
        if (edgeUsed[matchedPiece]) {
            result.error = std::string("Duplicate edge: piece ") + kEdgeNames[matchedPiece] + " appears more than once";
            return result;
        }
        edgeUsed[matchedPiece] = true;
        cube.edgePermutation[position] = static_cast<uint8_t>(matchedPiece);
        cube.edgeOrientation[position] = static_cast<uint8_t>(orientation);
    }

    result.error = cube.verify();
    result.ok = result.error.empty();
    return result;
}

void applyMoveToFacelets(std::string& facelets, Move move) {
    const FaceletPermutation& sourceOf = allFaceletMoves()[move.index()];
    const std::string before = facelets;
    for (int position = 0; position < kFaceletCount; ++position) {
        facelets[position] = before[sourceOf[position]];
    }
}

std::string applyMovesToFacelets(std::string facelets, const std::vector<Move>& moves) {
    for (const Move move : moves) {
        applyMoveToFacelets(facelets, move);
    }
    return facelets;
}

bool parseMoves(const std::string& text, std::vector<Move>& moves, std::string& error) {
    moves.clear();
    std::istringstream tokens(text);
    std::string token;
    while (tokens >> token) {
        const int face = faceIndexOf(token[0]);
        int turns = 1;
        size_t cursor = 1;
        if (cursor < token.size() && (token[cursor] == '2' || token[cursor] == '3')) {
            turns = token[cursor] - '0';
            ++cursor;
        }
        if (cursor < token.size() && token[cursor] == '\'') {
            turns = 4 - turns;
            ++cursor;
        }
        if (face < 0 || cursor != token.size()) {
            error = "Invalid move '" + token + "'";
            moves.clear();
            return false;
        }
        moves.push_back(Move{static_cast<uint8_t>(face), static_cast<uint8_t>(turns)});
    }
    error.clear();
    return true;
}

std::string moveToString(Move move) {
    std::string text(1, kFaceNames[move.face]);
    if (move.turns == 2) {
        text += '2';
    } else if (move.turns == 3) {
        text += '\'';
    }
    return text;
}

std::string formatMoves(const std::vector<Move>& moves) {
    std::string text;
    for (const Move move : moves) {
        if (!text.empty()) {
            text += ' ';
        }
        text += moveToString(move);
    }
    return text;
}

std::vector<Move> simplifyMoves(const std::vector<Move>& moves) {
    std::vector<Move> result;
    for (const Move move : moves) {
        int mergeIndex = -1;
        const int size = static_cast<int>(result.size());
        if (size >= 1 && result[size - 1].face == move.face) {
            mergeIndex = size - 1;
        } else if (size >= 2 && result[size - 1].face == oppositeFace(move.face) && result[size - 2].face == move.face) {
            mergeIndex = size - 2;
        }
        if (mergeIndex < 0) {
            result.push_back(move);
            continue;
        }
        const int combinedTurns = (result[mergeIndex].turns + move.turns) % 4;
        if (combinedTurns == 0) {
            result.erase(result.begin() + mergeIndex);
        } else {
            result[mergeIndex].turns = static_cast<uint8_t>(combinedTurns);
        }
    }
    return result;
}

std::vector<Move> invertMoves(const std::vector<Move>& moves) {
    std::vector<Move> inverted;
    inverted.reserve(moves.size());
    for (auto move = moves.rbegin(); move != moves.rend(); ++move) {
        inverted.push_back(move->inverse());
    }
    return inverted;
}

std::vector<Move> scramble(uint32_t seed, int length) {
    uint32_t randomState = seed;
    std::vector<Move> moves;
    while (static_cast<int>(moves.size()) < length) {
        const int face = static_cast<int>(nextRandom(randomState) % kFaceCount);
        const int size = static_cast<int>(moves.size());
        if (size >= 1 && moves[size - 1].face == face) {
            continue;
        }
        if (size >= 2 && moves[size - 1].face == oppositeFace(face) && moves[size - 2].face == face) {
            continue;
        }
        const int turns = static_cast<int>(nextRandom(randomState) % 3) + 1;
        moves.push_back(Move{static_cast<uint8_t>(face), static_cast<uint8_t>(turns)});
    }
    return moves;
}

bool solvesCube(const CubieCube& start, const std::vector<Move>& moves) {
    CubieCube cube = start;
    cube.applyMoves(moves);
    return cube.isSolved();
}

}
