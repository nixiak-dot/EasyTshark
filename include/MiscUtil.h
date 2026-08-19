#pragma once
#include <random>
#include <string>
#include<fstream>
#include<sstream>
#include <chrono>
#include <ctime>
#include <iomanip>
#include <filesystem>
#ifdef _WIN32
#include <windows.h>
#endif
#include <rapidxml/rapidxml.hpp>
#include <rapidjson/document.h>
#include <rapidjson/writer.h>
#include <rapidjson/prettywriter.h>
#include <rapidjson/stringbuffer.h>

using namespace rapidxml;
using namespace rapidjson;

class MiscUtil {
public:
	static std::string getPcapNameByCurrentTimestamp() {
		auto now = std::chrono::system_clock::now();
		const std::time_t time = std::chrono::system_clock::to_time_t(now);
		std::tm localTime{};
#ifdef _WIN32
		localtime_s(&localTime, &time);
#else
		localtime_r(&time, &localTime);
#endif
		std::ostringstream name;
		name << "analysis_" << std::put_time(&localTime, "%Y%m%d%H%M%S")
			<< "_" << getRandomString(6) << ".pcap";
		return name.str();
	}

	static std::string getRandomString(size_t length) {
		const std::string chars = "abdcefghijklmnopqrstuvwxyz"
			"ABCDEFGHIJKLMNOPQRSTUVWXYZ"
			"0123456789";
		std::random_device rd;//随机数种子
		std::mt19937 generator(rd());//随机数生成器
		std::uniform_int_distribution<size_t> distribution(0,chars.size() - 1);//定义随机数范围

		//生成随机字符串
		std::string randomString;
		for (size_t i = 0; i < length; ++i) {
			randomString += chars[distribution(generator)];
		}

		return randomString;


	}

    // 将XML转为JSON格式
    static bool xml2JSON(std::string xmlContent, Document& outJsonDoc) {

        // 解析 XML
        xml_document<> doc;
        try {
            doc.parse<0>(&xmlContent[0]);
        }
        catch (const rapidxml::parse_error& e) {
            std::cout << "XML Parsing error: " << e.what() << std::endl;
            return false;
        }

        // 创建 JSON 文档
        outJsonDoc.SetObject();
        Document::AllocatorType& allocator = outJsonDoc.GetAllocator();

        // 获取 XML 根节点
        xml_node<>* root = doc.first_node();
        if (root) {
            // 将根节点转换为 JSON
            Value root_json(kObjectType);
            xml_to_json_recursive(root_json, root, allocator);

            // 将根节点添加到 JSON 文档
            outJsonDoc.AddMember(Value(root->name(), allocator).Move(), root_json, allocator);
        }
        return true;
    }

    static void trimEnd(std::string& str) {
        if (str.size() >= 2 && str.substr(str.size() - 2) == "\r\n") {
            str.erase(str.size() - 2);  // 删除末尾的 \r\n
        }
        else if (!str.empty() && str.back() == '\n') {
            str.erase(str.size() - 1);  // 删除末尾的 \n
        }
    }

    // 简单的字符串分割函数，用于将"1,2,3"之类的字符串分割为set
    static std::set<std::string> splitString(const std::string& str, char delim) {
        std::set<std::string> result;
        std::istringstream iss(str);
        std::string token;
        while (std::getline(iss, token, delim)) {
            if (!token.empty()) {
                result.insert(token);
            }
        }
        return result;
    }

    // 简单的字符串分割函数，用于将"1,2,3"之类的字符串分割为vector
    static std::vector<std::string> splitStringToVector(const std::string& str, char delim) {
        std::vector<std::string> result;
        std::istringstream iss(str);
        std::string token;
        while (std::getline(iss, token, delim)) {
            if (!token.empty()) {
                result.push_back(token);
            }
        }
        return result;
    }

    // 将分割后的string set转换为int set（用于端口列表）
    static std::set<int> toIntVector(const std::set<std::string>& strs) {
        std::set<int> ints;
        for (auto& s : strs) {
            try {
                ints.insert(std::stoi(s));
            }
            catch (...) {
                // 如果转换失败，可选择忽略或打印错误信息
            }
        }
        return ints;
    }

    static std::string convertSetToString(std::set<std::string> dataSets, char delim) {

        std::string result;
        for (auto item : dataSets) {
            if (result.empty()) {
                result = item;
            }
            else {
                result = result + delim + item;
            }
        }
        return result;
    }

    static bool copyFile(const std::string& source, const std::string& destination) {
		try {
			const std::filesystem::path destinationPath(destination);
			if (destinationPath.has_parent_path()) {
				std::filesystem::create_directories(destinationPath.parent_path());
			}
#ifdef _WIN32
			return CopyFileA(source.c_str(), destination.c_str(), FALSE) != FALSE;
#else
			std::filesystem::copy_file(source, destination,
				std::filesystem::copy_options::overwrite_existing);
			return true;
#endif
		}
		catch (...) {
			return false;
		}
    }
private:
    // 私有函数，转换过程中需要递归处理子节点
    static void xml_to_json_recursive(Value& json, xml_node<>* node, Document::AllocatorType& allocator) {
        for (xml_node<>* cur_node = node->first_node(); cur_node; cur_node = cur_node->next_sibling()) {

            // 检查是否需要跳过节点
            xml_attribute<>* hide_attr = cur_node->first_attribute("hide");
            if (hide_attr && std::string(hide_attr->value()) == "yes") {
                continue;  // 如果 hide 属性值为 "true"，跳过该节点
            }

            // 检查是否已经有该节点名称的数组
            Value* array = nullptr;
            if (json.HasMember(cur_node->name())) {
                array = &json[cur_node->name()];
            }
            else {
                Value node_array(kArrayType); // 创建新的数组
                json.AddMember(Value(cur_node->name(), allocator).Move(), node_array, allocator);
                array = &json[cur_node->name()];
            }

            // 创建一个 JSON 对象代表当前节点
            Value child_json(kObjectType);

            // 处理节点的属性
            for (xml_attribute<>* attr = cur_node->first_attribute(); attr; attr = attr->next_attribute()) {
                Value attr_name(attr->name(), allocator);
                Value attr_value(attr->value(), allocator);
                child_json.AddMember(attr_name, attr_value, allocator);
            }

            // 递归处理子节点
            xml_to_json_recursive(child_json, cur_node, allocator);

            // 将当前节点对象添加到对应数组中
            array->PushBack(child_json, allocator);
        }
    }

};
