#pragma once
#include "BaseController.h"

class PacketController :public BaseController {
public:

	PacketController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager);

	//定义路由
	virtual void registerRoute();

	//查询数据包接口
	void queryPacket(const httplib::Request& req, httplib::Response& res);

	//离线查询接口
	void analyseFile(const httplib::Request& request, httplib::Response& response);

	// 获取数据包详情
	void getPacketDetail(const httplib::Request& req, httplib::Response& res);

	//保存文件
	void savePacket(const httplib::Request& request, httplib::Response& response);


};