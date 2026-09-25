#include "quickcube/solvers.hpp"

namespace quickcube {

namespace {

int trailingIndexForFace(const std::vector<Move>& moves, int face) {
    const int size = static_cast<int>(moves.size());
    if (size >= 1 && moves[size - 1].face == face) {
        return size - 1;
    }
    if (size >= 2 && moves[size - 1].face == oppositeFace(face) && moves[size - 2].face == face) {
        return size - 2;
    }
    return -1;
}

int leadingIndexForFace(const std::vector<Move>& moves, int face) {
    const int size = static_cast<int>(moves.size());
    if (size >= 1 && moves[0].face == face) {
        return 0;
    }
    if (size >= 2 && moves[0].face == oppositeFace(face) && moves[1].face == face) {
        return 1;
    }
    return -1;
}

bool mergeAcrossBorder(std::vector<Move>& earlierMoves, std::vector<Move>& laterMoves) {
    if (earlierMoves.empty() || laterMoves.empty()) {
        return false;
    }
    for (const int face : {static_cast<int>(laterMoves.front().face), static_cast<int>(earlierMoves.back().face)}) {
        const int earlierIndex = trailingIndexForFace(earlierMoves, face);
        const int laterIndex = leadingIndexForFace(laterMoves, face);
        if (earlierIndex < 0 || laterIndex < 0) {
            continue;
        }
        const int combinedTurns = (earlierMoves[earlierIndex].turns + laterMoves[laterIndex].turns) % 4;
        earlierMoves.erase(earlierMoves.begin() + earlierIndex);
        if (combinedTurns == 0) {
            laterMoves.erase(laterMoves.begin() + laterIndex);
        } else {
            laterMoves[laterIndex].turns = static_cast<uint8_t>(combinedTurns);
        }
        earlierMoves = simplifyMoves(earlierMoves);
        laterMoves = simplifyMoves(laterMoves);
        return true;
    }
    return false;
}

}

std::vector<Move> flattenStages(const std::vector<Stage>& stages) {
    std::vector<Move> moves;
    for (const Stage& stage : stages) {
        moves.insert(moves.end(), stage.moves.begin(), stage.moves.end());
    }
    return moves;
}

bool stagesSolveCube(const CubieCube& start, const std::vector<Stage>& stages) {
    return solvesCube(start, flattenStages(stages));
}

void simplifyStages(std::vector<Stage>& stages) {
    for (Stage& stage : stages) {
        stage.moves = simplifyMoves(stage.moves);
    }
    bool hasMerged = true;
    while (hasMerged) {
        hasMerged = false;
        int previousIndex = -1;
        for (int index = 0; index < static_cast<int>(stages.size()); ++index) {
            if (previousIndex >= 0 && mergeAcrossBorder(stages[previousIndex].moves, stages[index].moves)) {
                hasMerged = true;
            }
            if (!stages[index].moves.empty()) {
                previousIndex = index;
            }
        }
    }
}

}
