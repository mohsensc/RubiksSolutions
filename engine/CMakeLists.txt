cmake_minimum_required(VERSION 3.16)
project(QuickCube CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()
set(CMAKE_CXX_FLAGS_RELEASE "-O2")

file(GLOB coreSources CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp)
add_library(quickcube_core STATIC ${coreSources})
target_include_directories(quickcube_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_compile_options(quickcube_core PRIVATE -O2 -Wall -Wextra)

add_executable(qc tools/qc.cpp)
target_link_libraries(qc PRIVATE quickcube_core)
target_compile_options(qc PRIVATE -O2 -Wall -Wextra)

include(FetchContent)
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.15.2.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

include(GoogleTest)
enable_testing()
file(GLOB testSources CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/tests/*.cpp)
foreach(testSource ${testSources})
    get_filename_component(testName ${testSource} NAME_WE)
    add_executable(${testName} ${testSource})
    target_link_libraries(${testName} PRIVATE quickcube_core GTest::gtest_main)
    target_compile_options(${testName} PRIVATE -O2 -Wall -Wextra)
    gtest_discover_tests(${testName} DISCOVERY_TIMEOUT 120)
endforeach()
