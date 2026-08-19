#include "AdapterController.h"
AdapterController::AdapterController(httplib::server& HttpServer, std::shared_ptr<TsharkManager>tsharkManager)
    :BaseController(HttpServer, tsharkManager)
{

}

void AdapterController::registerRoute() {
    __HttpServer.Get("/api/getWorkStatus", [this](const httplib::Request& request, httplib::Response& response) {
        getWorkStatus(request, response);
        });

    __HttpServer.Post("/api/startCapture", [this](const httplib::Request& request, httplib::Response& response) {
        startCapture(request, response);
        });

    __HttpServer.Post("/api/stopCapture", [this](const httplib::Request& request, httplib::Response& response) {
        stopCapture(request, response);
        });

    __HttpServer.Get("/api/startMonitorAdapterFlowTrend", [this](const httplib::Request& request, httplib::Response& response) {
        startMonitorAdapterFlowTrend(request, response);
        });

    __HttpServer.Get("/api/stopMonitorAdapterFlowTrend", [this](const httplib::Request& request, httplib::Response& response) {
        stopMonitorAdapterFlowTrend(request, response);
        });

    __HttpServer.Get("/api/getAdapterFlowTrendData", [this](const httplib::Request& request, httplib::Response& response) {
        getAdapterFlowTrendData(request, response);
        });
}

void AdapterController::getWorkStatus(const httplib::Request& request, httplib::Response& response) {
    try {
        rapidjson::Document doc;
        rapidjson::Document::AllocatorType& allocator = doc.GetAllocator();
        doc.SetObject();

        WORK_STATUS workStatu = __tsharkManager->getWorkStatus();

        doc.AddMember("status", workStatu, allocator);
        doc.AddMember("workStatus", workStatu, allocator);

        sendJsonResponse(response, doc);
    }
    catch (std::exception& e) {
        LOG_ERROR("getWorkStatus exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}

void AdapterController::startCapture(const httplib::Request& request, httplib::Response& response) {

    try {
        //检查请求体是否为空
        if (request.body.empty()) {
            return sendErrorResponse(response, "param is empty!");
        }

        //检查当前状态是否可以抓包
        WORK_STATUS work = __tsharkManager->getWorkStatus();
        if (work != 0) {
            return sendErrorResponse(response, "system is busy");
        }

        //使用rapidjson解析json
        rapidjson::Document doc;

        if (doc.Parse(request.body.c_str()).HasParseError()) {
            return sendErrorResponse(response, "param parse failed!");
        }

        if (!doc.HasMember("adapterName")) {
            return sendErrorResponse(response, "param parse failed!");
        }

        std::string adapterName = doc["adapterName"].GetString();
        if (adapterName.empty()) {
            return sendErrorResponse(response, "param parse failed!");
        }

        //开始抓包
        if (__tsharkManager->startCapture(adapterName)) {
            sendSuccessResponse(response);
        }
        else {
            sendErrorResponse(response, "capture start failed!");
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("startCapture exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

}

void AdapterController::stopCapture(const httplib::Request& request, httplib::Response& response) {

    try {
        if (__tsharkManager->getWorkStatus() == STATUS_CAPTURING) {
            __tsharkManager->stopCapture();
            sendSuccessResponse(response);

        }
        else {
            sendErrorResponse(response, "You are not capturing");
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("stopCapture exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}

void AdapterController::startMonitorAdapterFlowTrend(const httplib::Request& request, httplib::Response& response) {
    try {
        if (__tsharkManager->getWorkStatus() == STATUS_IDLE) {
            __tsharkManager->startMonitorAdaptersFlowTrend();
            sendSuccessResponse(response);
        }
        else if (__tsharkManager->getWorkStatus() == STATUS_MONITORING) {
            sendSuccessResponse(response);
        }
        else {
            sendErrorResponse(response, "system is busy!");
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("startMonitorAdapterFlowTrend exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }

}

void AdapterController::stopMonitorAdapterFlowTrend(const httplib::Request& request, httplib::Response& response) {
    try {
        if (__tsharkManager->getWorkStatus() != STATUS_MONITORING) {
            sendErrorResponse(response, "system is not monitoring!");
        }
        else {
            __tsharkManager->stopMonitorAdaptersFlowTread();
            sendSuccessResponse(response);
        }
    }
    catch (const std::exception& e) {
        LOG_ERROR("stopMonitorAdapterFlowTrend exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}

void AdapterController::getAdapterFlowTrendData(const httplib::Request& request, httplib::Response& response) {
    try {
        std::map<std::string, std::map<time_t, long>> flowTrendData;
        __tsharkManager->getAdaptersFlowTrendData(flowTrendData);

        rapidjson::Document resDoc;
        rapidjson::Document::AllocatorType& allocator = resDoc.GetAllocator();
        resDoc.SetObject();

        //添加code和msg
        resDoc.AddMember("code", 200, allocator);
        resDoc.AddMember("msg", rapidjson::Value("success", allocator), allocator);

        //构建data
        rapidjson::Value dataObject(rapidjson::kObjectType);
        for (const auto& adapterItem : flowTrendData) {
            rapidjson::Value adapterDataList(rapidjson::kArrayType);
            for (const auto& timeItem : adapterItem.second) {
                rapidjson::Value timeObj(rapidjson::kObjectType);
                timeObj.AddMember("time", (unsigned int)timeItem.first, allocator);
                timeObj.AddMember("bytes", (unsigned int)timeItem.second, allocator);
                adapterDataList.PushBack(timeObj, allocator);
            }

            dataObject.AddMember(rapidjson::StringRef(adapterItem.first.c_str()), adapterDataList, allocator);
        }

        resDoc.AddMember("data", dataObject, allocator);

        //序列为json字符串
        rapidjson::StringBuffer buffer;
        rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
        resDoc.Accept(writer);

        //设置相应内容
        response.set_content(buffer.GetString(), "application/json");
    }
    catch (const std::exception& e) {
        LOG_ERROR("getAdapterFlowTrendData exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}
