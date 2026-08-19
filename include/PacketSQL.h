#pragma once
#include <string>
#include <sstream>
#include <iostream>
#include <vector>
#include <cstdint>
#include "QueryCondition.h"
#include "tshark_datatype.h"
#include "Logger.h"
#include "PageHelper.h"

class PacketSQL {
public:
	static std::string buildQuerySql(QueryCondition &queryCondition) {

		std::string sql;
		std::stringstream ss;

		ss << "SELECT * FROM t_packets";

		std::vector<std::string> conditionList;
		if (!queryCondition.ip.empty()) {
			char buf[100] = { 0 };
			snprintf(buf, sizeof(buf), "(src_ip='%s' or dst_ip='%s')", queryCondition.ip.c_str(), queryCondition.ip.c_str());
			conditionList.push_back(buf);
		}
		if (queryCondition.port != 0) {
			char buf[100] = { 0 };
			snprintf(buf, sizeof(buf), "(src_port=%d or dst_port=%d)", queryCondition.port, queryCondition.port);
			conditionList.push_back(buf);
		}
		if (!queryCondition.proto.empty()) {
			char buf[100] = { 0 };
			snprintf(buf, sizeof(buf), "(protocol='%s')", queryCondition.proto.c_str());
			conditionList.push_back(buf);
		}
		if (queryCondition.session_id != 0) {
			char buf[100] = { 0 };
			snprintf(buf, sizeof(buf), "belong_session_id=%d", queryCondition.session_id);
			conditionList.push_back(buf);
		}

		// 拼接 WHERE 条件
		if (!conditionList.empty()) {
			ss << " WHERE ";
			for (size_t i = 0; i < conditionList.size(); ++i) {
				if (i > 0) {
					ss << " AND ";
				}
				ss << conditionList[i];
			}
		}

		ss << PageHelper::getPageSql();

		sql = ss.str();
		Logger::LOG_INFO("拼接SQL语句:{} ",sql);
		return sql;
		

	}

	//符合条件的数据包数量
	static std::string buildPacketQuerySQL_Count(QueryCondition& condition) {
		std::string sql = buildQuerySql(condition);
		auto pos = sql.find("LIMIT");
		if (pos != std::string::npos) {
			sql = sql.substr(0, pos);
		}
		std::string countSql = "SELECT COUNT(0) FROM (" + sql + ") t_temp;";
		Logger::LOG_INFO("查询数据包总数sql:{}",countSql);
		return countSql;
	}
};
