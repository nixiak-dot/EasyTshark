#pragma once
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>

inline bool readTsharkLine(FILE* stream, std::string& line) {
    line.clear();
    char chunk[4096];
    while (std::fgets(chunk, sizeof(chunk), stream)) {
        const size_t length = std::strlen(chunk);
        line.append(chunk, length);
        if (length && chunk[length - 1] == '\n') return true;
    }
    if (std::ferror(stream)) throw std::runtime_error("Failed to read TShark output");
    if (!line.empty()) throw std::runtime_error("Incomplete TShark record at end of output");
    return false;
}
