#pragma once
#include <string>
#include <sstream>
#include <vector>

#include "QueryCondition.h"
#include "Logger.h"
class SessionSQL {
public:
    static std::string buildSessionQuerySQL(QueryCondition& condition) {

        std::string sql;
        std::stringstream ss;
        ss << "SELECT * FROM t_sessions";

        std::vector<std::string> conditionList;
        if (!condition.proto.empty()) {
            char buf[100] = { 0 };
            snprintf(buf, sizeof(buf), "(app_proto like '%%%s%%' or trans_proto like '%%%s%%')", condition.proto.c_str(), condition.proto.c_str());
            conditionList.push_back(buf);
        }
        if (!condition.ip.empty()) {
            char buf[100] = { 0 };
            snprintf(buf, sizeof(buf), "(ip1='%s' or ip2='%s')", condition.ip.c_str(), condition.ip.c_str());
            conditionList.push_back(buf);
        }
        if (condition.port != 0) {
            char buf[100] = { 0 };
            snprintf(buf, sizeof(buf), "(ip1_port=%d or ip2_port=%d)", condition.port, condition.port);
            conditionList.push_back(buf);
        }
        if (condition.session_id != 0) {
            char buf[100] = { 0 };
            snprintf(buf, sizeof(buf), "(session_id=%d)", condition.session_id);
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
        Logger::LOG_INFO("session query SQL:{}", sql);
        return sql;
    }

    static std::string buildSessionQuerySQL_Count(QueryCondition& condition) {
        std::string sql = buildSessionQuerySQL(condition);
        auto pos = sql.find("LIMIT");
        if (pos != std::string::npos) {
            sql = sql.substr(0, pos);
        }
        std::string countSql = "SELECT COUNT(0) FROM (" + sql + ") t_temp;";
        Logger::LOG_INFO("查询会话总数sql:{}", countSql);
        return countSql;
    }

};