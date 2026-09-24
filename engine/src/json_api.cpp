#include "quickcube/json_api.hpp"

#include <chrono>
#include <cstdio>

#include "quickcube/cube.hpp"
#include "quickcube/solvers.hpp"

namespace quickcube {

namespace {

std::string quoteJson(const std::string& text) {
    std::string quoted = "\"";
    for (const char character : text) {
        switch (character) {
            case '"': quoted += "\\\""; break;
            case '\\': quoted += "\\\\"; break;
            case '\n': quoted += "\\n"; break;
            case '\r': quoted += "\\r"; break;
            case '\t': quoted += "\\t"; break;
            default:
                if (static_cast<unsigned char>(character) < 0x20) {
                    char escaped[8];
                    std::snprintf(escaped, sizeof escaped, "\\u%04x", character);
                    quoted += escaped;
                } else {
                    quoted += character;
                }
        }
    }
    return quoted + "\"";
}

std::string errorJson(const std::string& message) {
    return "{\"ok\":false,\"error\":" + quoteJson(message) + "}";
}

std::string moveListJson(const std::vector<Move>& moves) {
    std::string json = "[";
    for (size_t index = 0; index < moves.size(); ++index) {
        if (index > 0) {
            json += ',';
        }
        json += quoteJson(moveToString(moves[index]));
    }
    return json + "]";
}

std::string formatMilliseconds(double milliseconds) {
    char text[32];
    std::snprintf(text, sizeof text, "%.2f", milliseconds);
    return text;
}

void ensureSolverTables() {
    static bool tablesReady = false;
    if (!tablesReady) {
        initOptimalTables();
        initCfopTables();
        initBeginnerTables();
        tablesReady = true;
    }
}

}

std::string apiInit() {
    ensureSolverTables();
    return "{\"ok\":true}";
}

std::string apiValidate(const std::string& facelets) {
    const FaceletParseResult parsed = parseFacelets(facelets);
    return parsed.ok ? "{\"ok\":true}" : errorJson(parsed.error);
}

std::string apiApply(const std::string& facelets, const std::string& movesText) {
    const std::string alphabetError = checkFaceletAlphabet(facelets);
    if (!alphabetError.empty()) {
        return errorJson(alphabetError);
    }
    std::vector<Move> moves;
    std::string parseError;
    if (!parseMoves(movesText, moves, parseError)) {
        return errorJson(parseError);
    }
    return "{\"ok\":true,\"facelets\":" + quoteJson(applyMovesToFacelets(facelets, moves)) + "}";
}

std::string apiScramble(int seed, int length) {
    if (length < 0 || length > 1000) {
        return errorJson("Scramble length must be between 0 and 1000");
    }
    return "{\"ok\":true,\"moves\":" + quoteJson(formatMoves(scramble(static_cast<uint32_t>(seed), length))) + "}";
}

std::string apiSolve(const std::string& facelets, const std::string& method) {
    const FaceletParseResult parsed = parseFacelets(facelets);
    if (!parsed.ok) {
        return errorJson(parsed.error);
    }

    SolveResult (*solver)(const CubieCube&) = nullptr;
    ensureSolverTables();
    if (method == "optimal") {
        solver = solveOptimal;
    } else if (method == "beginner") {
        solver = solveBeginner;
    } else if (method == "cfop") {
        solver = solveCfop;
    } else {
        return errorJson("Unknown method '" + method + "' (expected optimal, beginner or cfop)");
    }

    const auto startTime = std::chrono::steady_clock::now();
    SolveResult result = solver(parsed.cube);
    const double elapsedMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - startTime).count();
    if (!result.ok) {
        return errorJson(result.error.empty() ? "Solver failed" : result.error);
    }
    simplifyStages(result.stages);
    const std::vector<Move> allMoves = flattenStages(result.stages);
    if (!solvesCube(parsed.cube, allMoves)) {
        return errorJson("Internal error: the " + method + " solution does not solve the cube");
    }

    std::string json = "{\"ok\":true,\"method\":" + quoteJson(method);
    json += ",\"moves\":" + moveListJson(allMoves);
    json += ",\"moveCount\":" + std::to_string(allMoves.size());
    json += ",\"timeMs\":" + formatMilliseconds(elapsedMs);
    json += ",\"stages\":[";
    for (size_t index = 0; index < result.stages.size(); ++index) {
        const Stage& stage = result.stages[index];
        if (index > 0) {
            json += ',';
        }
        json += "{\"name\":" + quoteJson(stage.name) + ",\"moves\":" + moveListJson(stage.moves);
        if (!stage.caseName.empty()) {
            json += ",\"case\":" + quoteJson(stage.caseName);
        }
        json += '}';
    }
    return json + "]}";
}

}
