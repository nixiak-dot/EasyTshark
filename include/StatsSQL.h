#pragma once
#include <string>
#include <sstream>
#include<iostream>
#include "Logger.h"
#include "PageHelper.h"
#include "tshark_datatype.h"
#include "QueryCondition.h"

class StatsSQL {
public:
    static std::string buildIPStatsQuerySQL(QueryCondition& condition) {
        std::string sql;
        std::stringstream ss;
        ss << R"SQL(
            SELECT
                ip,
                location,
                MIN(start_time) AS earliest_time,
                MAX(end_time) AS latest_time,
                GROUP_CONCAT(DISTINCT port) AS ports,
                GROUP_CONCAT(DISTINCT trans_proto) AS trans_protos,
                GROUP_CONCAT(DISTINCT app_proto) AS app_protos,
                SUM(sent_packets) AS total_sent_packets,
                SUM(sent_bytes) AS total_sent_bytes,
                SUM(recv_packets) AS total_recv_packets,
                SUM(recv_bytes) AS total_recv_bytes,
                SUM(tcp_sessions) AS tcp_session_count,
                SUM(udp_sessions) AS udp_session_count
            FROM (
                SELECT
                    ip1 AS ip,
                    ip1_location AS location,
                    start_time,
                    end_time,
                    ip1_port AS port,
                    trans_proto,
                    app_proto,
                    ip1_send_packets_count AS sent_packets,
                    ip1_send_bytes_count AS sent_bytes,
                    ip2_send_packets_count AS recv_packets,
                    ip2_send_bytes_count AS recv_bytes,
                    CASE WHEN trans_proto LIKE '%TCP%' THEN 1 ELSE 0 END AS tcp_sessions,
                    CASE WHEN trans_proto LIKE '%UDP%' THEN 1 ELSE 0 END AS udp_sessions
                FROM t_sessions
                UNION ALL
                SELECT
                    ip2 AS ip,
                    ip2_location AS location,
                    start_time,
                    end_time,
                    ip2_port AS port,
                    trans_proto,
                    app_proto,
                    ip2_send_packets_count AS sent_packets,
                    ip2_send_bytes_count AS sent_bytes,
                    ip1_send_packets_count AS recv_packets,
                    ip1_send_bytes_count AS recv_bytes,
                    CASE WHEN trans_proto LIKE '%TCP%' THEN 1 ELSE 0 END AS tcp_sessions,
                    CASE WHEN trans_proto LIKE '%UDP%' THEN 1 ELSE 0 END AS udp_sessions
                FROM t_sessions
            ) t
        )SQL";

        //准备where条件
        std::vector<std::string> conditionList;
        if (!condition.proto.empty()) {
            char buffer[100] = { 0 };
            snprintf(buffer, sizeof(buffer), "(app_proto like '%%%s%%' or trans_proto like '%%%s%%')", condition.proto.c_str(), condition.proto.c_str());
            conditionList.push_back(buffer);
        }
        if (!condition.ip.empty()) {
            char buffer[100] = { 0 };
            snprintf(buffer, sizeof(buffer), "(ip='%s')", condition.ip.c_str());
            conditionList.push_back(buffer);
        }
        if (condition.port != 0) {
            char buffer[100] = { 0 };
            snprintf(buffer, sizeof(buffer), "(ports like '%%%d%%')", condition.port);
            conditionList.push_back(buffer);
        }

        if (!conditionList.empty()) {
            ss << "WHERE";
            for (size_t i = 0; i < conditionList.size(); ++i) {
                if (i > 0) {
                    ss << "AND";
                }
                ss << conditionList[i];
            }
        }

        ss << "GROUP BY ip";
        ss << PageHelper::getPageSql();
        sql = ss.str();

        Logger::LOG_INFO("build SQL:{}",sql);

        return sql;

    }

    static std::string buildIPStatsQuerySQL_Count(QueryCondition& condition) {
        std::string sql = buildIPStatsQuerySQL(condition);
        auto pos = sql.find("LIMIT");
        if (pos != std::string::npos) {
            sql = sql.substr(0, pos);
        }

        std::string countSql= "SELSCT COUNT(0) FROM (" + sql + ") t_temp";
        Logger::LOG_INFO("build SQL:{}", countSql);
        return countSql;
    }

};