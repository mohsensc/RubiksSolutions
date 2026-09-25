#pragma once

#include <string>

namespace quickcube {

std::string apiInit();
std::string apiValidate(const std::string& facelets);
std::string apiApply(const std::string& facelets, const std::string& moves);
std::string apiScramble(int seed, int length);
std::string apiSolve(const std::string& facelets, const std::string& method);

}
