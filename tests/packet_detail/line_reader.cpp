#include "TsharkLineReader.h"
#include <cassert>
#include <vector>

int main() {
    FILE* stream = std::tmpfile();
    assert(stream);
    const std::vector<std::string> records = {
        "1\t1700000000\t60\t60\t\t\t192.0.2.1\t\t1234\t\t192.0.2.2\t\t80\t\tHTTP\tGET /" + std::string(16000, 'a') + "\t6\t\teth:ip:tcp:http\r\n",
        std::string(4094, 'b') + "\n",
        std::string(4095, 'c') + "\n",
        std::string(8190, 'd') + "\r\n",
        "2\tend\t\t\n",
    };
    for (const auto& record : records) std::fwrite(record.data(), 1, record.size(), stream);
    std::rewind(stream);
    std::string line;
    for (const auto& record : records) {
        assert(readTsharkLine(stream, line));
        assert(line == record);
    }
    assert(!readTsharkLine(stream, line));
    std::fclose(stream);
    stream = std::tmpfile();
    assert(stream);
    std::fputs("incomplete", stream);
    std::rewind(stream);
    bool rejected = false;
    try { readTsharkLine(stream, line); } catch (const std::runtime_error&) { rejected = true; }
    assert(rejected);
    std::fclose(stream);
}
