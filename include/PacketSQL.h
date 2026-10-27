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
			conditionList.push_back("(src_ip=? OR dst_ip=?)");
		}
		if (queryCondition.port != 0) {
			conditionList.push_back("(src_port=? OR dst_port=?)");
		}
		if (!queryCondition.proto.empty()) {
			conditionList.push_back("(protocol=?)");
		}
		if (queryCondition.session_id != 0) {
			conditionList.push_back("belong_session_id=?");
		}
		if (!queryCondition.keyword.empty()) {
			conditionList.push_back("(src_ip LIKE ? ESCAPE '\\' OR dst_ip LIKE ? ESCAPE '\\' OR protocol LIKE ? ESCAPE '\\')");
		}
		if (!queryCondition.packetFilterSql.empty()) {
			conditionList.push_back(queryCondition.packetFilterSql);
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
