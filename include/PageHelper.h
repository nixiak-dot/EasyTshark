#pragma once
#include <string>
#include <sstream>

class PageAndOrder {
public:
    void reset() {
        pageNum = 0;
        pageSize = 0;
        orderBy = "";
        descOrAsc = "";
    }
    int pageNum = 0;
    int pageSize = 0;
    std::string orderBy;
    std::string descOrAsc;
};

class PageHelper {
public:
    static PageAndOrder* getPageAndOrder() {
        return &pageAndOrder;
    }

    static std::string getPageSql() {
        std::stringstream ss;
        if (!pageAndOrder.orderBy.empty()) {
            ss << " ORDER BY " << pageAndOrder.orderBy << " " << pageAndOrder.descOrAsc;
        }
        int offset = (pageAndOrder.pageNum - 1) * pageAndOrder.pageSize;
        ss << " LIMIT " << pageAndOrder.pageSize << " OFFSET " << offset << ";";

        return ss.str();
    }

private:
    static thread_local PageAndOrder pageAndOrder;
};