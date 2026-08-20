# EasyTshark

一个基于 C++ + Vue/React Electron 前端的 TShark 封装项目。

## 运行环境

- Windows 10/11
- Visual Studio 2022 + `v143`
- Node.js 18+ 和 npm
- 安装 Wireshark，确保 `tshark.exe` 和 `editcap.exe` 可用

## 依赖准备

这个仓库里有些内容是本地依赖，不会随 Git 一起提交：

- `third_library/`
- `tshark-front/node_modules/`
- `logs/`
- `pcap/`
- `*.db`
- `ip2region.xdb`

拉取仓库后，先把这些依赖补齐。

### 1. 后端第三方库

确保根目录下存在 `third_library/`，并包含项目要用到的头文件和源码，至少要有：

- `third_library/httplib`
- `third_library/include/asio.hpp`
- `third_library/ip2region/`
- `third_library/rapidjson/`
- `third_library/spdlog/`
- `third_library/sqlite3/`

同时保证 `third_library/ip2region/ip2region.xdb` 存在。

### 2. TShark

项目运行时会按下面顺序找 TShark：

1. `项目根目录/tshark/bin/tshark.exe`
2. `D:\wireshark\tshark.exe`

`editcap.exe` 也是同样逻辑。

最稳妥的做法是把 Wireshark 的 `tshark.exe`、`editcap.exe` 放到项目根目录下的 `tshark/bin/`。

### 3. 前端依赖

进入 `tshark-front/` 执行：

```bash
npm install
```

构建产物会输出到 `tshark-front/build/`，Electron 运行时会直接读取这里。

## 本地配置

这个工程的 `EasyTshark.vcxproj` 里有硬编码路径，默认是：

```text
D:\C++\EasyTshark
```

如果你的实际目录不是这个位置，需要把项目文件里的绝对路径改成你的本地路径，否则会找不到头文件。

## 启动顺序

1. 打开 `EasyTshark.sln`
2. 先确认 `third_library/` 和 `tshark/bin/` 已放好
3. 编译后端 C++ 项目
4. 进入 `tshark-front/` 执行 `npm install`
5. 启动后端程序，监听 `127.0.0.1:8080`
6. 前端开发模式执行：

```bash
npm start
```

7. 如需 Electron 壳，再开一个终端执行：

```bash
npm run electron-dev
```

前端默认连的是 `http://127.0.0.1:8080`，Electron 开发模式会走 `http://localhost:3000`

## 打包

```bash
npm run build
npm run electron-build
```

## 运行结果

启动后会生成或使用这些本地文件/目录：

- `logs/log.txt`
- `pcap/`
- `myPacketDatabase.db`

这些都不需要提交到仓库。
