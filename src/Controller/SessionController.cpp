#include "SessionController.h"
SessionController::SessionController(httplib::server& HttpServer, std::shared_ptr<TsharkManager>tsharkManager)
    :BaseController(HttpServer, tsharkManager)
{
}

void SessionController::registerRoute() {
    __HttpServer.Post("/api/getSessionList", [this](const httplib::Request& request, httplib::Response& response) {
        getSessionList(request, response);
        });

    __HttpServer.Post("/api/getSessionDataStream", [this](const httplib::Request& request, httplib::Response& response) {
        getSessionDataStream(request, response);
        });
}

void SessionController::getSessionList(const httplib::Request& request, httplib::Response& response) {
    
    try {
        QueryCondition queryCondition;
        if (!parseQueryCondition(request, queryCondition)) {
            sendErrorResponse(response, "param parse failed!");
        }

        //调用tsharkManager方法获取数据
        int total = 0;
        std::vector<std::shared_ptr<Session>>sessionList;
        __tsharkManager->querySessions(queryCondition, sessionList, total);
        sendDataList(response, sessionList, total);
    }
    catch (const std::exception& e) {
        LOG_ERROR("getSessionList exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

}

void SessionController::getSessionDataStream(const httplib::Request& request, httplib::Response& response) {
    try {
        uint32_t sessionId = 0;

        //检查body是否有数据
        if (request.body.empty()) {
            return sendErrorResponse(response, "params wrong!");
        }

        //使用RapidJson解析json
        rapidjson::Document doc;
        if (doc.Parse(request.body.c_str()).HasParseError()) {
            return sendErrorResponse(response, "param wrong!");
        }

        //验证是否是json对象
        if (!doc.IsObject()) {
            return sendErrorResponse(response, "param wrong!");
        }

        //提取字段
        if (doc.HasMember("session_id") && doc["session_id"].IsNumber()) {
            sessionId = doc["session_id"].GetInt();
        }

        //调用tsharkManager方法获取数据
        std::vector<DataStreamItem> dataStreamList;
        DataStreamCountInfo countInfo = __tsharkManager->getSessionDataStream(sessionId, dataStreamList);

        //准备json数据
        rapidjson::Document resDoc;
        rapidjson::Document::AllocatorType& allocator = resDoc.GetAllocator();
        resDoc.SetObject();

        //添加code和msg
        resDoc.AddMember("code", 200, allocator);
        resDoc.AddMember("msg", rapidjson::Value("success", allocator), allocator);

        //添加count
        rapidjson::Value countObj(rapidjson::kObjectType);
        countInfo.toJsonObj(countObj, allocator);
        resDoc.AddMember("count", countObj, allocator);

        //构建data数组
        rapidjson::Value dataArray(rapidjson::kArrayType);
        for (const auto data : dataStreamList) {
            rapidjson::Value obj(kObjectType);
            data.toJsonObj(obj, allocator);
            dataArray.PushBack(obj, allocator);
        }

        resDoc.AddMember("data", dataArray, allocator);

        //序列化为字符串
        rapidjson::StringBuffer buffer;
        rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
        resDoc.Accept(writer);

        //设置相应内容
        response.set_content(buffer.GetString(), "application/json");

    }
    catch (const std::exception& e) {
        LOG_ERROR("getSessionDataStream exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}
