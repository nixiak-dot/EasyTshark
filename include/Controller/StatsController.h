#pragma once
#include "BaseController.h"
class StatsController : public BaseController {
public:
	StatsController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager);

	virtual void registerRoute();

	void getIPStatsList(const httplib::Request& req, httplib::Response& res);
};