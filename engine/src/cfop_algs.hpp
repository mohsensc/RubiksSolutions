#pragma once

#include <string>
#include <vector>

#include "quickcube/cube.hpp"

namespace quickcube {

struct NamedAlgorithm {
    std::string name;
    std::string notation;
};

const std::vector<NamedAlgorithm>& ollAlgorithms();
const std::vector<NamedAlgorithm>& pllAlgorithms();
std::vector<Move> expandAlgorithm(const std::string& notation);

}
