# 数据包解析回归

执行 `python tests/packet_detail/verify.py --tshark D:/wireshark/tshark.exe --sessions`，需要可用的 g++、OpenSSL 和 Wireshark。

覆盖 PDML 字段、协议分类、会话存储、TLS 重组及解密。长行回归额外检查 4096 字节边界、多段拼接、尾部不完整记录，以及包含 16000 字符 HTTP 请求路径的数据包解析和后续包的 pcap 偏移、十六进制读取。

实时抓包和离线分析共用完整行读取逻辑，stderr 不进入数据记录流。无效记录或帧号不连续时停止当前解析并记录日志，保留已处理数据，不跳过记录后继续计算文件偏移。
