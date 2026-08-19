#include "Logger.h"
#include <filesystem>

std::shared_ptr<spdlog::logger> Logger::logger_ = nullptr;

void Logger::init(const std::string& logFile)
{
    if (logger_)
    {
        return;
    }
    const std::filesystem::path path(logFile);
    if (path.has_parent_path()) {
        std::filesystem::create_directories(path.parent_path());
    }

    logger_ = spdlog::basic_logger_mt("EasyTshark", logFile);
    logger_->set_level(spdlog::level::trace);
    logger_->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] %v");
    logger_->flush_on(spdlog::level::info);
}

std::shared_ptr<spdlog::logger> Logger::get()
{
    if (!logger_)
    {
        throw std::runtime_error("Logger has not been initialized.");
    }

    return logger_;
}

void Logger::shutdown()
{
    spdlog::shutdown();
    logger_.reset();
}
