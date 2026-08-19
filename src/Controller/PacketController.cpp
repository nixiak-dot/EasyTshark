#include "PacketController.h"
PacketController::PacketController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager)
    :BaseController(HttpServer, tsharkManager)
{
}

void PacketController::registerRoute() {
    __HttpServer.Post("/api/queryPacket", [this](const httplib::Request& request, httplib::Response& response) {
        queryPacket(request, response);
        });

    __HttpServer.Post("/api/analyseFile", [this](const httplib::Request& request, httplib::Response& response) {
        analyseFile(request, response);
        });

    __HttpServer.Post("/api/getPacketDetail", [this](const httplib::Request& request, httplib::Response& response) {
        getPacketDetail(request, response);
        });

    __HttpServer.Post("/api/savePacket", [this](const httplib::Request& request, httplib::Response& response) {
        savePacket(request, response);
        });
}

void PacketController::queryPacket(const httplib::Request& request, httplib::Response& response) {

    try {
        QueryCondition queryCondition;
        if (!parseQueryCondition(request, queryCondition)) {
            return sendErrorResponse(response, "json parse failed");
        }

        int count = 0;
        std::vector<std::shared_ptr<Packet>> allPackets;
        __tsharkManager->query(queryCondition, allPackets, count);

        sendDataList(response, allPackets, count);
    }
    catch (std::exception& e) {
        LOG_ERROR("queryPacket exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

}

void PacketController::analyseFile(const httplib::Request& request, httplib::Response& response) {

    try {
        //检查请求体是否为空
        if (request.body.empty()) {
            return sendErrorResponse(response, "please enter your pcap file! ");
        }

        // 检查当前状态是否允许分析文件
        if (__tsharkManager->getWorkStatus() != STATUS_IDLE) {
            return sendErrorResponse(response, "system busy! ");
        }

        //解析请求体文件路径
        rapidjson::Document doc;
        if (doc.Parse(request.body.c_str()).HasParseError()) {
            return sendErrorResponse(response, "parse file path failed! ");
        }

        if (!doc.IsObject() || !doc.HasMember("filePath") || !doc["filePath"].IsString()) {
            return sendErrorResponse(response, "parse file path failed! ");
        }
        std::string filePath = doc["filePath"].GetString();

        //检查文件是否存在
        auto fileExists = [](const std::string& filePath) -> bool {
            std::ifstream infile(filePath.c_str());
            return infile.good();
            };

        if (!fileExists(filePath)) {
            return sendErrorResponse(response, "file not exist!");
        }

        //调用离线分析函数
        if (__tsharkManager->analysisFile(filePath)) {
            return sendSuccessResponse(response);
        }
        else {
            return sendErrorResponse(response, "analyse call failed! ");
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("analysisFile exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

}

void PacketController::getPacketDetail(const httplib::Request& request, httplib::Response& response) {

    try {
        if (request.body.empty()) {
            return sendErrorResponse(response, "param is empty!");
        }

        // 使用 RapidJSON 解析 JSON
        rapidjson::Document doc;
        if (doc.Parse(request.body.c_str()).HasParseError()) {
            return sendErrorResponse(response, "param parse error!");
        }

        // 提取数据包编号参数
        uint32_t frameNumber = doc["frameNumber"].GetInt();

        // 获取数据包详情
        rapidjson::Document dataDoc;
        __tsharkManager->getPacketDetailInfo(frameNumber, dataDoc);

        sendJsonResponse(response, dataDoc);
    }
    catch (const std::exception& e) {
        LOG_ERROR("getPacketDetail exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

    
}

void PacketController::savePacket(const httplib::Request& request, httplib::Response& response) {
    try {
        if (request.body.empty()) {
            return sendErrorResponse(response, "param error");
        }

        //rapidjson解析json
        rapidjson::Document doc;
        if (doc.Parse(request.body.c_str()).HasParseError() || !doc.IsObject()) {
            return sendErrorResponse(response, "param error");
        }

        //提取路径
        std::string savePath;
        if (doc.HasMember("savePath") && doc["savePath"].IsString()) {
            savePath = doc["savePath"].GetString();
        }
        if (savePath.empty())
        {
            return sendErrorResponse(response, "param error");
        }

        if (__tsharkManager->savePacket(savePath)) {
            sendSuccessResponse(response);
        }
        else {
            return sendErrorResponse(response, "file save error");
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("savePacket exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}
