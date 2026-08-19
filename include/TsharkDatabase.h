#pragma once
#include <vector>
#include <memory>
#include <string>
#include <unordered_set>
#include "sqlite3/sqlite3.h"
#include "tshark_datatype.h"
#include "Logger.h"
#include "QueryCondition.h"
#include "PacketSQL.h"
#include "SessionSQL.h"
#include "StatsSQL.h"
#include "MiscUtil.h"

class TsharkDatabase {

public:

	//构造函数
	TsharkDatabase(std::string dbName);

	//析构函数
    ~TsharkDatabase();

	//创建数据库
    bool createPacketTable();

	//创建会话表
	void createSessionTable();

	//插入
    bool storePackets(std::vector<std::shared_ptr<Packet>> packets);

	//查询
    bool queryPackets(QueryCondition &queryCondition, std::vector<std::shared_ptr<Packet>> &packetList,int& total);

	//存储更新会话
	void storeAndUpdateSessions(std::unordered_set<std::shared_ptr<Session>>& sessions);

	// 从数据库查询会话分页数据
	bool querySessions(QueryCondition& condition, std::vector<std::shared_ptr<Session>>& sessionList,int& total);

	//IP统计数据
	bool queryIPStats(QueryCondition& conditions, std::vector<std::shared_ptr<IPStatsInfo>>& ipStatsList, int total);

private:

	sqlite3* db = nullptr;

};