#include "AppConfig.h"
#include <iostream>

static void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

int main(int argumentCount, char* arguments[]) {
    try {
        require(argumentCount == 2, "missing temporary directory");
        const auto root = std::filesystem::u8path(arguments[1]);
        std::filesystem::create_directories(root / "bin" / "x64");
        std::ofstream(root / "EasyTshark.sln") << "test project";
        std::ofstream(root / "tshark.exe") << "test fixture";
        std::ofstream(root / "editcap.exe") << "test fixture";
        AppConfig missing((root / "bin" / "x64").u8string());
        require(!missing.configured(), "missing file must require configuration");
        require(missing.paths.pcapDirectory == (root / "pcap").u8string(), "development capture directory must default to project root");
        AppPaths paths;
        paths.tsharkPath = (root / "tshark.exe").u8string();
        paths.editcapPath = (root / "editcap.exe").u8string();
        paths.pcapDirectory = (root / std::filesystem::u8path("抓包 空格")).u8string();
        std::string error;
        paths.trendAdapterNames = { "Ethernet", "Wi-Fi" };
        require(missing.save(paths, error), "valid paths must save: " + error);
        require(std::filesystem::is_directory(std::filesystem::u8path(paths.pcapDirectory)), "capture directory must be created");
        require(std::filesystem::is_regular_file(root / "config" / "settings.json"), "settings must live in project root");
        AppConfig reloaded((root / "bin" / "x64").u8string());
        require(reloaded.configured(), "saved settings must reload");
        require(reloaded.paths.pcapDirectory == paths.pcapDirectory, "Unicode and spaces must round trip");
        require(reloaded.paths.tlsKeyLogPath.empty(), "key log is optional");
        require(reloaded.paths.trendAdapterNames == paths.trendAdapterNames, "selected trend adapters must round trip");

        for (const auto& invalidPath : { std::string("relative.exe"), std::string("\"quoted\""), std::string("bad\npath"), std::string("bad\0path", 8), (root / "missing.exe").u8string() }) {
            auto invalid = paths;
            invalid.tsharkPath = invalidPath;
            require(!reloaded.save(invalid, error), "invalid executable path must be rejected");
            require(reloaded.paths.tsharkPath == paths.tsharkPath, "failed save must preserve runtime paths");
            AppConfig unchanged(root.u8string());
            require(unchanged.paths.tsharkPath == paths.tsharkPath, "failed save must preserve persisted paths");
        }
        auto invalid = paths;
        invalid.pcapDirectory = paths.tsharkPath;
        require(!reloaded.save(invalid, error), "capture directory cannot be a file");
        invalid = paths;
        invalid.tlsKeyLogPath = (root / "nonexistent" / "keys.log").u8string();
        require(!reloaded.save(invalid, error), "key log parent must exist");
        paths.tlsKeyLogPath = (root / "keys.log").u8string();
        require(reloaded.save(paths, error), "key log path must persist");
        require(!std::filesystem::exists(root / "keys.log"), "saving paths must not create key logs");
        AppConfig withKeys(root.u8string());
        require(withKeys.paths.tlsKeyLogPath == paths.tlsKeyLogPath, "key log path must round trip");

        rapidjson::Document malformed;
        malformed.Parse("{\"tsharkPath\":42}");
        AppPaths parsed;
        require(!AppConfig::readPaths(malformed, parsed, error), "non-string config must be rejected");
        malformed.Parse("{}");
        require(!AppConfig::readPaths(malformed, parsed, error), "missing fields must be rejected");
        malformed.SetArray();
        require(!AppConfig::readPaths(malformed, parsed, error), "array config must be rejected");

        const auto configPath = root / "config" / "settings.json";
        std::ofstream(configPath) << "broken JSON";
        AppConfig corrupted(root.u8string());
        require(!corrupted.configured(), "corrupt config must require setup");
        require(corrupted.save(paths, error), "corrupt config must be repairable");
        std::filesystem::remove(configPath);
        require(!corrupted.configured(), "deleted config must require setup");
        const auto installDirectory = root / std::filesystem::u8path("安装目录 空格");
        const auto backendDirectory = installDirectory / "resources" / "resources";
        std::filesystem::create_directories(backendDirectory);
#ifdef _WIN32
        _wputenv_s(L"EASYTSHARK_DATA_DIR", installDirectory.c_str());
#else
        setenv("EASYTSHARK_DATA_DIR", installDirectory.c_str(), 1);
#endif
        AppConfig installed(backendDirectory.u8string());
        require(installed.paths.pcapDirectory == (installDirectory / "pcap").u8string(), "installed capture directory must default beside the UI executable");
        auto installedPaths = paths;
        installedPaths.pcapDirectory = installed.paths.pcapDirectory;
        require(installed.save(installedPaths, error), "installed settings must save: " + error);
        require(std::filesystem::is_regular_file(installDirectory / "config" / "settings.json"), "installed settings must live in the installation directory");
        require(!std::filesystem::exists(backendDirectory / "config"), "installed settings must not live in backend resources");
        AppConfig installedReloaded(backendDirectory.u8string());
        require(installedReloaded.configured(), "installed settings must reload");
        require(installedReloaded.paths.pcapDirectory == installedPaths.pcapDirectory, "installed capture directory must round trip");
        installedPaths.pcapDirectory = paths.pcapDirectory;
        require(installedReloaded.save(installedPaths, error), "custom capture directory must remain supported");
        AppConfig customReloaded(backendDirectory.u8string());
        require(customReloaded.paths.pcapDirectory == paths.pcapDirectory, "saved custom capture directory must override the default");
#ifdef _WIN32
        _wputenv_s(L"EASYTSHARK_DATA_DIR", L"");
#else
        unsetenv("EASYTSHARK_DATA_DIR");
#endif
        std::cout << "PASS missing/corrupt settings, persistence, Unicode paths, validation, failed-save preservation, installed defaults and key-log non-activation\n";
        return 0;
    }
    catch (const std::exception& failure) {
        std::cerr << failure.what() << '\n';
        return 1;
    }
}
