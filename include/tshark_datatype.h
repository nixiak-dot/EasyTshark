#pragma once
#include<iostream>
#include<cstdio>
#include<cstdlib>
#include<cstring>
#include<vector>
#include<map>
#include<thread>
#include <set>
#include<windows.h>

#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"
#include "MiscUtil.h"

typedef DWORD PID_T;

class BaseDataObject {
public:
    // 将对象转换为JSON Value，用于转换为JSON格式输出
    virtual void toJsonObj(rapidjson::Value& obj, rapidjson::Document::AllocatorType& allocator) const = 0;
};

class Packet :public BaseDataObject{
public:
    int frame_number;   //数据包编号
    double time;   //数据包时间戳
    uint32_t len;   //数据包原始长度
    uint32_t cap_len;   //数据包捕获长度
    std::string src_mac;    //数据包源mac
    std::string dst_mac;    //数据包目的mac
    std::string src_ip; //数据包源ip
    std::string src_location;   //数据包源ip地区
    uint16_t src_port;   //数据包TCP源端口
    std::string dst_ip; //数据包目的ip
    std::string dst_location;   //数据包目的ip地区
    uint16_t dst_port;   //数据包目的端口
    std::string trans_proto;    //传输层协议
    std::string protocol;   //数据报协议
    std::string info;   //数据包概要信息
    uint32_t file_offset;   //数据包偏移量
    uint32_t belong_session_id;    //会话ID

    void toJsonObj(rapidjson::Value& dataObj, rapidjson::Document::AllocatorType& allocator) const {

        dataObj.AddMember("frame_number", frame_number, allocator);
        dataObj.AddMember("timestamp", time, allocator);
        dataObj.AddMember("src_mac", rapidjson::Value(src_mac.c_str(), allocator), allocator);
        dataObj.AddMember("dst_mac", rapidjson::Value(dst_mac.c_str(), allocator), allocator);
        dataObj.AddMember("src_ip", rapidjson::Value(src_ip.c_str(), allocator), allocator);
        dataObj.AddMember("src_location", rapidjson::Value(src_location.c_str(), allocator), allocator);
        dataObj.AddMember("src_port", src_port, allocator);
        dataObj.AddMember("dst_ip", rapidjson::Value(dst_ip.c_str(), allocator), allocator);
        dataObj.AddMember("dst_location", rapidjson::Value(dst_location.c_str(), allocator), allocator);
        dataObj.AddMember("dst_port", dst_port, allocator);
        dataObj.AddMember("len", len, allocator);
        dataObj.AddMember("cap_len", cap_len, allocator);
        dataObj.AddMember("protocol", rapidjson::Value(protocol.c_str(), allocator), allocator);
        dataObj.AddMember("info", rapidjson::Value(info.c_str(), allocator), allocator);
        dataObj.AddMember("file_offset", file_offset, allocator);
        dataObj.AddMember("session_id", belong_session_id, allocator);
    }
};

class Session : public BaseDataObject{
public:
    uint32_t session_id;
    std::string ip1;
    uint16_t ip1_port;
    std::string ip1_location;
    std::string ip2;
    uint16_t ip2_port;
    std::string ip2_location;
    std::string trans_proto;
    std::string app_proto;
    double start_time;
    double end_time;
    uint32_t ip1_send_packets_count;   // ip1发送的数据包数
    uint32_t ip1_send_bytes_count;     // ip1发送的字节数
    uint32_t ip2_send_packets_count;   // ip2发送的数据包数
    uint32_t ip2_send_bytes_count;     // ip2发送的字节数
    uint32_t packet_count;           // 数据包数量
    uint32_t total_bytes;            // 总字节数

    void toJsonObj(rapidjson::Value& obj, rapidjson::Document::AllocatorType& allocator) const {
        obj.AddMember("session_id", session_id, allocator);
        obj.AddMember("ip1", rapidjson::Value(ip1.c_str(), allocator), allocator);
        obj.AddMember("ip1_port", ip1_port, allocator);
        obj.AddMember("ip1_location", rapidjson::Value(ip1_location.c_str(), allocator), allocator);
        obj.AddMember("ip2", rapidjson::Value(ip2.c_str(), allocator), allocator);
        obj.AddMember("ip2_port", ip2_port, allocator);
        obj.AddMember("ip2_location", rapidjson::Value(ip2_location.c_str(), allocator), allocator);
        obj.AddMember("trans_proto", rapidjson::Value(trans_proto.c_str(), allocator), allocator);
        obj.AddMember("app_proto", rapidjson::Value(app_proto.c_str(), allocator), allocator);
        obj.AddMember("start_time", start_time, allocator);
        obj.AddMember("end_time", end_time, allocator);
        obj.AddMember("ip1_send_packets_count", ip1_send_packets_count, allocator);
        obj.AddMember("ip1_send_bytes_count", ip1_send_bytes_count, allocator);
        obj.AddMember("ip2_send_packets_count", ip2_send_packets_count, allocator);
        obj.AddMember("ip2_send_bytes_count", ip2_send_bytes_count, allocator);
        obj.AddMember("packet_count", packet_count, allocator);
        obj.AddMember("total_bytes", total_bytes, allocator);
    }
};

class DataStreamItem : public BaseDataObject {
public:
    std::string hexData;
    std::string srcNode;
    std::string dstNode;

    virtual void toJsonObj(rapidjson::Value& obj,rapidjson::Document::AllocatorType& allocator) const {
        obj.AddMember("hexData",rapidjson::Value(hexData.c_str(),allocator),allocator);
        obj.AddMember("srcNode", rapidjson::Value(srcNode.c_str(), allocator), allocator);
        obj.AddMember("dstNode", rapidjson::Value(dstNode.c_str(), allocator), allocator);
    }
};

class DataStreamCountInfo : public BaseDataObject {
public:
    uint32_t totalPacketCount = 0;
    std::string node0;
    uint32_t node0PacketCount = 0;
    uint64_t node0BytesCount = 0;
    std::string node1;
    uint32_t node1PacketCount = 0;
    uint64_t node1BytesCount = 0;

    virtual void toJsonObj(rapidjson::Value& obj,rapidjson::Document::AllocatorType& allocator) const {
        obj.AddMember("totalPacketCount", totalPacketCount ,allocator);
        obj.AddMember("node0", rapidjson::Value(node0.c_str(), allocator), allocator);
        obj.AddMember("node0PacketCount", node0PacketCount ,allocator);
        obj.AddMember("node0BytesCount", node0BytesCount ,allocator);
        obj.AddMember("node1", rapidjson::Value(node1.c_str(), allocator), allocator);
        obj.AddMember("node1PacketCount", node1PacketCount,allocator);
        obj.AddMember("node1BytesCount", node1BytesCount,allocator);
    }
};

class IPStatsInfo :public BaseDataObject {
public:
    std::string ip;
    std::string location;
    double earliest_time = 0.0;
    double latest_time = 0.0;
    std::set<int> ports;
    std::set<std::string> protocols;    //通信协议集合

    //数据统计
    int total_sent_packets = 0;
    int total_recv_packets = 0;
    int total_sent_bytes = 0;
    int total_recv_bytes = 0;
    int tcp_session_count = 0;
    int udp_session_count = 0;

    virtual void toJsonObj(rapidjson::Value& obj,rapidjson::Document::AllocatorType& allocator) const {
        obj.AddMember("ip", rapidjson::Value(ip.c_str(), allocator), allocator);
        obj.AddMember("location", rapidjson::Value(location.c_str(), allocator), allocator);
        std::string s_protocols = MiscUtil::convertSetToString(protocols, ',');
        obj.AddMember("proto", rapidjson::Value(s_protocols.c_str(), allocator), allocator);

        rapidjson::Value portsValue;
        portsValue.SetArray();
        for (auto port : ports) {
            portsValue.PushBack(rapidjson::Value(port), allocator);
        }
        obj.AddMember("ports", portsValue, allocator);

        obj.AddMember("earliest_time", earliest_time, allocator);
        obj.AddMember("latest_time", latest_time, allocator);
        obj.AddMember("total_sent_packets", total_sent_packets, allocator);
        obj.AddMember("total_recv_packets", total_recv_packets, allocator);
        obj.AddMember("total_sent_bytes", total_sent_bytes, allocator);
        obj.AddMember("total_recv_bytes", total_recv_bytes, allocator);
        obj.AddMember("tcp_session_count", tcp_session_count, allocator);
        obj.AddMember("udp_session_count", udp_session_count, allocator);
    }
};

//定义会话五元组
class FiveTuple {
public:
    std::string src_ip;
    std::string dst_ip;
    uint16_t src_port;
    uint16_t dst_port;
    std::string trans_proto;

    //运算符重载,确保会话对称性
    bool operator==(const FiveTuple& other) const {
        return (src_ip == other.src_ip && dst_ip == other.dst_ip && src_port == other.src_port && dst_port == other.dst_port ) || 
            (src_ip == other.dst_ip && dst_ip == other.src_ip && src_port == other.dst_port && dst_port == other.src_port ) && 
            (trans_proto == other.trans_proto);
    }
};

class FiveTupleHash {
public:
    std::size_t operator()(const FiveTuple& tuple) const {
        std::hash<std::string> hashFn;
        std::size_t h1 = hashFn(tuple.src_ip);
        std::size_t h2 = hashFn(tuple.dst_ip);
        std::size_t h3 = std::hash<uint16_t>()(tuple.src_port);
        std::size_t h4 = std::hash<uint16_t>()(tuple.dst_port);

        // 返回源和目的地址/端口的哈希组合，支持对称性
        std::size_t directHash = h1 ^ (h2 << 1) ^ (h3 << 2) ^ (h4 << 3);
        std::size_t reverseHash = h2 ^ (h1 << 1) ^ (h4 << 2) ^ (h3 << 3);

        // 确保无论是正向还是反向，都会返回相同的哈希值
        return directHash ^ reverseHash ^ tuple.trans_proto[0];
    }
};

//pcap全局文件头·
struct PcapHeader {
    uint32_t magic_number;  //识别文件格式，标识字节序
    uint16_t version_major;     //主版本号
    uint16_t version_minor;     //次版本号
    int32_t thiszone;   //时区偏移
    uint32_t sigfigs;   //时间戳精度
    uint32_t snaplen;   //捕获到的数据包最大长度
    uint32_t network;   //链路层类型
};

//数据包头
struct PacketHeader {
    uint32_t timestamp_second;
    uint32_t timestamp_Microsecond;
    uint32_t caplen;    //数据包捕获长度
    uint32_t orilen;    //数据包原始长度
};

//网卡
struct AdapterInfo {
    int id;
    std::string name;
    std::string remark;
};

class AdapterMonitorInfo {
public:
    AdapterMonitorInfo() {
        monitorTsharkPipe = nullptr;
        tsharkPid = 0;
    }

    std::string adapterName;
    std::map<time_t, long> flowThrendData;
    std::shared_ptr<std::thread> monitorThread;
    FILE* monitorTsharkPipe;
    PID_T tsharkPid;
};
