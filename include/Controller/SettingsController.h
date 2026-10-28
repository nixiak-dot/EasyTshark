#pragma once
#include "BaseController.h"
#include "PathDialog.h"

class SettingsController : public BaseController {
public:
    using BaseController::BaseController;

    void registerRoute() override {
        __HttpServer.Post("/api/settings/selectPath", [this](const httplib::Request& request, httplib::Response& response) {
            const auto origin = request.get_header_value("Origin");
            if ((!origin.empty() && origin != "null" && origin != "http://localhost:3000"
                && origin != "http://127.0.0.1:3000" && origin != "http://127.0.0.1:8080")
                || request.get_header_value("Content-Type").rfind("application/json", 0) != 0) {
                return sendErrorResponse(response, "仅允许本机应用请求系统路径选择");
            }
            rapidjson::Document input;
            if (input.Parse(request.body.c_str()).HasParseError() || !input.IsObject()
                || !input.HasMember("field") || !input["field"].IsString()
                || !input.HasMember("currentPath") || !input["currentPath"].IsString()) {
                return sendErrorResponse(response, "路径选择参数格式无效");
            }
            std::string selected;
            std::string error;
            if (!PathDialog::choose(std::string(input["field"].GetString(), input["field"].GetStringLength()),
                std::string(input["currentPath"].GetString(), input["currentPath"].GetStringLength()), selected, error)) {
                return sendErrorResponse(response, error);
            }
            rapidjson::Document result(rapidjson::kObjectType);
            result.AddMember("path", rapidjson::Value(selected.c_str(), result.GetAllocator()).Move(), result.GetAllocator());
            result.AddMember("canceled", selected.empty(), result.GetAllocator());
            sendJsonResponse(response, result);
        });
        __HttpServer.Get("/api/settings", [this](const httplib::Request&, httplib::Response& response) {
            rapidjson::Document document;
            __tsharkManager->getSettings(document);
            sendJsonResponse(response, document);
        });
        __HttpServer.Post("/api/settings", [this](const httplib::Request& request, httplib::Response& response) {
            rapidjson::Document document;
            std::string error;
            if (document.Parse(request.body.c_str()).HasParseError()) {
                return sendErrorResponse(response, "配置 JSON 格式无效");
            }
            if (!__tsharkManager->updateSettings(document, error)) {
                return sendErrorResponse(response, error);
            }
            rapidjson::Document saved;
            __tsharkManager->getSettings(saved);
            sendJsonResponse(response, saved);
        });
    }
};
