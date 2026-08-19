#include "TsharkManager.h"
#include <filesystem>
#include <utility>


TsharkManager::TsharkManager(std::string workDir) {
	this->workDir = std::move(workDir);
	if (this->workDir.empty()) {
		this->workDir = ".";
	}
	if (this->workDir.back() != '\\' && this->workDir.back() != '/') {
		this->workDir.push_back('/');
	}
	const std::filesystem::path workPath(this->workDir);
	if (!std::filesystem::exists(workPath / "tshark") && std::filesystem::exists(workPath / ".." / "tshark")) {
		this->workDir = (workPath / "..").lexically_normal().string();
		if (this->workDir.back() != '\\' && this->workDir.back() != '/') {
			this->workDir.push_back('/');
		}
	}

	tsharkPath = this->workDir + "tshark/bin/tshark.exe";
	editcapPath = this->workDir + "tshark/bin/editcap.exe";
	if (!std::filesystem::exists(tsharkPath) && std::filesystem::exists("D:\\wireshark\\tshark.exe")) {
		tsharkPath = "D:\\wireshark\\tshark.exe";
	}
	if (!std::filesystem::exists(editcapPath) && std::filesystem::exists("D:\\wireshark\\editcap.exe")) {
		editcapPath = "D:\\wireshark\\editcap.exe";
	}

	std::filesystem::create_directories(this->workDir + "pcap");
	std::string xdbPath = this->workDir + "ip2region.xdb";
	if (!std::filesystem::exists(xdbPath)) {
		xdbPath = this->workDir + "third_library/ip2region/ip2region.xdb";
	}
	if (!std::filesystem::exists(xdbPath)) {
		xdbPath = this->workDir + "../../third_library/ip2region/ip2region.xdb";
	}
	ip2RegionUtil.init(xdbPath);
	storage = std::make_shared<TsharkDatabase>(this->workDir + "myPacketDatabase.db");
}

TsharkManager::~TsharkManager() {
	IP2RegionUtil::uninit();
}

std::map<uint8_t, std::string> ipProtoMap = {
	{1, "ICMP"},
	{2, "IGMP"},
	{6, "TCP"},
	{17, "UDP"},
	{47, "GRE"},
	{50, "ESP"},
	{51, "AH"},
	{88, "EIGRP"},
	{89, "OSPF"},
	{132, "SCTP"}
};

//-----------------------------------动态在线抓包-----------------------------------
//开始抓包
bool TsharkManager::startCapture(std::string adapterName) {

	reset();
	this->workStatus = STATUS_CAPTURING;

	Logger::LOG_INFO("即将开始抓包,网卡名:",adapterName);
	captureStopFlag = false;
	//抓包线程
	capturePacketThread = std::make_shared<std::thread>(&TsharkManager::capturePacketEntry,this,adapterName);
	//存储线程
	captureStorageThread = std::make_shared<std::thread>(&TsharkManager::captureStorageThreadEntry,this);

	return true;
}

//停止抓包
bool TsharkManager::stopCapture() {

	Logger::LOG_INFO("即将停止抓包");
	captureStopFlag = true;

	//终止tshark进程
	ProcessUtil::kill(captureTsharkPid);

	//终止抓包和存储线程并释放
	capturePacketThread->join();
	capturePacketThread.reset();

	captureStorageThread->join();
	captureStorageThread.reset();

	this->workStatus = STATUS_IDLE;

	return true;

}

//动态在线抓包入口函数
bool TsharkManager::capturePacketEntry(std::string adapterName) {
	currentFilePath = workDir + "pcap/capture.pcap";
	std::vector<std::string> tsharkArgs = {
		"\"" + tsharkPath + "\"",
		"-i","\""+adapterName + "\"",
		"-w", "\"" + currentFilePath + "\"",
		"-F","pcap",
		"-l",
		"-T", "fields",
		"-e", "frame.number",
		"-e", "frame.time_epoch",
		"-e", "frame.len",
		"-e", "frame.cap_len",
		"-e", "eth.src",
		"-e", "eth.dst",
		"-e", "ip.src",
		"-e", "ipv6.src",
		"-e", "tcp.srcport",
		"-e", "udp.srcport",
		"-e", "ip.dst",
		"-e", "ipv6.dst",
		"-e", "tcp.dstport",
		"-e", "udp.dstport ",
		"-e", "_ws.col.Protocol ",
		"-e", "_ws.col.Info ",
		"-e", "ip.proto",
		"-e", "ipv6.nxt",
	};
	std::string command;
	for (auto& p : tsharkArgs) {
		command += p;
		command += " ";
	}

	//FILE* pipe = _popen(command.c_str(),"r");
	FILE* pipe = ProcessUtil::popenEx(command.c_str(), &captureTsharkPid);
	if (!pipe) {
		std::cerr << "fail to open file";
		return false;
	}

	char buffer[4096];
	uint32_t file_offset = sizeof(PcapHeader);
	int countPackets = 0;
	while (fgets(buffer, sizeof(buffer), pipe) != nullptr && !captureStopFlag) {

		// 在线采集的时候过滤额外的信息
		std::string line = buffer;
		if (line.find("Capturing on") != std::string::npos) {
			continue;
		}

		std::shared_ptr<Packet> packet = std::make_shared<Packet>();

		if (!parseLine(buffer, packet)) {
			Logger::LOG_ERROR("parse failed, tshark input:{}", buffer);

			assert(false);
		}

		//计算数据包偏移量
		file_offset += sizeof(PacketHeader);
		packet->file_offset = file_offset;
		file_offset += packet->cap_len;

		//保存数据包
		captureProcessPacket(packet);

		countPackets += 1;
	}

	Logger::LOG_INFO("动态数据分析完成,数据包数量为{}", countPackets);

	_pclose(pipe);

	return true;
}

//解析tshark输出(线程)
bool TsharkManager::parseLine(std::string line, std::shared_ptr<Packet> packet) {
	//剔除换行符
	if (line.back() == '\n') {
		line.pop_back();
	}

	std::vector<std::string>fields;
	size_t start = 0;
	size_t end = line.find('\t', start);
	while (end != std::string::npos) {
		fields.emplace_back(line.substr(start, end - start));
		start = end + 1;
		end = line.find('\t', start);
	}
	fields.emplace_back(line.substr(start));


	//0. frame_number
	//1. time 
	//2. len
	//3. cap_len
	//4. src_mac 
	//5. dst_mac 
	//6. src_ip
	//7. src_ipv6
	//8. tcp_srcport
	//9. udp_srcport 
	//10 dst_ip
	//11.dst_ipv6
	//12.tcp_dstport
	//13.udp_dstport
	//14.protocol
	//15.info
	//16.ip.proto   传输层协议
	//17.ipv6.nxt

	if (fields.size() >= 16) {  // 改为16，因为ARP包只有16个字段
		packet->frame_number = std::stoi(fields[0]);
		packet->time = formatEpochTime(std::stod(fields[1]));
		packet->len = std::stoi(fields[2]);
		packet->cap_len = std::stoi(fields[3]);
		packet->src_mac = fields[4];
		packet->dst_mac = fields[5];
		packet->src_ip = fields[6].empty() ? fields[7] : fields[6];
		if (fields[6].empty()) {
			packet->src_ip = fields[7];
			packet->src_location = "IPV6地址";
		}
		else {
			packet->src_ip = fields[6];
			packet->src_location = IP2RegionUtil::getIpLocation(packet->src_ip);
		}
		if (fields[10].empty()) {
			packet->dst_ip = fields[11];
			packet->dst_location = "IPV6地址";
		}
		else {
			packet->dst_ip = fields[10];
			packet->dst_location = IP2RegionUtil::getIpLocation(packet->dst_ip);
		}
		packet->protocol = fields[14];
		packet->info = fields[15];

		// 安全地处理端口号
		if (fields.size() > 8 && (!fields[8].empty() || !fields[9].empty())) {
			packet->src_port = std::stoi(fields[8].empty() ? fields[9] : fields[8]);
		}

		if (fields.size() > 12 && (!fields[12].empty() || !fields[13].empty())) {
			packet->dst_port = std::stoi(fields[12].empty() ? fields[13] : fields[12]);
		}

		// 安全地处理传输层协议号 - 关键修复！
		if (fields.size() > 16) {
			if (!fields[16].empty() || (fields.size() > 17 && !fields[17].empty())) {
				const std::string& protoStr = fields[16].empty() ? fields[17] : fields[16];
				if (!protoStr.empty()) {
					try {
						uint8_t transProtoNumber = std::stoi(protoStr);
						if (ipProtoMap.find(transProtoNumber) != ipProtoMap.end()) {
							packet->trans_proto = ipProtoMap[transProtoNumber];
						}
					}
					catch (const std::exception& e) {
						// 忽略转换异常，使用默认值
						Logger::LOG_WARN("协议号转换失败: {},{}", protoStr, e.what());
					}
				}
			}
		}

		return true;
	}
	else {
		Logger::LOG_ERROR("字段数量不足: {}，需要至少16个", fields.size());
		return false;
	}

}

//将动态抓包处理好的数据包存入数据库
void TsharkManager::captureProcessPacket(std::shared_ptr<Packet> packet) {
	allPackets.insert(std::make_pair<>(packet->frame_number, packet));

	captureStoreLock.lock();
	capturePacketStored.push_back(packet);
	captureStoreLock.unlock();

	if (packet->trans_proto == "TCP" || packet->trans_proto == "UDP") {

		// 创建五元组
		FiveTuple tuple{ packet->src_ip, packet->dst_ip, packet->src_port, packet->dst_port, packet->trans_proto };

		// 将数据包加入到相应会话的列表中，并更新统计信息
		std::shared_ptr<Session> session;
		if (sessionMap.find(tuple) == sessionMap.end()) {
			// 新的会话，初始化会话信息
			session = std::make_shared<Session>();
			session->session_id = static_cast<uint32_t>(sessionMap.size()) + 1;        // 通过序号来分配ID
			session->ip1 = packet->src_ip;
			session->ip2 = packet->dst_ip;
			session->ip1_location = packet->src_location;
			session->ip2_location = packet->dst_location;
			session->ip1_port = packet->src_port;
			session->ip2_port = packet->dst_port;
			session->start_time = packet->time;
			session->end_time = packet->time;
			session->trans_proto = packet->trans_proto;
			if (packet->protocol != "TCP" && packet->protocol != "UDP") {
				session->app_proto = packet->protocol;
			}

			sessionMap.insert(std::make_pair(tuple, session));
			sessionIdMap.insert(std::make_pair(session->session_id,session));
		}
		else {
			// 旧的会话，更新会话信息
			session = sessionMap[tuple];
			session->end_time = packet->time;
			if (packet->protocol != "TCP" && packet->protocol != "UDP") {
				session->app_proto = packet->protocol;
			}
		}

		// 共同的字段更新
		{
			session->packet_count++;
			session->total_bytes += packet->len;
			packet->belong_session_id = session->session_id;
		}

		// 统计双方的交互数据
		if (session->ip1 == packet->src_ip) {
			session->ip1_send_packets_count++;
			session->ip1_send_bytes_count += packet->len;
		}
		else {
			session->ip2_send_packets_count++;
			session->ip2_send_bytes_count += packet->len;
		}

		captureSessionSetTobeStore.insert(session);
	}

}

//获取准确时间
double TsharkManager::formatEpochTime(double epoch) {
	//拆出秒和微妙
	time_t second = static_cast<time_t>(epoch);
	int microSecond = static_cast<int>(1000000 * (epoch - second));

	//转为本当地时间
	std::tm tm_time;
#ifdef _WIN32
	localtime_s(&tm_time, &second);
#else
	localtime_r(&second, &tm_time);
#endif
	// 将时间转换为数值：YYYYMMDDHHMMSS.microseconds
	double numericTime = (tm_time.tm_year + 1900) * 10000000000.0 +
		(tm_time.tm_mon + 1) * 100000000.0 +
		tm_time.tm_mday * 1000000.0 +
		tm_time.tm_hour * 10000.0 +
		tm_time.tm_min * 100.0 +
		tm_time.tm_sec +
		microSecond / 1000000.0;

	return numericTime;
}

//将数据包转为json格式并输出
void TsharkManager::printPacket(std::map<uint32_t, std::shared_ptr<Packet>> allPackets) {
	for (auto& pair : allPackets) {
		std::shared_ptr<Packet> packet = pair.second;
		//构建一个json对象
		rapidjson::Document pktObj;
		rapidjson::Document::AllocatorType& allocator = pktObj.GetAllocator();

		//构建json为object对象类型
		pktObj.SetObject();

		//添加json字段
		pktObj.AddMember("frame_number", packet->frame_number, allocator);
		pktObj.AddMember("timestamp",packet->time, allocator);
		pktObj.AddMember("eth_src", rapidjson::Value(packet->src_mac.c_str(), allocator), allocator);
		pktObj.AddMember("eth_dst", rapidjson::Value(packet->dst_mac.c_str(), allocator), allocator);
		pktObj.AddMember("src_ip", rapidjson::Value(packet->src_ip.c_str(), allocator), allocator);
		pktObj.AddMember("src_location", rapidjson::Value(packet->src_location.c_str(), allocator), allocator);
		pktObj.AddMember("src_port", packet->src_port, allocator);
		pktObj.AddMember("dst_ip", rapidjson::Value(packet->dst_ip.c_str(), allocator), allocator);
		pktObj.AddMember("dst_location", rapidjson::Value(packet->dst_location.c_str(), allocator), allocator);
		pktObj.AddMember("dst_port", packet->dst_port, allocator);
		pktObj.AddMember("protocol", rapidjson::Value(packet->protocol.c_str(), allocator), allocator);
		pktObj.AddMember("info", rapidjson::Value(packet->info.c_str(), allocator), allocator);

		//序列化为json字符串
		rapidjson::StringBuffer buffer;
		rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
		pktObj.Accept(writer);

		//打印json输出
		std::cout << buffer.GetString() << std::endl;
		std::cout << "\n";
	}

}


//解析tshark输出(网卡)
void TsharkManager::parseAdapter(std::string buffer, AdapterInfo& adapter) {
	if (buffer.back() == '\n') {
		buffer.pop_back();
	}

	int countParse = 0;
	size_t start = 0;
	size_t end = buffer.find(" ", start);
	std::vector<std::string>fields;
	while (end != std::string::npos && countParse <= 1) {
		fields.emplace_back(buffer.substr(start, end - start));
		start = end + 1;
		end = buffer.find(" ", start);
		countParse++;
	}
	fields.emplace_back(buffer.substr(start));

	adapter.id = std::stoi(fields[0]);
	adapter.name = fields[1];

	std::smatch match;
	std::regex pattern("\\((.*)\\)");

	if (std::regex_search(fields[2], match, pattern)) {
		adapter.remark = match[1].str();
	}
}

bool TsharkManager::getPacketHexData(uint32_t frameNumber, std::vector<unsigned char>& data) {

	// 获取指定编号数据包的信息
	if (allPackets.find(frameNumber) == allPackets.end()) {
		std::cerr << "找不到编号为 " << frameNumber << " 的数据包" << std::endl;
		return false;
	}
	std::shared_ptr<Packet> packet = allPackets[frameNumber];


	// 打开文件（以二进制模式）
	std::ifstream file(currentFilePath, std::ios::binary);
	if (!file) {
		std::cerr << "无法打开文件: " << currentFilePath << std::endl;
		return false;
	}

	// 移动到指定偏移位置
	file.seekg(packet->file_offset, std::ios::beg);
	if (!file) {
		std::cerr << "seekg 失败，偏移可能超出文件大小" << std::endl;
		return false;
	}

	// 读取数据
	data.resize(packet->cap_len);
	file.read(reinterpret_cast<char*>(data.data()), packet->cap_len);

	return true;
}


//以json形式输出数据包协议树
bool TsharkManager::getPacketDetailInfo(uint32_t frameNumber, rapidjson::Document& detailJson) {
	//通过editcap将某一帧数据包摘出来
	std::string tmpFilePath = workDir + "pcap/detail_" + MiscUtil::getRandomString(10) + ".pcap";	//生成中间文件路径
	std::string splitCmd = "\"" + editcapPath + "\" -r \"" + currentFilePath + "\" \"" + tmpFilePath + "\" " + std::to_string(frameNumber) + "-" + std::to_string(frameNumber);

	if (!ProcessUtil::Exec(splitCmd)) {
		Logger::LOG_ERROR("创建进程失败:", splitCmd);
		remove(tmpFilePath.c_str());
		return false;
	}

	//通过tshark获取指定数据报的详细信息,输出格式为xml
	//使用的tshark命令为`tshark -r ${tmpFilePath} -T pdml`
	std::string command = "\"" + tsharkPath + "\" -r \"" + tmpFilePath + "\" -T pdml";
	std::unique_ptr<FILE, decltype(&_pclose)> pipe(ProcessUtil::popenEx(command), _pclose);
	if (!pipe) {
		Logger::LOG_ERROR("管道创建失败,命令:{}",command);
		remove(tmpFilePath.c_str());
		return false;
	}

	//读取tshark输出到buffer
	char buffer[8192] = { 0 };
	std::string result;
	setvbuf(pipe.get(),NULL,_IOFBF,sizeof(buffer));
	while (fgets(buffer, sizeof(buffer) - 1, pipe.get()) != nullptr) {
		result += buffer;
		memset(buffer,0,sizeof(buffer));
	}

	remove(tmpFilePath.c_str());

	//将数据包转化为xml
	// 将xml内容转换为JSON
	if (!MiscUtil::xml2JSON(result, detailJson)) {
		Logger::LOG_ERROR("无法转换成json格式");
		return false;
	}

	// 将xml内容转换为JSON
	// 将原始十六进制数据插入进去
	if (detailJson.HasMember("pdml") && detailJson["pdml"].HasMember("packet")) {
		std::string packetHex;
		std::vector<unsigned char> packetData;
		if (getPacketHexData(frameNumber, packetData)) {
			// 将原始数据转换为16进制格式
			std::ostringstream oss;
			oss << std::hex << std::setfill('0');
			for (unsigned char ch : packetData) {
				oss << std::setw(2) << static_cast<int>(ch);
			}
			packetHex = oss.str();
		}

		detailJson["pdml"]["packet"][0].AddMember(
			"hexdata",
			rapidjson::Value().SetString(packetHex.c_str(), detailJson.GetAllocator()),
			detailJson.GetAllocator()
		);

		// 去掉外层的键值
		rapidjson::Value temp;
		temp.CopyFrom(detailJson["pdml"]["packet"][0], detailJson.GetAllocator());
		detailJson.SetObject();
		detailJson.CopyFrom(temp, detailJson.GetAllocator());

		return true;
	}

	return false;
}

//-------------------------------------------------静态Pcap文件分析-----------------------------------------------------

bool TsharkManager::convertToPcap(const std::string& inputPath, const std::string& outputPath) {
	if (!std::filesystem::is_regular_file(inputPath)) {
		Logger::LOG_ERROR("离线分析文件不存在: {}", inputPath);
		return false;
	}

	const std::filesystem::path destination(outputPath);
	if (destination.has_parent_path()) {
		std::filesystem::create_directories(destination.parent_path());
	}

	std::string extension = std::filesystem::path(inputPath).extension().string();
	std::transform(extension.begin(), extension.end(), extension.begin(),
		[](unsigned char value) { return static_cast<char>(std::tolower(value)); });
	if (extension == ".pcap") {
		return MiscUtil::copyFile(inputPath, outputPath);
	}

	if (editcapPath.empty() || !std::filesystem::is_regular_file(editcapPath)) {
		Logger::LOG_ERROR("找不到 editcap，无法将 {} 转换为 pcap", inputPath);
		return false;
	}

	const std::string command = "\"" + editcapPath + "\" -F pcap \"" + inputPath + "\" \"" + outputPath + "\"";
	if (!ProcessUtil::Exec(command)) {
		Logger::LOG_ERROR("转换 pcap 失败: {}", command);
		return false;
	}
	return std::filesystem::is_regular_file(outputPath);
}

//静态pcap文件分析入口函数
bool TsharkManager::analysisFile(std::string pcapFilePath) {

	reset();

	currentFilePath = workDir + "pcap/" + MiscUtil::getPcapNameByCurrentTimestamp();
	if (!convertToPcap(pcapFilePath, currentFilePath)) {
		currentFilePath.clear();
		return false;
	}

	this->workStatus = STATUS_ANALYSIS_FILE;

	std::vector<std::string> tsharkArgs = {
		tsharkPath,
		"-r",currentFilePath,
		"-T", "fields",
		"-e", "frame.number",
		"-e", "frame.time_epoch",
		"-e", "frame.len",
		"-e", "frame.cap_len",
		"-e", "eth.src",
		"-e", "eth.dst",
		"-e", "ip.src",
		"-e", "ipv6.src",
		"-e", "tcp.srcport",
		"-e", "udp.srcport",
		"-e", "ip.dst",
		"-e", "ipv6.dst",
		"-e", "tcp.dstport",
		"-e", "udp.dstport ",
		"-e", "_ws.col.Protocol ",
		"-e", "_ws.col.Info ",
		"-e", "ip.proto",
		"-e", "ipv6.nxt",
	};
	std::string command;
	for (size_t index = 0; index < tsharkArgs.size(); ++index) {
		if (index == 0 || index == 2) {
			command += "\"" + tsharkArgs[index] + "\"";
		}
		else {
			command += tsharkArgs[index];
		}
		command += " ";
	}

	FILE* pipe = ProcessUtil::popenEx(command.c_str(), &analyseTsharkPid);
	if (!pipe) {
		std::cerr << "fail to open file";
		this->workStatus = STATUS_IDLE;
		return false;
	}

	// 先启动存储线程
	analyseStopFlag = false;
	analyseStorageThread = std::make_shared<std::thread>(&TsharkManager::analyseStorageThreadEntry, this);

	char buffer[4096];
	uint32_t file_offset = sizeof(PcapHeader);
	int countPackets = 0;
	while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {

		// 采集的时候过滤额外的信息
		std::string line = buffer;
		if (line.find("Capturing on") != std::string::npos) {
			continue;
		}

		std::shared_ptr<Packet> packet = std::make_shared<Packet>();

		if (!parseLine(buffer, packet)) {
			Logger::LOG_ERROR("解包失败,无效tshark输入:{}", buffer);

			assert(false);
		}

		//计算数据包偏移量
		file_offset += sizeof(PacketHeader);
		packet->file_offset = file_offset;
		file_offset += packet->cap_len;

		//保存数据包
		analyseProcessPacket(packet);

		countPackets += 1;
	}

	Logger::LOG_INFO("静态数据分析完成,数据包数量为{}", countPackets);

	_pclose(pipe);


	// 等待存储线程退出
	analyseStopFlag = true;
	analyseStorageThread->join();
	analyseStorageThread.reset();

	//工作状态恢复
	workStatus = STATUS_IDLE;

	return true;
}

bool TsharkManager::analysePacketEntry(std::string pcapFilePath) {
	return analysisFile(std::move(pcapFilePath));
}


//将静态分析的数据存入字典
void TsharkManager::analyseProcessPacket(std::shared_ptr<Packet> packet) {
	allPackets.insert(std::make_pair<>(packet->frame_number, packet));

	analyseStoreLock.lock();
	analysePacketStored.push_back(packet);
	analyseStoreLock.unlock();

	if (packet->trans_proto == "TCP" || packet->trans_proto == "UDP") {

		// 创建五元组
		FiveTuple tuple{ packet->src_ip, packet->dst_ip, packet->src_port, packet->dst_port, packet->trans_proto };

		// 将数据包加入到相应会话的列表中，并更新统计信息
		std::shared_ptr<Session> session;
		if (sessionMap.find(tuple) == sessionMap.end()) {
			// 新的会话，初始化会话信息
			session = std::make_shared<Session>();
			session->session_id = static_cast<uint32_t>(sessionMap.size()) + 1;        // 通过序号来分配ID
			session->ip1 = packet->src_ip;
			session->ip2 = packet->dst_ip;
			session->ip1_location = packet->src_location;
			session->ip2_location = packet->dst_location;
			session->ip1_port = packet->src_port;
			session->ip2_port = packet->dst_port;
			session->start_time = packet->time;
			session->end_time = packet->time;
			session->trans_proto = packet->trans_proto;
			if (packet->protocol != "TCP" && packet->protocol != "UDP") {
				session->app_proto = packet->protocol;
			}

			sessionMap.insert(std::make_pair(tuple, session));
			sessionIdMap.insert(std::make_pair(session->session_id,session));
		}
		else {
			// 旧的会话，更新会话信息
			session = sessionMap[tuple];
			session->end_time = packet->time;
			if (packet->protocol != "TCP" && packet->protocol != "UDP") {
				session->app_proto = packet->protocol;
			}
		}

		// 共同的字段更新
		{
			session->packet_count++;
			session->total_bytes += packet->len;
			packet->belong_session_id = session->session_id;
		}

		// 统计双方的交互数据
		if (session->ip1 == packet->src_ip) {
			session->ip1_send_packets_count++;
			session->ip1_send_bytes_count += packet->len;
		}
		else {
			session->ip2_send_packets_count++;
			session->ip2_send_bytes_count += packet->len;
		}

		analyseSessionSetTobeStore.insert(session);
	}
}

//-------------------------------------------------流量监控-----------------------------------------------------
//获取所有网卡列表
std::vector<AdapterInfo> TsharkManager::getNetworkAdapters() {
	//过滤掉特殊网卡
	std::set<std::string> specialAdapters = { "sshdump", "ciscodump", "udpdump", "randpkt","wifidump","etwdump","\\\\.\\USBPcap1","\\\\.\\USBPcap2"};

	//枚举到的网卡列表
	std::vector<AdapterInfo> adapters;

	//buffer缓冲区,读取tshark -D每一行输出
	char buffer[256] = { 0 };
	std::string result;

	//启动tshark命令
	std::string command = "\"" + tsharkPath + "\" -D";
	PID_T* tsharkPid = nullptr;
	FILE* pipe = ProcessUtil::popenEx(command,tsharkPid);

	//读取tshark输出
	while (fgets(buffer,256,pipe) != nullptr) {
		result += buffer;
	}

	std::istringstream stream(result);
	std::string line;
	int index = 1;
	while (std::getline(stream, line)) {
		// 通过空格拆分字段
		size_t startPos = line.find(' ');
		if (startPos != std::string::npos) {
			size_t endPos = line.find(' ', startPos + 1);
			std::string interfaceName;
			if (endPos != std::string::npos) {
				interfaceName = line.substr(startPos + 1, endPos - startPos - 1);
			}
			else {
				interfaceName = line.substr(startPos + 1);
			}

			// 滤掉特殊网卡
			if (specialAdapters.find(interfaceName) != specialAdapters.end()) {
				continue;
			}

			AdapterInfo adapterInfo;
			adapterInfo.remark = interfaceName;
			adapterInfo.id = index++;

			// 定位到括号，把括号里面的备注内容提取出来
			if (line.find("(") != std::string::npos && line.find(")") != std::string::npos) {
				adapterInfo.name = line.substr(line.find("(") + 1, line.find(")") - line.find("(") - 1);
			}

			adapters.push_back(adapterInfo);
		}
	}

	_pclose(pipe);

	return adapters;

}

void TsharkManager::startMonitorAdaptersFlowTrend() {

	reset();

	workStatus = STATUS_MONITORING;

	std::unique_lock<std::recursive_mutex> lock(adapterFlowTrendMapLock);

	adapterFlowTrendMonitorStartTime = time(nullptr);

	//获取网卡列表
	std::vector<AdapterInfo> adapterList = getNetworkAdapters();

	//为每一个网卡创建线程
	for (auto adapter:adapterList) {

		adapterFlowTrendMonitorMap.insert(std::make_pair<>(adapter.name, AdapterMonitorInfo()));
		AdapterMonitorInfo& monitorInfo = adapterFlowTrendMonitorMap.at(adapter.name);

		monitorInfo.monitorThread = std::make_shared<std::thread>(&TsharkManager::adapterFlowTrendMonitorThreadEntry, this, adapter.name);
		if (monitorInfo.monitorThread == nullptr) {
			Logger::LOG_ERROR("线程创建失败:{}",adapter.name);
		}
		else {
			Logger::LOG_INFO("监控线程创建成功,网卡名:{},",adapter.name);
		}
	}

}

void TsharkManager::adapterFlowTrendMonitorThreadEntry(std::string adapterName) {

	adapterFlowTrendMapLock.lock();
	if (adapterFlowTrendMonitorMap.find(adapterName) == adapterFlowTrendMonitorMap.end()) {
		adapterFlowTrendMapLock.unlock();
		return;
	}
	adapterFlowTrendMapLock.unlock();

	char buffer[256] = { 0 };
	std::map<time_t, long>& trafficPerSecond = adapterFlowTrendMonitorMap[adapterName].flowThrendData;

	//tshark命令
	std::string tsharkCmd = "\"" + tsharkPath + "\" -i\"" + adapterName + "\" -T fields -e frame.time_epoch -e frame.len";
	Logger::LOG_INFO("启动网卡流量监控{}",tsharkCmd);

	PID_T tsharkPid = 0;
	FILE* pipe = ProcessUtil::popenEx(tsharkCmd.c_str(), &tsharkPid);
	if (!pipe) {
		throw std::runtime_error("Failed to run tshark command!");
	}

	//保存管道
	adapterFlowTrendMapLock.lock();
	adapterFlowTrendMonitorMap[adapterName].monitorTsharkPipe = pipe;
	adapterFlowTrendMonitorMap[adapterName].tsharkPid = tsharkPid;
	adapterFlowTrendMapLock.unlock();

	//逐行读取tshark输出
	while (fgets(buffer,256,pipe) != nullptr) {
		std::string line(buffer);
		std::istringstream iss(line);
		std::string timestampStr, lengthStr;

		if (line.find("Capturing") != std::string::npos || line.find("captured") != std::string::npos) {
			continue;
		}

		//解析每行的时间和数据包长度
		if (!(iss >> timestampStr >> lengthStr)) {
			continue;
		}

		try {
			// 转换时间戳为long类型，秒数部分
			long timestamp = static_cast<long>(std::stod(timestampStr));

			// 转换数据包长度为long类型
			long packetLength = std::stol(lengthStr);

			// 每秒的字节数累加
			trafficPerSecond[timestamp] += packetLength;

			//超过300秒的部分删除
			while (trafficPerSecond.size() > 300) {
				auto it = trafficPerSecond.begin();
				trafficPerSecond.erase(it);
			}

		}
		catch (const std::exception& e){
			Logger::LOG_ERROR("Error parsing line:{},{}",line,e.what());
		}
	}

	Logger::LOG_INFO("adapterFlowTrendMonitorThreadEntry 已结束");

}

void TsharkManager::stopMonitorAdaptersFlowTread() {
	std::unique_lock<std::recursive_mutex> lock(adapterFlowTrendMapLock);

	// 先杀死对应的tshark进程
	for (auto adapterPipePair : adapterFlowTrendMonitorMap) {
		if (adapterPipePair.second.tsharkPid != 0) {
			ProcessUtil::kill(adapterPipePair.second.tsharkPid);
		}
	}

	// 然后关闭管道
	for (auto adapterPipePair : adapterFlowTrendMonitorMap) {

		// 然后关闭管道
		if (adapterPipePair.second.monitorTsharkPipe != nullptr) {
			_pclose(adapterPipePair.second.monitorTsharkPipe);
		}

		// 最后等待对应线程退出
		if (adapterPipePair.second.monitorThread && adapterPipePair.second.monitorThread->joinable()) {
			adapterPipePair.second.monitorThread->join();
		}

		Logger::LOG_INFO("网卡{}已停止流量监控",adapterPipePair.first);
	}

	// 清空记录的流量趋势数据
	adapterFlowTrendMonitorMap.clear();

	//恢复状态
	workStatus = STATUS_IDLE;
}

void TsharkManager::getAdaptersFlowTrendData(std::map<std::string,std::map<time_t,long>>& flowTrendData) {
	time_t timeNow = time(nullptr);
	time_t startWindow = timeNow - adapterFlowTrendMonitorStartTime > 300 ? timeNow - 300 : adapterFlowTrendMonitorStartTime;
	time_t endWindow = timeNow - adapterFlowTrendMonitorStartTime > 300 ? timeNow : adapterFlowTrendMonitorStartTime + 300;

	adapterFlowTrendMapLock.lock();
	for (auto adapterPipePair : adapterFlowTrendMonitorMap) {
		flowTrendData.insert(std::make_pair<>(adapterPipePair.first,std::map<time_t,long>()));

		//从当前时间向前推300秒
		for (time_t t = startWindow; t < endWindow; t++) {
			if (adapterPipePair.second.flowThrendData.find(t) != adapterPipePair.second.flowThrendData.end()) {
				flowTrendData[adapterPipePair.first][t] = adapterPipePair.second.flowThrendData.at(t);
			}
			else {
				flowTrendData[adapterPipePair.first][t] = 0;
			}
		}
	}
	adapterFlowTrendMapLock.unlock();

}


//------------------------------------在线抓包数据库存储-----------------------------------------
//动态存储线程入口函数
void TsharkManager::captureStorageThreadEntry() {

	auto storageWork = [this]() {

		captureStoreLock.lock();

		if (!capturePacketStored.empty()) {
			storage->storePackets(capturePacketStored);
			capturePacketStored.clear();
		}

		// 检查会话列表是否有新的数据可供存储
		if (!captureSessionSetTobeStore.empty()) {
			storage->storeAndUpdateSessions(captureSessionSetTobeStore);
			captureSessionSetTobeStore.clear();
		}

		captureStoreLock.unlock();
	};

	

	//只要在线抓包函数没有停止,需要一直存储
	while (!captureStopFlag) {
		storageWork();
		std::this_thread::sleep_for(std::chrono::milliseconds(100));
	}

	//在线抓包函数停止后,再存储一遍
	std::this_thread::sleep_for(std::chrono::milliseconds(1));
	storageWork();
}

//静态存储线程入口函数
void TsharkManager::analyseStorageThreadEntry() {

	auto storageWork = [this]() {

		analyseStoreLock.lock();

		if (!analysePacketStored.empty()) {
			storage->storePackets(analysePacketStored);
			analysePacketStored.clear();
		}
		// 检查会话列表是否有新的数据可供存储
		if (!analyseSessionSetTobeStore.empty()) {
			storage->storeAndUpdateSessions(analyseSessionSetTobeStore);
			analyseSessionSetTobeStore.clear();
		}

		analyseStoreLock.unlock();
		};

	//只要在线抓包函数没有停止,需要一直存储
	while (!analyseStopFlag) {
		storageWork();
		std::this_thread::sleep_for(std::chrono::milliseconds(100));
	}

	//在线抓包函数停止后,再存储一遍
	std::this_thread::sleep_for(std::chrono::milliseconds(1));
	storageWork();
}

//------------------------------------------网络接口调用-------------------------------------------
void TsharkManager::query(QueryCondition &queryCondition,std::vector<std::shared_ptr<Packet>> &allPackets,int& total) {
	storage->queryPackets(queryCondition,allPackets,total);
}

void TsharkManager::getIPStatsList(QueryCondition& conditions, std::vector<std::shared_ptr<IPStatsInfo>>& ipStatsList, int total) {
	storage->queryIPStats(conditions,ipStatsList,total);
}

bool TsharkManager::savePacket(std::string savePath) {
	if (currentFilePath.empty() || savePath.empty()) {
		return false;
	}
	return MiscUtil::copyFile(currentFilePath, savePath);
}

bool TsharkManager::savePaket(std::string savePath) {
	return savePacket(std::move(savePath));
}

//------------------------------------------工作状态-----------------------------------------------
WORK_STATUS TsharkManager::getWorkStatus() {
	std::unique_lock<std::recursive_mutex> lock(workStatusLock);
	return workStatus;
}

//重置
void TsharkManager::reset() {

	Logger::LOG_INFO("开始重置");

	// 如果还在抓包或者分析文件，将其停止
	if (workStatus == STATUS_CAPTURING) {
		stopCapture();
	}
	else if (workStatus == STATUS_MONITORING) {
		stopMonitorAdaptersFlowTread();
	}

	workStatus = STATUS_IDLE;
	captureTsharkPid = 0;
	captureStopFlag = true;

	analyseTsharkPid = 0;
	analyseStopFlag = true;

	//动态分析的相关数据清空
	allPackets.clear();
	capturePacketStored.clear();
	captureSessionSetTobeStore.clear();
	sessionMap.clear();
	sessionIdMap.clear();
	
	//静态分析的相关数据清空
	analysePacketStored.clear();
	analyseSessionSetTobeStore.clear();

	//停止静态分析线程
	if (analysePacketThread) {
		analysePacketThread->join();
		analysePacketThread.reset();
	}
	// 停止动态分析线程
	if (capturePacketThread) {
		capturePacketThread->join();
		capturePacketThread.reset();
	}
	// 停止动态存储线程
	if (captureStorageThread) {
		captureStorageThread->join();
		captureStorageThread.reset();
	}
	// 停止静态存储线程
	if (analyseStorageThread) {
		analyseStorageThread->join();
		analyseStorageThread.reset();
	}

	
	// 重置数据库
	storage.reset();    // 析构旧的对象，关闭旧数据库文件的占用
	std::string dbFullPath = this->workDir + "/myPacketDatabase.db";
	remove(dbFullPath.c_str());
	storage = std::make_shared<TsharkDatabase>(dbFullPath);
}

//-------------------------------------会话-------------------------

void TsharkManager::printAllSessions() {
	for (auto& item : sessionMap) {
		rapidjson::Document doc(kObjectType);
		item.second->toJsonObj(doc, doc.GetAllocator());

		// 序列化为 JSON 字符串
		rapidjson::StringBuffer buffer;
		rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
		doc.Accept(writer);

		// 打印JSON输出
		std::cout << buffer.GetString() << std::endl;
	}
}

void TsharkManager::querySessions(QueryCondition& condition, std::vector<std::shared_ptr<Session>>& sessionList,int& total) {
	storage->querySessions(condition, sessionList,total);
}

DataStreamCountInfo TsharkManager::getSessionDataStream(uint32_t sessionId, std::vector<DataStreamItem>& dataStreamList) {
	
	DataStreamCountInfo countInfo;
	if (sessionIdMap.find(sessionId) == sessionIdMap.end()) {
		Logger::LOG_ERROR("session {} not foumd", sessionId);
		return countInfo;
	}

	//开始拼接命令
	std::shared_ptr<Session> session = sessionIdMap[sessionId];
	std::string transProto = session->trans_proto;

	//转为小写
	std::transform(transProto.begin(), transProto.end(), transProto.begin(), ::tolower);

	//四元组
	std::string fourTuple;
	if (session->ip1.find(":") != std::string::npos) {
		//ipv6用[]包裹起来
		fourTuple = "[" + session->ip1 + "]:" + std::to_string(session->ip1_port) + ",[" + session->ip2 + "]:" + std::to_string(session->ip2_port);
	}
	else {
		fourTuple = session->ip1 + ":" + std::to_string(session->ip1_port) + "," + session->ip2 + ":" + std::to_string(session->ip2_port);
	}

	std::string tsharkCmd = "\"" + tsharkPath + "\" -r \"" + currentFilePath + "\" -q -z follow," + transProto + ",raw," + fourTuple;
	std::unique_ptr<FILE, decltype(&_pclose)> pipe(ProcessUtil::popenEx(tsharkCmd.c_str()), _pclose);
	if (!pipe) {
		throw std::runtime_error("Failed to run tshark command!");
	}

	uint32_t maxItems = 500;

	//逐行读取tshark输出
	std::vector<char> buffer(66535);
	bool dataStart = false;
	while (fgets(buffer.data(), static_cast<int>(buffer.size()),pipe.get() ) != nullptr) {

		std::string line(buffer.data());
		DataStreamItem item;

		MiscUtil::trimEnd(line);
		if (line.find("Node 0: ") == 0) {
			countInfo.node0 = line.substr(strlen("Node 0: "));
			continue;
		}
		if (line.find("Node 1: ") == 0) {
			countInfo.node1 = line.substr(strlen("Node 1: "));
			dataStart = true;
			continue;
		}
		if (!dataStart || line.find("====") != std::string::npos) {
			continue;
		}

		if (line[0] == '\t') {
			item.hexData = line.substr(1);
			item.srcNode = countInfo.node1;
			item.dstNode = countInfo.node0;
			countInfo.node1PacketCount++;
			countInfo.node1BytesCount += (item.hexData.length() / 2);
		}
		else {
			item.hexData = line;
			item.srcNode = countInfo.node0;
			item.dstNode = countInfo.node1;
			countInfo.node0PacketCount++;
			countInfo.node0BytesCount += (item.hexData.length() / 2);
		}

		countInfo.totalPacketCount++;
		if (dataStreamList.size() < maxItems) {
			dataStreamList.push_back(item);
		}
	}
	return countInfo;
}
