#pragma once
#include <string>
class QueryCondition {
public:
	std::string ip;
	uint16_t port = 0;
	std::string proto;
	uint32_t session_id = 0;
};