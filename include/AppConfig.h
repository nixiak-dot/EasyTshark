#pragma once
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#include <chrono>
#include <stdexcept>
#include <cstdlib>
#ifdef _WIN32
#include <windows.h>
#endif
#include "rapidjson/document.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"

struct AppPaths {
    std::string tsharkPath;
    std::string editcapPath;
    std::string pcapDirectory;
    std::string tlsKeyLogPath;
    std::vector<std::string> trendAdapterNames;
};

class AppConfig {
public:
    explicit AppConfig(const std::string& executableDirectory) {
        auto directory = std::filesystem::absolute(std::filesystem::u8path(executableDirectory));
        const auto fallback = directory;
#ifdef _WIN32
        const auto dataDirectory = _wgetenv(L"EASYTSHARK_DATA_DIR");
#else
        const auto dataDirectory = std::getenv("EASYTSHARK_DATA_DIR");
#endif
        if (dataDirectory != nullptr && dataDirectory[0] != 0) {
            directory = std::filesystem::path(dataDirectory);
            if (!directory.is_absolute()) throw std::invalid_argument("EASYTSHARK_DATA_DIR must be absolute");
        } else {
            while (!std::filesystem::exists(directory / "EasyTshark.sln")
                && !std::filesystem::is_directory(directory / "tshark-front")) {
                const auto parent = directory.parent_path();
                if (parent == directory) {
                    directory = fallback;
                    break;
                }
                directory = parent;
            }
        }
        filePath = directory / "config" / "settings.json";
        paths.pcapDirectory = (directory / "pcap").u8string();
        load();
    }

    static bool readPaths(const rapidjson::Value& input, AppPaths& values, std::string& error) {
        if (!input.IsObject()) {
            error = "配置必须为 JSON 对象";
            return false;
        }
        const char* names[] = { "tsharkPath", "editcapPath", "pcapDirectory", "tlsKeyLogPath" };
        std::string* targets[] = { &values.tsharkPath, &values.editcapPath,
            &values.pcapDirectory, &values.tlsKeyLogPath };
        for (size_t index = 0; index < 4; ++index) {
            if (!input.HasMember(names[index])) {
                if (index == 3) {
                    targets[index]->clear();
                    continue;
                }
                error = std::string("缺少配置项：") + names[index];
                return false;
            }
            const auto& value = input[names[index]];
            if (!value.IsString()) {
                error = std::string("路径必须为字符串：") + names[index];
                return false;
            }
            targets[index]->assign(value.GetString(), value.GetStringLength());
        }
        if (input.HasMember("trendAdapterNames")) {
            if (!input["trendAdapterNames"].IsArray()) {
                error = "trendAdapterNames must be an array";
                return false;
            }
            values.trendAdapterNames.clear();
            for (const auto& adapterName : input["trendAdapterNames"].GetArray()) {
                if (!adapterName.IsString() || adapterName.GetStringLength() == 0) {
                    error = "Invalid trend adapter name";
                    return false;
                }
                values.trendAdapterNames.emplace_back(adapterName.GetString(), adapterName.GetStringLength());
            }
        }
        return true;
    }

    static bool validate(const AppPaths& values, std::string& error, bool prepareDirectory = false) {
        try {
            const std::string* allPaths[] = { &values.tsharkPath, &values.editcapPath,
                &values.pcapDirectory, &values.tlsKeyLogPath };
            for (size_t index = 0; index < 4; ++index) {
                const auto& value = *allPaths[index];
                if (index == 3 && value.empty()) continue;
                if (value.empty() || value.find_first_of("\r\n\"") != std::string::npos
                    || value.find('\0') != std::string::npos
                    || !std::filesystem::u8path(value).is_absolute()) {
                    error = "请填写不含引号或换行的完整绝对路径";
                    return false;
                }
            }
            if (!std::filesystem::is_regular_file(std::filesystem::u8path(values.tsharkPath))) {
                error = "TShark 可执行文件不存在";
                return false;
            }
            if (!std::filesystem::is_regular_file(std::filesystem::u8path(values.editcapPath))) {
                error = "Editcap 可执行文件不存在";
                return false;
            }
            const auto pcapDirectory = std::filesystem::u8path(values.pcapDirectory);
            if (prepareDirectory) std::filesystem::create_directories(pcapDirectory);
            if (!std::filesystem::is_directory(pcapDirectory)) {
                error = "抓包保存目录不存在或不是文件夹";
                return false;
            }
            if (!values.tlsKeyLogPath.empty()) {
                const auto keyPath = std::filesystem::u8path(values.tlsKeyLogPath);
                if (!std::filesystem::is_directory(keyPath.parent_path())
                    || (std::filesystem::exists(keyPath) && !std::filesystem::is_regular_file(keyPath))) {
                    error = "密钥日志路径必须指向文件，且父目录必须存在";
                    return false;
                }
            }
            if (prepareDirectory) {
                const auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
                const auto probe = pcapDirectory / (".easytshark-write-test-" + std::to_string(stamp));
                std::ofstream output(probe, std::ios::binary);
                if (!output) {
                    error = "抓包保存目录不可写";
                    return false;
                }
                output.close();
                std::filesystem::remove(probe);
            }
            return true;
        }
        catch (const std::exception&) {
            error = "无法访问配置的路径，请检查文件类型及读写权限";
            return false;
        }
    }

    bool configured() const {
        std::string error;
        std::error_code statusError;
        return loaded && std::filesystem::is_regular_file(filePath, statusError) && validate(paths, error);
    }

    void toJson(rapidjson::Document& document) const {
        document.SetObject();
        auto& allocator = document.GetAllocator();
        rapidjson::Value values(rapidjson::kObjectType);
        writePaths(values, paths, allocator);
        document.AddMember("values", values, allocator);
        document.AddMember("configured", configured(), allocator);
        document.AddMember("configPath", rapidjson::Value(filePath.u8string().c_str(), allocator).Move(), allocator);
        rapidjson::Value errors(rapidjson::kArrayType);
        std::string error;
        if (!loadError.empty()) errors.PushBack(rapidjson::Value(loadError.c_str(), allocator).Move(), allocator);
        if (!validate(paths, error)) errors.PushBack(rapidjson::Value(error.c_str(), allocator).Move(), allocator);
        document.AddMember("errors", errors, allocator);
    }

    bool save(const AppPaths& values, std::string& error) {
        if (!validate(values, error, true)) return false;
        auto temporary = filePath;
        temporary += ".tmp";
        try {
            std::filesystem::create_directories(filePath.parent_path());
            rapidjson::Document document(rapidjson::kObjectType);
            writePaths(document, values, document.GetAllocator());
            rapidjson::StringBuffer buffer;
            rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
            document.Accept(writer);
            std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
            output.write(buffer.GetString(), buffer.GetSize());
            output.close();
            if (!output) throw std::runtime_error("write failed");
#ifdef _WIN32
            if (!MoveFileExW(temporary.c_str(), filePath.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
                throw std::runtime_error("replace failed");
            }
#else
            std::filesystem::rename(temporary, filePath);
#endif
            paths = values;
            loaded = true;
            loadError.clear();
            return true;
        }
        catch (const std::exception&) {
            std::error_code ignored;
            std::filesystem::remove(temporary, ignored);
            error = "配置文件保存失败，请检查项目 config 目录的写入权限";
            return false;
        }
    }

    AppPaths paths;

private:
    std::filesystem::path filePath;
    bool loaded = false;
    std::string loadError;

    static void writePaths(rapidjson::Value& document, const AppPaths& values,
        rapidjson::Document::AllocatorType& allocator) {
        document.AddMember("tsharkPath", rapidjson::Value(values.tsharkPath.c_str(), allocator).Move(), allocator);
        document.AddMember("editcapPath", rapidjson::Value(values.editcapPath.c_str(), allocator).Move(), allocator);
        document.AddMember("pcapDirectory", rapidjson::Value(values.pcapDirectory.c_str(), allocator).Move(), allocator);
        document.AddMember("tlsKeyLogPath", rapidjson::Value(values.tlsKeyLogPath.c_str(), allocator).Move(), allocator);
        rapidjson::Value trendAdapterNames(rapidjson::kArrayType);
        for (const auto& adapterName : values.trendAdapterNames) {
            trendAdapterNames.PushBack(rapidjson::Value(adapterName.c_str(), allocator).Move(), allocator);
        }
        document.AddMember("trendAdapterNames", trendAdapterNames, allocator);
    }

    void load() {
        try {
            std::ifstream input(filePath, std::ios::binary);
            if (!input) {
                loadError = "尚未保存路径配置，请完成首次设置";
                return;
            }
            std::string content((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
            rapidjson::Document document;
            AppPaths values;
            if (document.Parse(content.c_str()).HasParseError() || !readPaths(document, values, loadError)) {
                if (loadError.empty()) loadError = "配置文件格式无效，请重新保存设置";
                return;
            }
            paths = values;
            loaded = true;
        }
        catch (const std::exception&) {
            loadError = "无法读取配置文件，请检查访问权限";
        }
    }
};
