#include "MiscUtil.h"
#include "TsharkDissection.h"
int main(int argc, char** argv) {
    std::string xml((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    if (argc == 2 && std::string(argv[1]) == "--options") {
        std::cout << tsharkDissectionOptions(xml);
        return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--protocol") {
        const auto separator = xml.find('\n');
        std::cout << tsharkPacketProtocol(xml.substr(0, separator), xml.substr(separator + 1));
        return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--session") {
        std::string protocol;
        std::istringstream input(xml);
        std::string observed;
        while (std::getline(input, observed)) protocol = sessionApplicationProtocol(protocol, observed);
        std::cout << protocol;
        return 0;
    }
    rapidjson::Document document;
    if (!MiscUtil::xml2JSON(xml, document)) return 1;
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    document.Accept(writer);
    std::cout << buffer.GetString();
}
