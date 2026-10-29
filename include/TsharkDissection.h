#pragma once
#include <filesystem>
#include <string>

inline std::string tsharkDissectionOptions(const std::string& keyLogPath) {
    std::string options = " -o tcp.desegment_tcp_streams:TRUE"
        " -o tls.desegment_ssl_records:TRUE"
        " -o tls.desegment_ssl_application_data:TRUE"
        " -o http.desegment_headers:TRUE"
        " -o http.desegment_body:TRUE";
    options += " -o \"tls.keylog_file:";
    if (!keyLogPath.empty()) options += std::filesystem::u8path(keyLogPath).generic_u8string();
    return options + "\"";
}

inline std::string tsharkPacketProtocol(const std::string& displayProtocol, const std::string& protocols) {
    const std::string stack = ":" + protocols + ":";
    const auto contains = [&stack](const std::string& protocol) {
        return stack.find(":" + protocol + ":") != std::string::npos;
    };
    auto security = stack.rfind(":tls:");
    const auto legacySecurity = stack.rfind(":ssl:");
    if (legacySecurity != std::string::npos
        && (security == std::string::npos || legacySecurity > security)) security = legacySecurity;
    if (security != std::string::npos) {
        if (stack.find(":http:", security + 1) != std::string::npos
            || stack.find(":http2:", security + 1) != std::string::npos) return "HTTPS";
        return displayProtocol;
    }
    if (contains("http") || contains("http2")) {
        return contains("http2") ? "HTTP2" : "HTTP";
    }
    return displayProtocol;
}

inline std::string sessionApplicationProtocol(const std::string& current, const std::string& observed) {
    const auto rank = [](const std::string& protocol) {
        if (protocol.empty() || protocol == "TCP" || protocol == "UDP") return 0;
        if (protocol == "HTTP" || protocol == "HTTP2" || protocol == "HTTPS" || protocol == "HTTP3") return 3;
        if (protocol.compare(0, 3, "TLS") == 0 || protocol.compare(0, 3, "SSL") == 0
            || protocol.compare(0, 4, "DTLS") == 0 || protocol == "QUIC") return 1;
        return 2;
    };
    return rank(observed) > 0 && rank(observed) >= rank(current) ? observed : current;
}
