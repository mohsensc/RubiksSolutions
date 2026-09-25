#include <string>

#include "quickcube/json_api.hpp"

namespace {

std::string responseBuffer;

const char* respond(std::string json) {
    responseBuffer = std::move(json);
    return responseBuffer.c_str();
}

}

extern "C" {

const char* qc_init() {
    return respond(quickcube::apiInit());
}

const char* qc_validate(const char* facelets) {
    return respond(quickcube::apiValidate(facelets ? facelets : ""));
}

const char* qc_apply(const char* facelets, const char* moves) {
    return respond(quickcube::apiApply(facelets ? facelets : "", moves ? moves : ""));
}

const char* qc_scramble(int seed, int length) {
    return respond(quickcube::apiScramble(seed, length));
}

const char* qc_solve(const char* facelets, const char* method) {
    return respond(quickcube::apiSolve(facelets ? facelets : "", method ? method : ""));
}

}
