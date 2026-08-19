#pragma once
#include <map>
#include "TsharkManager.h"
#include "httplib/httplib.h"
#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"
#include "spdlog/spdlog.h" 

class BaseController {
public:
	BaseController(httplib::server& HttpServer, std::shared_ptr<TsharkManager> tsharkManager);

	//定义为纯虚函数
	virtual void registerRoute() = 0;


protected:
	httplib::server& __HttpServer;
	std::shared_ptr<TsharkManager> __tsharkManager;

	void sendJsonResponse(httplib::Response& response, rapidjson::Document& doc);

public:

	//从URL中提取参数
	static int getIntParam(const httplib::Request& request, std::string paramName, int defaultValue = 0);

	static std::string getStringParam(const httplib::Request& request, std::string paramName, std::string defaultValue = "");

protected:

	//使用模板形式返回查询到的数据包列表
	template <typename Data>
	void sendDataList(httplib::Response& response, std::vector<std::shared_ptr<Data>>& dataList, int& total);

	//响应成功,无数据
	void sendSuccessResponse(httplib::Response& response);

	//错误响应
	void sendErrorResponse(httplib::Response& response, std::string message);

	//提取请求中的参数
	bool parseQueryCondition(const httplib::Request& request, QueryCondition& queryCondition);

};

template <typename Data>
void BaseController::sendDataList(httplib::Response& response, std::vector<std::shared_ptr<Data>>& dataList, int& total) {

	rapidjson::Document responseObj(rapidjson::kObjectType);    //创建一个空的json对象
	auto allocator = responseObj.GetAllocator();
	responseObj.AddMember("code", 200, allocator);
	responseObj.AddMember("msg", "success", allocator);
	responseObj.AddMember("total", total, allocator);

	//循环遍历数据包容器,转为json存入数组
	rapidjson::Value dataArray(rapidjson::kArrayType);
	for (auto data : dataList) {
		rapidjson::Value dataObj(rapidjson::kObjectType);
		data->toJsonObj(dataObj, allocator);
		dataArray.PushBack(dataObj, allocator);
	}

	responseObj.AddMember("data", dataArray, allocator);


	//序列化为字符串
	rapidjson::StringBuffer buffer;
	rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
	responseObj.Accept(writer);

	response.set_content(buffer.GetString(), "application/json");

}