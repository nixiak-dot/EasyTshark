#pragma once
#include <string>
#include <vector>
#include "TrafficFilter.h"
class QueryCondition {
public:
	std::string ip;
	std::string keyword;
	std::string filterExpression;
	std::string packetFilterSql;
	std::string sessionFilterSql;
	std::vector<TrafficFilterParameter> packetFilterParameters;
	std::vector<TrafficFilterParameter> sessionFilterParameters;
	uint16_t port = 0;
	std::string proto;
	uint32_t session_id = 0;
};
