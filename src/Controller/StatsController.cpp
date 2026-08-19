#include "StatsController.h"

StatsController::StatsController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager)
    :BaseController(HttpServer, tsharkManager)
{
}

void StatsController::registerRoute() {
    __HttpServer.Post("/api/getIPStatsList", [this](const httplib::Request& request, httplib::Response& response) {
        getIPStatsList(request, response);
        });
}

void StatsController::getIPStatsList(const httplib::Request& request, httplib::Response& response) {
    try {
        auto queryParams = request.params;
        int pageNum = getIntParam(request, "pageNum", 1);
        int PageSize = getIntParam(request, "pageSize", 100);

        QueryCondition queryCondition;
        if (!parseQueryCondition(request, queryCondition)) {
            sendErrorResponse(response, "params wrong!");
            return;
        }

        std::vector<std::shared_ptr<IPStatsInfo>> ipStatsList;
        int total = 0;
        __tsharkManager->getIPStatsList(queryCondition, ipStatsList, total);
        sendDataList(response, ipStatsList, total);

    }
    catch (const std::exception& e) {
        LOG_ERROR("getIPStatsList exception: {}", e.what());
        sendErrorResponse(response, "internal error");
    }
}