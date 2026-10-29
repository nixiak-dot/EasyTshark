import React from 'react';
import EChartsReact from 'echarts-for-react';  // 引入ECharts-for-React

function LineChart({ data }) {
    const xData = []
    const arr = []
    data.forEach(item => {
        xData.push(item.time)
        arr.push(item.bytes)
    })
    const option = {
        animation: false,
        grid: {
            left: 0,
            right: 0,
            top: 2,
            bottom: 2
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            axisLine: { show: false },  // 不显示X轴线
            axisTick: { show: false },  // 不显示X轴刻度线
            splitLine: { show: false },  // 不显示X轴分割线
            data: xData
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },  // 不显示Y轴线
            axisTick: { show: false },  // 不显示Y轴刻度线
            splitLine: { show: false }  // 不显示Y轴分割线
        },
        series: [{
            name: '',
            type: 'line',
            data: arr,
            symbol: 'none',  // 不显示折点符号
            smooth: true,  // 曲线平滑
            lineStyle: {
                width: 1  // 设置折线宽度为1
            }
        }]
    };
    return <EChartsReact option={option} style={{ height: 35 }} />;
}

export default LineChart;
