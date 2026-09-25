#include "cfop_algs.hpp"

#include <array>
#include <sstream>

namespace quickcube {

namespace {

enum class Axis { None, X, Y, Z };

struct FaceTurn {
    int face;
    int direction;
};

struct TokenExpansion {
    std::vector<FaceTurn> faceTurns;
    Axis rotationAxis = Axis::None;
    int rotationDirection = 0;
};

using FaceFrame = std::array<int, kFaceCount>;

bool expansionFor(char symbol, TokenExpansion& expansion) {
    switch (symbol) {
        case 'U': expansion = {{{U, 1}}, Axis::None, 0}; return true;
        case 'R': expansion = {{{R, 1}}, Axis::None, 0}; return true;
        case 'F': expansion = {{{F, 1}}, Axis::None, 0}; return true;
        case 'D': expansion = {{{D, 1}}, Axis::None, 0}; return true;
        case 'L': expansion = {{{L, 1}}, Axis::None, 0}; return true;
        case 'B': expansion = {{{B, 1}}, Axis::None, 0}; return true;
        case 'r': expansion = {{{L, 1}}, Axis::X, 1}; return true;
        case 'l': expansion = {{{R, 1}}, Axis::X, -1}; return true;
        case 'u': expansion = {{{D, 1}}, Axis::Y, 1}; return true;
        case 'd': expansion = {{{U, 1}}, Axis::Y, -1}; return true;
        case 'f': expansion = {{{B, 1}}, Axis::Z, 1}; return true;
        case 'b': expansion = {{{F, 1}}, Axis::Z, -1}; return true;
        case 'M': expansion = {{{R, 1}, {L, -1}}, Axis::X, -1}; return true;
        case 'E': expansion = {{{U, 1}, {D, -1}}, Axis::Y, -1}; return true;
        case 'S': expansion = {{{F, -1}, {B, 1}}, Axis::Z, 1}; return true;
        case 'x': expansion = {{}, Axis::X, 1}; return true;
        case 'y': expansion = {{}, Axis::Y, 1}; return true;
        case 'z': expansion = {{}, Axis::Z, 1}; return true;
        default: return false;
    }
}

void cycleFrame(FaceFrame& frame, int first, int second, int third, int fourth) {
    const int firstFace = frame[first];
    frame[first] = frame[second];
    frame[second] = frame[third];
    frame[third] = frame[fourth];
    frame[fourth] = firstFace;
}

void rotateFrame(FaceFrame& frame, Axis axis, int quarterTurns) {
    for (int turn = 0; turn < quarterTurns; ++turn) {
        switch (axis) {
            case Axis::X: cycleFrame(frame, U, F, D, B); break;
            case Axis::Y: cycleFrame(frame, F, R, B, L); break;
            case Axis::Z: cycleFrame(frame, U, L, D, R); break;
            case Axis::None: break;
        }
    }
}

int normalizedQuarterTurns(int quarterTurns) {
    return ((quarterTurns % 4) + 4) % 4;
}

const std::vector<NamedAlgorithm> kOllAlgorithms = {
    {"OLL 1", "R U2 R2 F R F' U2 R' F R F'"},
    {"OLL 2", "F R U R' U' F' f R U R' U' f'"},
    {"OLL 3", "f R U R' U' f' U' F R U R' U' F'"},
    {"OLL 4", "f R U R' U' f' U F R U R' U' F'"},
    {"OLL 5", "r' U2 R U R' U r"},
    {"OLL 6", "r U2 R' U' R U' r'"},
    {"OLL 7", "r U R' U R U2 r'"},
    {"OLL 8", "l' U' L U' L' U2 l"},
    {"OLL 9", "R U R' U' R' F R2 U R' U' F'"},
    {"OLL 10", "R U R' U R' F R F' R U2 R'"},
    {"OLL 11", "r U R' U R' F R F' R U2 r'"},
    {"OLL 12", "M' R' U' R U' R' U2 R U' M"},
    {"OLL 13", "F U R U' R2 F' R U R U' R'"},
    {"OLL 14", "R' F R U R' F' R F U' F'"},
    {"OLL 15", "l' U' l L' U' L U l' U l"},
    {"OLL 16", "r U r' R U R' U' r U' r'"},
    {"OLL 17", "R U R' U R' F R F' U2 R' F R F'"},
    {"OLL 18", "r U R' U R U2 r2 U' R U' R' U2 r"},
    {"OLL 19", "r' R U R U R' U' M' R' F R F'"},
    {"OLL 20", "r U R' U' M2 U R U' R' U' M'"},
    {"OLL 21", "R U2 R' U' R U R' U' R U' R'"},
    {"OLL 22", "R U2 R2 U' R2 U' R2 U2 R"},
    {"OLL 23", "R2 D' R U2 R' D R U2 R"},
    {"OLL 24", "r U R' U' r' F R F'"},
    {"OLL 25", "F' r U R' U' r' F R"},
    {"OLL 26", "R U2 R' U' R U' R'"},
    {"OLL 27", "R U R' U R U2 R'"},
    {"OLL 28", "r U R' U' M U R U' R'"},
    {"OLL 29", "R U R' U' R U' R' F' U' F R U R'"},
    {"OLL 30", "F R' F R2 U' R' U' R U R' F2"},
    {"OLL 31", "R' U' F U R U' R' F' R"},
    {"OLL 32", "L U F' U' L' U L F L'"},
    {"OLL 33", "R U R' U' R' F R F'"},
    {"OLL 34", "R U R2 U' R' F R U R U' F'"},
    {"OLL 35", "R U2 R2 F R F' R U2 R'"},
    {"OLL 36", "L' U' L U' L' U L U L F' L' F"},
    {"OLL 37", "F R' F' R U R U' R'"},
    {"OLL 38", "R U R' U R U' R' U' R' F R F'"},
    {"OLL 39", "L F' L' U' L U F U' L'"},
    {"OLL 40", "R' F R U R' U' F' U R"},
    {"OLL 41", "R U R' U R U2 R' F R U R' U' F'"},
    {"OLL 42", "R' U' R U' R' U2 R F R U R' U' F'"},
    {"OLL 43", "F' U' L' U L F"},
    {"OLL 44", "F U R U' R' F'"},
    {"OLL 45", "F R U R' U' F'"},
    {"OLL 46", "R' U' R' F R F' U R"},
    {"OLL 47", "R' U' R' F R F' R' F R F' U R"},
    {"OLL 48", "F R U R' U' R U R' U' F'"},
    {"OLL 49", "r U' r2 U r2 U r2 U' r"},
    {"OLL 50", "r' U r2 U' r2 U' r2 U r'"},
    {"OLL 51", "F U R U' R' U R U' R' F'"},
    {"OLL 52", "R U R' U R U' B U' B' R'"},
    {"OLL 53", "l' U2 L U L' U' L U L' U l"},
    {"OLL 54", "r U2 R' U' R U R' U' R U' r'"},
    {"OLL 55", "R' F R U R U' R2 F' R2 U' R' U R U R'"},
    {"OLL 56", "r' U' r U' R' U R U' R' U R r' U r"},
    {"OLL 57", "R U R' U' M' U R U' r'"},
};

const std::vector<NamedAlgorithm> kPllAlgorithms = {
    {"Aa-perm", "x R' U R' D2 R U' R' D2 R2 x'"},
    {"Ab-perm", "x R2 D2 R U R' D2 R U' R x'"},
    {"E-perm", "x' R U' R' D R U R' D' R U R' D R U' R' D' x"},
    {"F-perm", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"},
    {"Ga-perm", "R2 U R' U R' U' R U' R2 U' D R' U R D'"},
    {"Gb-perm", "R' U' R U D' R2 U R' U R U' R U' R2 D"},
    {"Gc-perm", "R2 U' R U' R U R' U R2 U D' R U' R' D"},
    {"Gd-perm", "R U R' U' D R2 U' R U' R' U R' U R2 D'"},
    {"H-perm", "M2 U M2 U2 M2 U M2"},
    {"Ja-perm", "R' U L' U2 R U' R' U2 R L"},
    {"Jb-perm", "R U R' F' R U R' U' R' F R2 U' R'"},
    {"Na-perm", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"},
    {"Nb-perm", "R' U R U' R' F' U' F R U R' F R' F' R U' R"},
    {"Ra-perm", "R U' R' U' R U R D R' U' R D' R' U2 R'"},
    {"Rb-perm", "R2 F R U R U' R' F' R U2 R' U2 R"},
    {"T-perm", "R U R' U' R' F R2 U' R' U' R U R' F'"},
    {"Ua-perm", "R U' R U R U R U' R' U' R2"},
    {"Ub-perm", "R2 U R U R' U' R' U' R' U R'"},
    {"V-perm", "R' U R' U' y R' F' R2 U' R' U R' F R F"},
    {"Y-perm", "F R U' R' U' R U R' F' R U R' U' R' F R F'"},
    {"Z-perm", "M' U M2 U M2 U M' U2 M2"},
};

}

const std::vector<NamedAlgorithm>& ollAlgorithms() {
    return kOllAlgorithms;
}

const std::vector<NamedAlgorithm>& pllAlgorithms() {
    return kPllAlgorithms;
}

std::vector<Move> expandAlgorithm(const std::string& notation) {
    FaceFrame frame{U, R, F, D, L, B};
    std::vector<Move> moves;
    std::istringstream tokens(notation);
    std::string token;
    while (tokens >> token) {
        TokenExpansion expansion;
        if (!expansionFor(token[0], expansion)) {
            return {};
        }
        int quarterTurns = 1;
        size_t cursor = 1;
        if (cursor < token.size() && (token[cursor] == '2' || token[cursor] == '3')) {
            quarterTurns = token[cursor] - '0';
            ++cursor;
        }
        if (cursor < token.size() && token[cursor] == '\'') {
            quarterTurns = -quarterTurns;
            ++cursor;
        }
        if (cursor != token.size()) {
            return {};
        }
        for (const FaceTurn& faceTurn : expansion.faceTurns) {
            const int turns = normalizedQuarterTurns(faceTurn.direction * quarterTurns);
            if (turns != 0) {
                moves.push_back(Move{static_cast<uint8_t>(frame[faceTurn.face]), static_cast<uint8_t>(turns)});
            }
        }
        rotateFrame(frame, expansion.rotationAxis, normalizedQuarterTurns(expansion.rotationDirection * quarterTurns));
    }
    return simplifyMoves(moves);
}

}
