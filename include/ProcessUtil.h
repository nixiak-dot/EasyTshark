#pragma once
#include <string>
#include <cstdio>
#include <iostream>
#include<mutex>
#include <cerrno>

#ifdef _WIN32
#include <windows.h>
#include <io.h>
#include <fcntl.h>
typedef DWORD PID_T;
#else
#include <signal.h>
#include <unistd.h>
using PID_T = int;
#endif

class ProcessUtil {
private:
    static std::mutex& getMutex() {
        static std::mutex cout_mutex;
        return cout_mutex;
    }

public:
    static std::string getExecutableDir() {
#ifdef _WIN32
        std::string path( MAX_PATH, '\0' );
        for (;;) {
            const DWORD length = GetModuleFileNameA(nullptr, path.data(), static_cast<DWORD>(path.size()));
            if (length == 0) {
                return {};
            }
            if (length < path.size() - 1) {
                path.resize(length);
                break;
            }
            path.resize(path.size() * 2);
        }

        const std::string::size_type separator = path.find_last_of("\\/");
        if (separator == std::string::npos) {
            return {};
        }
        path.resize(separator + 1);
        return path;
#else
        std::string path(4096, '\0');
        const ssize_t length = readlink("/proc/self/exe", path.data(), path.size() - 1);
        if (length <= 0) {
            return {};
        }
        path.resize(static_cast<size_t>(length));
        const std::string::size_type separator = path.find_last_of('/');
        return separator == std::string::npos ? std::string() : path.substr(0, separator + 1);
#endif
    }

    static bool isProcessRunning(PID_T pid) {
        if (pid == 0) {
            return false;
        }
#ifdef _WIN32
        HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, pid);
        if (process == nullptr) {
            return false;
        }
        DWORD exitCode = 0;
        const bool running = GetExitCodeProcess(process, &exitCode) != FALSE && exitCode == STILL_ACTIVE;
        CloseHandle(process);
        return running;
#else
        return ::kill(pid, 0) == 0 || errno == EPERM;
#endif
    }

    //创建管道
    static FILE* popenEx(std::string command, PID_T* pidOut = nullptr) {
        HANDLE hReadPipe, hWritePipe;
        SECURITY_ATTRIBUTES seAttr;
        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        FILE* pipeFp = nullptr;

        // 设置安全属性
        seAttr.nLength = sizeof(SECURITY_ATTRIBUTES);
        seAttr.bInheritHandle = TRUE;
        seAttr.lpSecurityDescriptor = nullptr;

        if (!CreatePipe(&hReadPipe, &hWritePipe, &seAttr, 0)) {
            perror("CreatePipe");
            return nullptr;
        }

        if (!SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0)) {
            perror("SetHandleInformation");
            CloseHandle(hReadPipe);
            CloseHandle(hWritePipe);
            return nullptr;
        }

        ZeroMemory(&si, sizeof(si));
        ZeroMemory(&pi, sizeof(pi));
        si.cb = sizeof(si);
        si.hStdOutput = hWritePipe;
        si.hStdError = hWritePipe;
        si.dwFlags |= STARTF_USESTDHANDLES;

        // 将 UTF-8 字符串转换为 UTF-16（wstring）
        int size_needed = MultiByteToWideChar(CP_UTF8, 0, command.c_str(), -1, nullptr, 0);
        std::wstring wcommand(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, command.c_str(), -1, &wcommand[0], size_needed);

        // 创建子进程（Unicode 版本）
        if (!CreateProcessW(
            nullptr,              // 可执行路径
            &wcommand[0],         // 命令行参数（wchar_t*）
            nullptr,              // 默认安全属性
            nullptr,
            TRUE,                 // 继承句柄
            CREATE_NO_WINDOW,     // 不弹出控制台窗口
            nullptr,
            nullptr,
            &si,
            &pi
        )) {
            std::cerr << "CreateProcessW failed. Error: " << GetLastError() << std::endl;
            CloseHandle(hReadPipe);
            CloseHandle(hWritePipe);
            return nullptr;
        }

        // 关闭写端（父进程不写）
        CloseHandle(hWritePipe);

        // 输出 PID
        if (pidOut) {
            std::lock_guard<std::mutex> lock(getMutex());
            *pidOut = pi.dwProcessId;
            std::cout << "Tshark's PID is " << *pidOut << "\n" << std::flush;
        }

        // 将管道转化为文件流
        pipeFp = _fdopen(_open_osfhandle(reinterpret_cast<intptr_t>(hReadPipe), _O_RDONLY), "r");
        if (!pipeFp) {
            CloseHandle(hReadPipe);
        }

        // 清理子进程句柄
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        return pipeFp;
    }

    static int kill(PID_T pid) {
#ifdef _WIN32
        if (pid == 0) {
            return -1;
        }
        HANDLE hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
        if (hProcess == nullptr) {
            std::cerr << "Fail to get handle with pid " << pid << ", error: " << GetLastError() << std::endl;
            return -1;
        }

        if (!TerminateProcess(hProcess, 0)) {
            std::cerr << "Fail to terminate process with pid " << pid << ", error: " << GetLastError() << std::endl;
            CloseHandle(hProcess);
            return -1;
        }

        CloseHandle(hProcess);
        return 0;
#else
        return pid > 0 ? ::kill(pid, SIGTERM) : -1;
#endif
    }

    //创建进程
    static bool Exec(std::string command) {
#ifdef _WIN32

        STARTUPINFOW siStartInfo;
        PROCESS_INFORMATION piProcessInfo;

        //初始化结构体
        ZeroMemory(&siStartInfo,sizeof(STARTUPINFO));
        ZeroMemory(&piProcessInfo,sizeof(PROCESS_INFORMATION));

        // 将 UTF-8 字符串转换为 UTF-16（wstring）
        int size_needed = MultiByteToWideChar(CP_UTF8, 0, command.c_str(), -1, nullptr, 0);
        std::wstring wcommand(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, command.c_str(), -1, &wcommand[0], size_needed);

        // 创建进程
        if (CreateProcessW(
            nullptr, //使用命令行
            &wcommand[0],// 命令字符串
            nullptr,//进程句柄不可继承
            nullptr,//线程句柄不可继承
            true,//继承父进程句柄
            CREATE_NO_WINDOW,//不打开控制台窗口
            nullptr,//使用父进程环境变量
            nullptr,//使用回京城启动目录
            &siStartInfo,
            &piProcessInfo
        ))
        {
            WaitForSingleObject(piProcessInfo.hProcess,INFINITE);
            CloseHandle(piProcessInfo.hProcess);
            CloseHandle(piProcessInfo.hThread);
            return true;
        }
        else {
            return false;
        }

    }
#else
        return std::system(command.c_str()) == 0;
#endif
};
