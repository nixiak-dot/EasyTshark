#include "BaseController.h"

BaseController::BaseController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager)
    :__HttpServer(HttpServer)		//HttpServer是一个引用,不可以先声明在赋值
    , __tsharkManager(tsharkManager)

{
}

int BaseController::getIntParam(const httplib::Request& request, std::string paramName, int defaultValue) {

    int value = defaultValue;

    auto it = request.params.find(paramName);
    if (it != request.params.end()) {
        value = stoi(it->second);
    }

    return value;

}

std::string BaseController::getStringParam(const httplib::Request& request, std::string paramName, std::string defaultValue) {

    std::string value = defaultValue;
    auto it = request.params.find(paramName);
    if (it != request.params.end()) {
        value = it->second;
    }

    return value;

}

void BaseController::sendSuccessResponse(httplib::Response& response) {
    rapidjson::Document responseObj(rapidjson::kObjectType);    //创建一个空的json对象
    auto allocator = responseObj.GetAllocator();
    responseObj.AddMember("code", 200, allocator);
    responseObj.AddMember("msg", "success", allocator);

    //序列化为字符串
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    responseObj.Accept(writer);

    response.set_content(buffer.GetString(), "application/json");
}

void BaseController::sendErrorResponse(httplib::Response& response, std::string message) {
    rapidjson::Document responseObj(rapidjson::kObjectType);    //创建一个空的json对象
    auto allocator = responseObj.GetAllocator();
    responseObj.AddMember("code", "400", allocator);
    responseObj.AddMember("msg", rapidjson::Value(message.c_str(), allocator), allocator);


    //序列化为字符串
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    responseObj.Accept(writer);

    response.set_content(buffer.GetString(), "application/json");
}

bool BaseController::parseQueryCondition(const httplib::Request& request, QueryCondition& queryCondition) {

    try {
        // 检查是否有 body 数据
        if (request.body.empty()) {
            throw std::runtime_error("Request body is empty");
            return false;
        }

        // 使用 RapidJSON 解析 JSON
        rapidjson::Document doc;
        if (doc.Parse(request.body.c_str()).HasParseError()) {
            throw std::runtime_error("Failed to parse JSON");
            return false;
        }

        // 验证是否是 JSON 对象
        if (!doc.IsObject()) {
            throw std::runtime_error("Invalid JSON format, expected an object");
            return false;
        }

        // 提取字段并赋值到 QueryCondition 中
        if (doc.HasMember("ip") && doc["ip"].IsString()) {
            queryCondition.ip = doc["ip"].GetString();
        }

        if (doc.HasMember("port") && doc["port"].IsUint()) {
            queryCondition.port = static_cast<uint16_t>(doc["port"].GetUint());
        }

        if (doc.HasMember("proto") && doc["proto"].IsString()) {
            queryCondition.proto = doc["proto"].GetString();
        }

        if (doc.HasMember("session_id") && doc["session_id"].IsUint()) {
            queryCondition.session_id = doc["session_id"].GetUint();
        }

    }
    catch (std::exception&) {
        Logger::LOG_ERROR("参数解析错误");
        return false;
    }

    return true;
}

void BaseController::sendJsonResponse(httplib::Response& response, rapidjson::Document& doc) {

    //初始化文档对象
    rapidjson::Document resDoc;
    rapidjson::Document::AllocatorType& allocator = resDoc.GetAllocator();
    resDoc.SetObject();

    //添加键值对
    resDoc.AddMember("code", "200", allocator);
    resDoc.AddMember("msg", "success", allocator);
    resDoc.AddMember("data", doc, allocator);

    //序列化为字符串
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    resDoc.Accept(writer);

    response.set_content(buffer.GetString(), "application/json");
}
