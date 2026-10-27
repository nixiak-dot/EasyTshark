#pragma once
#include <cctype>
#include <cstddef>
#include <string>
#include <vector>

enum class TrafficFilterScope { Packets, Sessions };
struct TrafficFilterParameter { bool integer = false; std::string text; int number = 0; };

class TrafficFilter {
public:
	static bool compile(const std::string& expression, TrafficFilterScope scope,
		std::string& sql, std::vector<TrafficFilterParameter>& parameters, std::string& error);
};
