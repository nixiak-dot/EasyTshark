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
            conditionList.push_back("(app_proto LIKE ? OR trans_proto LIKE ?)");
        }
        if (!condition.ip.empty()) {
            conditionList.push_back("(ip1=? OR ip2=?)");
        }
        if (condition.port != 0) {
            conditionList.push_back("(ip1_port=? OR ip2_port=?)");
        }
        if (condition.session_id != 0) {
            conditionList.push_back("(session_id=?)");
        }
        if (!condition.keyword.empty()) {
            conditionList.push_back("(ip1 LIKE ? ESCAPE '\\' OR ip2 LIKE ? ESCAPE '\\' OR trans_proto LIKE ? ESCAPE '\\' OR app_proto LIKE ? ESCAPE '\\')");
        }
        if (!condition.sessionFilterSql.empty()) {
            conditionList.push_back(condition.sessionFilterSql);
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
