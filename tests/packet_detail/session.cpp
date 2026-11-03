#include "TsharkManager.h"
#include <cassert>

int main(int argc, char** argv) {
    assert(argc == 3);
    const std::string root = argv[1];
    const bool longInfo = std::string(argv[2]) == "HTTP-LONG";
    const std::string expected = longInfo ? "HTTP" : argv[2];
    Logger::init(root + "/test.log");
    TsharkManager manager(root);
    assert(manager.analysisFile(root + "/input.pcap"));
    PageHelper::getPageAndOrder()->pageNum = 1;
    PageHelper::getPageAndOrder()->pageSize = 10000;
    QueryCondition condition;
    std::vector<std::shared_ptr<Session>> sessions;
    int total = 0;
    manager.querySessions(condition, sessions, total);
    auto selected = std::find_if(sessions.begin(), sessions.end(), [&expected](const auto& session) {
        return session->app_proto == expected;
    });
    assert(selected != sessions.end());
    condition.proto = expected;
    condition.session_id = (*selected)->session_id;
    std::vector<std::shared_ptr<Packet>> packets;
    manager.query(condition, packets, total);
    assert(total > 0 && !packets.empty());
    if (longInfo) {
        assert(packets.size() == 2);
        assert(std::any_of(packets.begin(), packets.end(), [](const auto& packet) { return packet->info.size() > 4000; }));
        for (const auto& packet : packets) {
            const auto first = std::find_if(packets.begin(), packets.end(), [](const auto& item) { return item->frame_number == 1; });
            assert(first != packets.end());
            const uint32_t expectedOffset = 40 + (packet->frame_number == 1 ? 0 : (*first)->cap_len + 16);
            assert(packet->file_offset == expectedOffset);
            std::vector<unsigned char> bytes;
            assert(manager.getPacketHexData(packet->frame_number, bytes));
            assert(bytes.size() == packet->cap_len);
            assert(bytes.size() >= 14 && bytes[12] == 0x08 && bytes[13] == 0x00);
            std::ifstream file(root + "/input.pcap", std::ios::binary);
            file.seekg(expectedOffset);
            std::vector<unsigned char> original(bytes.size());
            file.read(reinterpret_cast<char*>(original.data()), original.size());
            assert(original == bytes);
        }
        return 0;
    }
    if (expected == "HTTPS") assert(packets.size() >= 2);
    for (const auto& packet : packets) {
        assert(packet->protocol == expected);
        assert(packet->belong_session_id == condition.session_id);
        if (expected == "HTTP" || expected == "HTTPS") {
            rapidjson::Document detail;
            assert(manager.getPacketDetailInfo(packet->frame_number, detail));
            rapidjson::StringBuffer buffer;
            rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
            detail.Accept(writer);
            assert(std::string(buffer.GetString()).find("http.") != std::string::npos);
        }
    }
    condition.session_id = 0;
    sessions.clear();
    manager.querySessions(condition, sessions, total);
    assert(total > 0 && !sessions.empty());
}
