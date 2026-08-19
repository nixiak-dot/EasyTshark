#include "IP2RegionUtil.h"
#include <fstream>


//类中接口的实现
std::shared_ptr<xdb_search_t> IP2RegionUtil::xdbPtr;

bool IP2RegionUtil::init(const std::string& xdbFilePath) {
	std::ifstream file(xdbFilePath, std::ios::binary);
	if (!file.good()) {
		xdbPtr.reset();
		return false;
	}
	try {
		xdbPtr = std::make_shared<xdb_search_t>(xdbFilePath);
		xdbPtr->init_content();
		return true;
	}
	catch (...) {
		xdbPtr.reset();
		return false;
	}
}

void IP2RegionUtil::uninit() {
    xdbPtr.reset();
}

std::string IP2RegionUtil::getIpLocation(const std::string& ip) {
	if (!xdbPtr) {
		return "";
	}

    //ipv6返回空字符串
    if (ip.size() > 15) {
        return " ";
    }

    std::string location = xdbPtr->search(ip);
    if (!location.empty() && location.find("invalid") == std::string::npos) {
        return parseLocation(location);
    }
    else {
        return "";
    }
}

std::string IP2RegionUtil::parseLocation(const std::string& input) {

    std::vector<std::string> tokens;
    std::string token;
    std::stringstream ss(input);

    if (input.find("内网") != std::string::npos) {
        return "内网";
    }

    while (std::getline(ss, token, '|')) {
        tokens.push_back(token);
    }

    if (tokens.size() > 4) {
        std::string result;
        if (tokens[0].compare("0") != 0) {
            result.append(tokens[0]);
        }
        if (tokens[1].compare("0") != 0) {
            result.append("-" + tokens[1]);
        }
        if (tokens[2].compare("0") != 0) {
            result.append("-" + tokens[2]);
        }
        if (tokens[3].compare("0") != 0) {
            result.append("-" + tokens[3]);
        }

        return result;
    }
    else {
        return input;
    }
}
