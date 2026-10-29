#include "TsharkManager.h"
#include <cassert>

int main(int argc, char** argv) {
    assert(argc == 3);
    const std::string root = argv[1];
    const std::string expected = argv[2];
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
