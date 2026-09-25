#pragma once

#include <functional>
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace quicktest {

inline int& failureCount() {
    static int failures = 0;
    return failures;
}

inline std::vector<std::pair<std::string, std::function<void()>>>& registeredTests() {
    static std::vector<std::pair<std::string, std::function<void()>>> tests;
    return tests;
}

inline void expectTrue(bool condition, const char* expression, const char* file, int line) {
    if (!condition) {
        ++failureCount();
        std::cerr << file << ":" << line << ": expected " << expression << "\n";
    }
}

template <typename Actual, typename Expected>
void expectEqual(const Actual& actual, const Expected& expected, const char* expression, const char* file, int line) {
    if (!(actual == expected)) {
        ++failureCount();
        std::ostringstream message;
        message << file << ":" << line << ": expected " << expression << "\n  actual:   " << actual
                << "\n  expected: " << expected << "\n";
        std::cerr << message.str();
    }
}

struct TestRegistrar {
    TestRegistrar(const char* name, std::function<void()> body) { registeredTests().emplace_back(name, std::move(body)); }
};

inline int runAllTests() {
    for (const auto& [name, body] : registeredTests()) {
        const int failuresBefore = failureCount();
        body();
        std::cout << (failureCount() == failuresBefore ? "pass  " : "FAIL  ") << name << "\n";
    }
    std::cout << registeredTests().size() << " tests, " << failureCount() << " failed checks\n";
    return failureCount() == 0 ? 0 : 1;
}

}

#define EXPECT(condition) ::quicktest::expectTrue((condition), #condition, __FILE__, __LINE__)
#define EXPECT_EQ(actual, expected) ::quicktest::expectEqual((actual), (expected), #actual " == " #expected, __FILE__, __LINE__)
#define TEST_CASE(testName)                                                        \
    static void testName();                                                        \
    static ::quicktest::TestRegistrar testName##Registrar(#testName, testName);    \
    static void testName()
#define RUN_ALL_TESTS() ::quicktest::runAllTests()
