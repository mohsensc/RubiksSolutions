#pragma once

#include <string>
#include <vector>

#include "quickcube/cube.hpp"

namespace quickcube {

struct Stage {
    std::string name;
    std::vector<Move> moves;
    std::string caseName;
};

struct SolveResult {
    bool ok = false;
    std::string error;
    std::vector<Stage> stages;
    double timeMs = 0.0;
};

SolveResult solveOptimal(const CubieCube& cube);
SolveResult solveBeginner(const CubieCube& cube);
SolveResult solveCfop(const CubieCube& cube);
void initOptimalTables();
void initBeginnerTables();
void initCfopTables();

std::vector<Move> flattenStages(const std::vector<Stage>& stages);
bool stagesSolveCube(const CubieCube& start, const std::vector<Stage>& stages);
void simplifyStages(std::vector<Stage>& stages);

}
