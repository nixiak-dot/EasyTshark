#pragma once
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <fstream>
#include <sstream>
#include <map>
#include<iomanip>
#include<ctime>
#include<set>
#include<thread>
#include<mutex>
#include<regex>
//导入第三方库
#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"
#include "ip2region/xdb_search.h"
#include "spdlog/spdlog.h"
#include "spdlog/sinks/basic_file_sink.h"
//导入自定义类
#include "IP2RegionUtil.h"  
#include "tshark_datatype.h"
#include "ProcessUtil.h"
#include "Logger.h"
#include "MiscUtil.h"
#include "TsharkDatabase.h"
#include "QueryCondition.h"

enum WORK_STATUS {
	STATUS_IDLE = 0,                    // 空闲状态
	STATUS_ANALYSIS_FILE = 1,           // 离线分析文件中
	STATUS_CAPTURING = 2,               // 在线采集抓包中
	STATUS_MONITORING = 3,					// 流量监控
};

class TsharkManager
{
public:
	//完成各项工作的初始化
	TsharkManager(std::string workDir);
	~TsharkManager();

	//打印所有数据包信息
	void printPacket(std::map<uint32_t, std::shared_ptr<Packet>> allPackets);

	//获取指定数据包详细信息
	bool getPacketDetailInfo(uint32_t frameNumber, rapidjson::Document& detailJson);

	void printAllSessions();

	//--------------------------------tshark在线分析------------------------------------------------------
	//开始抓包
	bool startCapture(std::string adapterName);

	//停止抓包
	bool stopCapture();

	//对指定网卡在线抓包
	bool capturePacketEntry(std::string adapterName);

	//保存文件
	bool savePacket(std::string savePath);

	//-------------------------------------静态分析pcap文件-----------------------------
	//静态分析pcap文件入口函数
	bool analysisFile(std::string pcapFilePath);

	bool analysePacketEntry(std::string pcapFilePath);


	bool getPacketHexData(uint32_t frameNumber, std::vector<unsigned char>& data);

	//-------------------------------------流量监控-----------------------------
	
	//获取所有网卡
	std::vector<AdapterInfo> getNetworkAdapters();
	
	//开始监控所有网卡流量统计数据
	void startMonitorAdaptersFlowTrend();

	//停止监控所有网卡流量统计数据
	void stopMonitorAdaptersFlowTread();

	//获取所有网卡流量统计数据
	void getAdaptersFlowTrendData(std::map<std::string,std::map<time_t,long>>& flowTrendData);

	//---------------------------------------网络接口调用------------------------------
	void query(QueryCondition &queryCondition,std::vector<std::shared_ptr<Packet>> &allPackets,int& total);

	void querySessions(QueryCondition& condition, std::vector<std::shared_ptr<Session>>& sessionList,int& total);

	void getIPStatsList(QueryCondition& conditions, std::vector<std::shared_ptr<IPStatsInfo>>& ipStatsList, int total);

	bool savePaket(std::string savePath);

	//-------------------------------------会话-------------------------
	DataStreamCountInfo getSessionDataStream(uint32_t sessionId,std::vector<DataStreamItem>& dataStreamList);


	//-------------------------------------获取工作状态的锁-------------------------
	WORK_STATUS getWorkStatus();

	//重置状态
	void reset();


private:
	//-----------------------------------------------私有方法--------------------------------------------------------
	
	//-------------------------------------------tshark在线分析------------------------------------------------------
	

	//解析tshark输出(线程)
	bool parseLine(std::string line, std::shared_ptr<Packet> packet);

	//获取精确时间
	double formatEpochTime(double epoch);

	//解析tshark输出(网卡)
	void parseAdapter(std::string buffer, AdapterInfo& adapter);

	//将动态抓包处理好的Packet存入容器
	void captureProcessPacket(std::shared_ptr<Packet> packe);

	//------------------------------------------在线抓包数据库存储--------------------------------------------------
	//动态存储线程入口函数
	void captureStorageThreadEntry();

	//静态存储线程入口函数
	void analyseStorageThreadEntry();

	//-------------------------------------------静态pcap文件分析---------------------------------------------------
	//静态分析pcap文件入口函数
	//bool analysePacketEntry(std::string pcapFilePath);
	bool convertToPcap(const std::string& inputPath, const std::string& outputPath);

	void analyseProcessPacket(std::shared_ptr<Packet> packe);

	//-------------------------------------------流量监控---------------------------------------------------
	//获取指定网卡流量趋势数据
	void adapterFlowTrendMonitorThreadEntry(std::string adapterName);

	//------------------------------------------------------私有属性-----------------------------------------------------------
	
	//------------------------------------------------------在线抓包------------------------------------------------------------
	//tshark路径
	std::string tsharkPath;

	//pcap文件路径
	std::string currentFilePath;

	//工作目录
	std::string workDir;

	//IP查询对象
	IP2RegionUtil ip2RegionUtil;

	//在线抓包停止标志
	bool captureStopFlag;

	//分析得到的所有数据包信息
	std::map<uint32_t, std::shared_ptr<Packet>> allPackets;

	//在线抓包的tsharkID
	PID_T captureTsharkPid = 0;

	//在线抓包线程
	std::shared_ptr<std::thread> capturePacketThread;

	//动态分析待存储的数据
	std::vector<std::shared_ptr<Packet>>capturePacketStored;


	//--------------------------------------------------在线抓包数据库存储---------------------------------------------------
	
	//动态存储线程
	std::shared_ptr<std::thread>captureStorageThread;

	//静态存储线程
	std::shared_ptr<std::thread>analyseStorageThread;

	//访问动态存储数据的锁
	std::mutex captureStoreLock;

	//访问静态存储数据的锁
	std::mutex analyseStoreLock;

	//数据库存储
	std::shared_ptr<TsharkDatabase> storage;

	//-------------------------------------------------   静态pcap文件分析----------------------------------------------------

	//静态分析停止标志
	bool analyseStopFlag;

	//静态分析tshark进程ID
	PID_T analyseTsharkPid = 0;

	std::string editcapPath;

	//静态分析线程
	std::shared_ptr<std::thread> analysePacketThread;

	//静态分析待存储的数据
	std::vector<std::shared_ptr<Packet>>analysePacketStored;

	//-------------------------------------------------   流量监控  ----------------------------------------------------
	// 后台流量趋势监控信息
	std::map<std::string, AdapterMonitorInfo> adapterFlowTrendMonitorMap;

	// 锁
	std::recursive_mutex adapterFlowTrendMapLock;

	//网卡流量监控开始时间
	time_t adapterFlowTrendMonitorStartTime = 0;

	// -------------------------------------------------------工作状态-------------------------------------------------------
	WORK_STATUS workStatus = STATUS_IDLE;	
	std::recursive_mutex workStatusLock;

	// --------------------------------------------------------会话表--------------------------------------------------------
	std::unordered_map<FiveTuple, std::shared_ptr<Session>, FiveTupleHash> sessionMap;

	// 等待存储入库的会话列表，使用unordered_set，自动去重(动态和静态)
	std::unordered_set<std::shared_ptr<Session>> captureSessionSetTobeStore;

	std::unordered_set<std::shared_ptr<Session>> analyseSessionSetTobeStore;

	std::map<uint32_t, std::shared_ptr<Session>> sessionIdMap;

};

