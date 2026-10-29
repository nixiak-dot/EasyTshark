#pragma once
#include <filesystem>
#include <mutex>
#include <string>
#ifdef _WIN32
#include <windows.h>
#include <shobjidl.h>
#include <wrl/client.h>
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "uuid.lib")
#endif

class PathDialog {
public:
    static bool supportedField(const std::string& field) {
        return field == "tsharkPath" || field == "editcapPath"
            || field == "pcapDirectory" || field == "tlsKeyLogPath";
    }

    static bool choose(const std::string& field, const std::string& currentPath,
        std::string& selectedPath, std::string& error) {
        selectedPath.clear();
        if (!supportedField(field) || currentPath.size() > 32767
            || currentPath.find('\0') != std::string::npos) {
            error = "不支持的路径配置项或路径格式无效";
            return false;
        }
        static std::mutex dialogMutex;
        std::unique_lock<std::mutex> lock(dialogMutex, std::try_to_lock);
        if (!lock.owns_lock()) {
            error = "已有路径选择窗口打开，请先完成或取消选择";
            return false;
        }
#ifdef _WIN32
        const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        if (FAILED(initialized)) {
            error = "无法初始化系统文件选择窗口";
            return false;
        }
        struct ComSession {
            ~ComSession() { CoUninitialize(); }
        } session;
        Microsoft::WRL::ComPtr<IFileDialog> dialog;
        const bool directory = field == "pcapDirectory";
        const bool keyLog = field == "tlsKeyLogPath";
        HRESULT result = CoCreateInstance(CLSID_FileOpenDialog,
            nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(dialog.GetAddressOf()));
        if (FAILED(result)) {
            error = "无法创建系统文件选择窗口";
            return false;
        }
        FILEOPENDIALOGOPTIONS options;
        result = dialog->GetOptions(&options);
        if (SUCCEEDED(result)) {
            options |= FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR | FOS_PATHMUSTEXIST;
            if (directory) options |= FOS_PICKFOLDERS;
            else options |= FOS_FILEMUSTEXIST;
            result = dialog->SetOptions(options);
        }
        if (FAILED(result)) {
            error = "无法设置系统文件选择窗口";
            return false;
        }
        const wchar_t* title = directory ? L"选择抓包保存目录"
            : keyLog ? L"选择 TLS 密钥日志文件"
            : field == "tsharkPath" ? L"选择 Wireshark 的 tshark.exe" : L"选择 Wireshark 的 editcap.exe";
        dialog->SetTitle(title);
        if (keyLog) dialog->SetOkButtonLabel(L"打开");
        if (!directory) {
            const COMDLG_FILTERSPEC executables[] = { { L"可执行文件 (*.exe)", L"*.exe" } };
            const COMDLG_FILTERSPEC keyLogs[] = {
                { L"密钥日志 (*.log;*.txt;*.keys)", L"*.log;*.txt;*.keys" }, { L"所有文件", L"*.*" }
            };
            dialog->SetFileTypes(keyLog ? 2 : 1, keyLog ? keyLogs : executables);
            dialog->SetFileName(keyLog ? L"tls-keys.log" : field == "tsharkPath" ? L"tshark.exe" : L"editcap.exe");
        }
        try {
            if (!currentPath.empty()) {
                const auto current = std::filesystem::u8path(currentPath);
                std::error_code ignored;
                const bool currentDirectory = std::filesystem::is_directory(current, ignored);
                const auto folder = currentDirectory ? current : current.parent_path();
                Microsoft::WRL::ComPtr<IShellItem> item;
                if (!folder.empty() && SUCCEEDED(SHCreateItemFromParsingName(folder.c_str(), nullptr,
                    IID_PPV_ARGS(item.GetAddressOf())))) {
                    dialog->SetFolder(item.Get());
                }
                if (!directory && !currentDirectory && !current.filename().empty()) {
                    dialog->SetFileName(current.filename().c_str());
                }
            }
        }
        catch (const std::exception&) {
        }
        result = dialog->Show(nullptr);
        if (result == HRESULT_FROM_WIN32(ERROR_CANCELLED)) return true;
        Microsoft::WRL::ComPtr<IShellItem> selected;
        if (FAILED(result) || FAILED(dialog->GetResult(selected.GetAddressOf()))) {
            error = "无法获取所选路径，请重试或手动输入";
            return false;
        }
        PWSTR name = nullptr;
        result = selected->GetDisplayName(SIGDN_FILESYSPATH, &name);
        if (FAILED(result)) {
            error = "所选项目不是本地文件或目录";
            return false;
        }
        try {
            selectedPath = std::filesystem::path(name).u8string();
        }
        catch (const std::exception&) {
            CoTaskMemFree(name);
            error = "无法读取所选路径，请手动输入";
            return false;
        }
        CoTaskMemFree(name);
        return true;
#else
        error = "浏览器模式的系统路径选择目前仅支持 Windows，请手动输入路径";
        return false;
#endif
    }
};
