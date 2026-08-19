#pragma once
#include "BaseController.h"

class AdapterController :public BaseController {
public:
	AdapterController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager);

	//注册路由
	virtual void registerRoute();

	//接口实现
	void getWorkStatus(const httplib::Request& request, httplib::Response& response);

	void startCapture(const httplib::Request& request, httplib::Response& response);

	void stopCapture(const httplib::Request& request, httplib::Response& response);

	void startMonitorAdapterFlowTrend(const httplib::Request& request, httplib::Response& response);

	void stopMonitorAdapterFlowTrend(const httplib::Request& request, httplib::Response& response);

	void getAdapterFlowTrendData(const httplib::Request& request, httplib::Response& response);
};