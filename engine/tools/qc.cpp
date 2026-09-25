#include <cstdlib>
#include <iostream>
#include <string>

#include "quickcube/json_api.hpp"

namespace {

int printUsage() {
    std::cerr << "usage:\n"
              << "  qc solve <optimal|beginner|cfop> <facelets>\n"
              << "  qc scramble <seed> <length>\n"
              << "  qc apply <facelets> <moves...>\n"
              << "  qc validate <facelets>\n";
    return 2;
}

std::string joinArguments(int argc, char** argv, int firstIndex) {
    std::string joined;
    for (int index = firstIndex; index < argc; ++index) {
        if (!joined.empty()) {
            joined += ' ';
        }
        joined += argv[index];
    }
    return joined;
}

}

int main(int argc, char** argv) {
    if (argc < 3) {
        return printUsage();
    }
    const std::string command = argv[1];
    std::string output;
    if (command == "solve" && argc == 4) {
        output = quickcube::apiSolve(argv[3], argv[2]);
    } else if (command == "scramble" && argc == 4) {
        output = quickcube::apiScramble(std::atoi(argv[2]), std::atoi(argv[3]));
    } else if (command == "apply" && argc >= 3) {
        output = quickcube::apiApply(argv[2], joinArguments(argc, argv, 3));
    } else if (command == "validate" && argc == 3) {
        output = quickcube::apiValidate(argv[2]);
    } else {
        return printUsage();
    }
    std::cout << output << '\n';
    return output.rfind("{\"ok\":true", 0) == 0 ? 0 : 1;
}
