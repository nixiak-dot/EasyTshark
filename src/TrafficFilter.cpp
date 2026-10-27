#include "TrafficFilter.h"

namespace {
class FilterParser {
public:
	FilterParser(const std::string& expression, TrafficFilterScope scope, std::vector<TrafficFilterParameter>& parameters)
		: expression_(expression), scope_(scope), parameters_(parameters) {}
	bool parse(std::string& sql, std::string& error);
private:
	std::string parseOr(std::string&);
	std::string parseAnd(std::string&);
	std::string parsePrimary(std::string&);
	std::string parsePredicate(std::string& error);
	std::string readField();
	std::string readOperator();
	bool readValue(std::string& value, std::string& error);
	bool consume(const char* token);
	void skipSpace();
	const std::string& expression_;
	TrafficFilterScope scope_;
	std::vector<TrafficFilterParameter>& parameters_;
	size_t position_ = 0, conditions_ = 0, depth_ = 0;
};
}

bool TrafficFilter::compile(const std::string& expression, TrafficFilterScope scope,
	std::string& sql, std::vector<TrafficFilterParameter>& parameters, std::string& error) {
	sql.clear();
	parameters.clear();
	error.clear();
	if (expression.size() > 4096) { error = "Filter expression is too long"; return false; }
	FilterParser parser(expression, scope, parameters);
	if (!parser.parse(sql, error)) { sql.clear(); parameters.clear(); return false; }
	return true;
}
namespace {
bool FilterParser::parse(std::string& sql, std::string& error) {
	if (expression_.size() > 4096) { error = "Filter expression is too long"; return false; }
	skipSpace();
	if (position_ == expression_.size()) return true;
	sql = parseOr(error);
	skipSpace();
	if (error.empty() && position_ != expression_.size()) error = "Unexpected text in filter expression";
	return error.empty();
}
std::string FilterParser::parseOr(std::string& error) {
	std::string sql = parseAnd(error);
	while (error.empty() && consume("||")) {
		std::string right = parseAnd(error);
		if (error.empty()) sql = "(" + sql + " OR " + right + ")";
	}
	return sql;
}
std::string FilterParser::parseAnd(std::string& error) {
	std::string sql = parsePrimary(error);
	while (error.empty() && consume("&&")) {
		std::string right = parsePrimary(error);
		if (error.empty()) sql = "(" + sql + " AND " + right + ")";
	}
	return sql;
}
std::string FilterParser::parsePrimary(std::string& error) {
	skipSpace();
	if (position_ >= expression_.size() || expression_[position_] != '(') return parsePredicate(error);
	if (++depth_ > 32) { error = "Filter expression nesting is too deep"; return std::string(); }
	++position_;
	std::string sql = parseOr(error);
	--depth_;
	skipSpace();
	if (error.empty() && (position_ >= expression_.size() || expression_[position_] != ')')) error = "Missing closing parenthesis";
	else if (error.empty()) ++position_;
	return "(" + sql + ")";
}
std::string FilterParser::parsePredicate(std::string& error) {
	std::string field = readField();
	std::string operation = readOperator();
	std::string value;
	if (field.empty()) error = "Expected a filter field";
	else if (operation.empty()) error = "Expected '=', '==', or '!=' after filter field";
	else if (!readValue(value, error)) return std::string();
	if (!error.empty()) return std::string();
	if (++conditions_ > 128) { error = "Too many filter conditions"; return std::string(); }
	std::string name;
	for (char character : field) name.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(character))));
	const bool notEqual = operation == "!=";
	const std::string compare = notEqual ? " != ? COLLATE NOCASE" : " = ? COLLATE NOCASE";
	if (name == "proto") {
		if (scope_ == TrafficFilterScope::Packets) {
			parameters_.push_back({ false, value, 0 });
			return std::string("(") + (notEqual ? "COALESCE(protocol, '')" : "protocol") + compare + ")";
		}
		parameters_.push_back({ false, value, 0 });
		parameters_.push_back({ false, value, 0 });
		return std::string("((") + (notEqual ? "COALESCE(app_proto, '')" : "app_proto") + compare +
			(notEqual ? ") AND (COALESCE(trans_proto, '')" : ") OR (trans_proto") + compare + "))";
	}
	const char* column = nullptr;
	if (name == "src.ip") column = scope_ == TrafficFilterScope::Packets ? "src_ip" : "ip1";
	else if (name == "dst.ip") column = scope_ == TrafficFilterScope::Packets ? "dst_ip" : "ip2";
	else if (name == "src.port") column = scope_ == TrafficFilterScope::Packets ? "src_port" : "ip1_port";
	else if (name == "dst.port") column = scope_ == TrafficFilterScope::Packets ? "dst_port" : "ip2_port";
	if (!column) { error = "Unsupported filter field: " + field; return std::string(); }
	if (name == "src.port" || name == "dst.port") {
		unsigned int port = 0;
		if (value.empty()) { error = "Port must be an integer between 0 and 65535"; return std::string(); }
		for (char character : value) {
			if (character < '0' || character > '9') { error = "Port must be an integer between 0 and 65535"; return std::string(); }
			port = port * 10 + static_cast<unsigned int>(character - '0');
			if (port > 65535) { error = "Port must be an integer between 0 and 65535"; return std::string(); }
		}
		parameters_.push_back({ true, std::string(), static_cast<int>(port) });
		return std::string("(") + column + (notEqual ? " != ?)" : " = ?)");
	}
	parameters_.push_back({ false, value, 0 });
	return std::string("(") + column + (notEqual ? " != ? COLLATE NOCASE)" : " = ? COLLATE NOCASE)");
}
std::string FilterParser::readField() {
	skipSpace();
	const size_t start = position_;
	while (position_ < expression_.size()) {
		const char character = expression_[position_];
		if (std::isspace(static_cast<unsigned char>(character)) || character == '=' || character == '!' || character == '(' || character == ')' || character == '&' || character == '|') break;
		++position_;
	}
	return expression_.substr(start, position_ - start);
}
std::string FilterParser::readOperator() {
	skipSpace();
	if (position_ < expression_.size() && expression_[position_] == '!') {
		if (position_ + 1 < expression_.size() && expression_[position_ + 1] == '=') { position_ += 2; return "!="; }
		return std::string();
	}
	if (position_ >= expression_.size() || expression_[position_++] != '=') return std::string();
	if (position_ < expression_.size() && expression_[position_] == '=') ++position_;
	return "=";
}
bool FilterParser::readValue(std::string& value, std::string& error) {
	skipSpace();
	if (position_ >= expression_.size()) { error = "Expected a filter value"; return false; }
	const char quote = expression_[position_];
	if (quote == '\'' || quote == '"') {
		++position_;
		while (position_ < expression_.size()) {
			const char character = expression_[position_++];
			if (character == quote) {
				if (!value.empty()) return true;
				error = "Filter values cannot be empty";
				return false;
			}
			if (character == '\\' && position_ < expression_.size()) value.push_back(expression_[position_++]);
			else value.push_back(character);
		}
		error = "Unterminated quoted filter value";
		return false;
	}
	const size_t start = position_;
	while (position_ < expression_.size()) {
		const char character = expression_[position_];
		if (std::isspace(static_cast<unsigned char>(character)) || character == '(' || character == ')' || character == '&' || character == '|' || character == '=') break;
		++position_;
	}
	if (start == position_) { error = "Expected a filter value"; return false; }
	value = expression_.substr(start, position_ - start);
	return true;
}
bool FilterParser::consume(const char* token) {
	skipSpace();
	const std::string expected(token);
	if (expression_.compare(position_, expected.size(), expected) != 0) return false;
	position_ += expected.size();
	return true;
}
void FilterParser::skipSpace() {
	while (position_ < expression_.size() && std::isspace(static_cast<unsigned char>(expression_[position_]))) ++position_;
}
}
