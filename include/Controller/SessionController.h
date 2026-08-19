#pragma once
#include "BaseController.h"
class SessionController :public BaseController {
public:

	SessionController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager);

	virtual void registerRoute();

	void getSessionList(const httplib::Request& request, httplib::Response& resonse);

	void getSessionDataStream(const httplib::Request& request, httplib::Response& resonse);

};