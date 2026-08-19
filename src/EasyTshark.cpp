#include<iostream>
#include<sstream>
#include<fstream>
#include<cstdio>
#include<cstdlib>
#include<cstring>
#include<string>
#include<vector>
#include<memory>
#include<thread>
#include<chrono>
//导入自定义类
#include "IP2RegionUtil.h"
#include "TsharkManager.h"
#include "tshark_datatype.h"
#include "spdlog/spdlog.h"
#include "spdlog/sinks/basic_file_sink.h"
#include "PageHelper.h"
#include "AdapterController.h"
#include "PacketController.h"
#include "SessionController.h"
#include "StatsController.h"

#include "httplib/httplib.h"
//#include <websocketpp/config/asio_no_tls.hpp>
//#include <websocketpp/server.hpp>

//using WebSocketServer = websocketpp::server<websocketpp::config::asio>;

httplib::server::HandlerResponse before_request(const httplib::Request& request,httplib::Response& response) {

    response.set_header("Access-Control-Allow-Origin", "http://localhost:3000");
    response.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PUT");
    response.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    response.set_header("Access-Control-Allow-Credentials", "true");

    // 步骤2：如果是OPTIONS请求，设置204状态
    if (request.method == "OPTIONS") {
        response.status = 204;  // 无内容
        response.body.clear();  // 清空响应体
    }

    Logger::LOG_INFO("请求接口:{}",request.path);

    // 提取分页参数
    PageAndOrder* pageAndOrder = PageHelper::getPageAndOrder();
    pageAndOrder->pageNum = BaseController::getIntParam(request, "pageNum", 1);
    pageAndOrder->pageSize = BaseController::getIntParam(request, "pageSize", 100);
    pageAndOrder->orderBy = BaseController::getStringParam(request, "orderBy", "");
    pageAndOrder->descOrAsc = BaseController::getStringParam(request, "descOrAsc", "asc");
    return httplib::server::HandlerResponse::Unhandled;

}

void after_response(const httplib::Request& req, httplib::Response& res) {
    
    Logger::LOG_INFO("Received response with status {}", res.status);
}



namespace {
constexpr int kHttpPort = 8080;

bool getUiProcessId(int argc, char* argv[], PID_T& pid) {
    constexpr const char* parameter = "--uipid=";
    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index] == nullptr ? std::string() : argv[index];
        if (argument.rfind(parameter, 0) != 0) {
            continue;
        }
        try {
            pid = static_cast<PID_T>(std::stoul(argument.substr(8)));
            return pid != 0;
        }
        catch (const std::exception&) {
            return false;
        }
    }
    return true;
}
}

int main(int argc, char* argv[]) {
    setlocale(LC_ALL, "zh_CN.UTF-8");

    const std::string currentExePath = ProcessUtil::getExecutableDir();
    Logger::init(currentExePath + "logs/log.txt");

    PID_T uiProcessId = 0;
    if (!getUiProcessId(argc, argv, uiProcessId)) {
        LOG_ERROR("invalid --uipid argument");
        return EXIT_FAILURE;
    }

    auto tsharkManager = std::make_shared<TsharkManager>(currentExePath);
    httplib::server HttpServer;
    HttpServer.Options(".*", [](const httplib::Request&, httplib::Response& response) {
        response.set_header("Access-Control-Allow-Origin", "http://localhost:3000");
        response.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PUT");
        response.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
        response.set_header("Access-Control-Allow-Credentials", "true");
        response.status = 200;
    });
    HttpServer.set_pre_routing_handler(before_request);
    HttpServer.set_post_routing_handler(after_response);

    std::vector<std::shared_ptr<BaseController>> controllerList;
    controllerList.push_back(std::make_shared<PacketController>(HttpServer, tsharkManager));
    controllerList.push_back(std::make_shared<SessionController>(HttpServer, tsharkManager));
    controllerList.push_back(std::make_shared<AdapterController>(HttpServer, tsharkManager));
    controllerList.push_back(std::make_shared<StatsController>(HttpServer, tsharkManager));
    for (auto& controller : controllerList) {
        controller->registerRoute();
    }

    auto runServer = [&HttpServer]() {
        LOG_INFO("EasyTshark server is running on port {}", kHttpPort);
        HttpServer.listen("127.0.0.1", kHttpPort);
    };

    if (uiProcessId == 0) {
        runServer();
    }
    else {
        if (!ProcessUtil::isProcessRunning(uiProcessId)) {
            LOG_ERROR("UI process is not running: {}", uiProcessId);
            return EXIT_FAILURE;
        }
        std::thread serverThread(runServer);
        std::thread uiMonitorThread([uiProcessId]() {
            while (ProcessUtil::isProcessRunning(uiProcessId)) {
                std::this_thread::sleep_for(std::chrono::seconds(1));
            }
        });
        uiMonitorThread.join();
        HttpServer.stop();
        serverThread.join();
    }

    tsharkManager->reset();
    return EXIT_SUCCESS;
}

