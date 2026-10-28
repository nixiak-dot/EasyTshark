#include "MiscUtil.h"
int main() {
    std::string xml((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    rapidjson::Document document;
    if (!MiscUtil::xml2JSON(xml, document)) return 1;
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    document.Accept(writer);
    std::cout << buffer.GetString();
}
