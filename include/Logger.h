#pragma once

#include <memory>
#include <string>
#include <Windows.h>
#include "spdlog/spdlog.h"
#include "spdlog/sinks/basic_file_sink.h"

#define LOG_INFO(...)     Logger::get()->info(__VA_ARGS__)
#define LOG_WARN(...)     Logger::get()->warn(__VA_ARGS__)
#define LOG_ERROR(...)    Logger::get()->error(__VA_ARGS__)
#define LOG_CRITICAL(...) Logger::get()->critical(__VA_ARGS__)

class Logger
{
public:
    static void init(const std::string& logFile = "logs/log.txt");

    static std::shared_ptr<spdlog::logger> get();

    static void shutdown();

private:
    static std::shared_ptr<spdlog::logger> logger_;
};