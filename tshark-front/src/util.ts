import dayjs from 'dayjs'

/**
 * @feature 十六进制转十进制整数
 * @param {string}
 * @return {string}
 */
export const hex2int = (hex) => {
    const len = hex.length
    const a = new Array(len)
    let code
    for (let i = 0; i < len; i++) {
      code = hex.charCodeAt(i)
      if (48 <= code && code < 58) {
        code -= 48
      } else {
        code = (code & 0xdf) - 65 + 10
      }
      a[i] = code
    }
  
    return a.reduce(function (acc, c) {
      acc = 16 * acc + c
      return acc
    }, 0)
  }

/**
 * @feature 十六进制转ASCII
 * @param {string}
 * @return {string}
 */
export const hexCharCodeToStr = (hex) => {
    const _hex = hex.toString()
    let str = ''
    for (let i = 0; i < _hex.length; i += 2) {
      const ten = hex2int(_hex.substr(i, 2))
      if (ten == hex2int('0d')) { //13
        str += '换'
      } else if (ten == hex2int('0a')) { //10
        str += '行'
      } else if (ten <= 32 || ten >= 127) {
        str += '无'
      } else {
        str += String.fromCharCode(parseInt(_hex.substr(i, 2), 16))
      }
    }
    return str
  }


/**
 * @feature 字符串每两位分割
 */
export const strTwoSplit = (str) => {
    let result = ''
    for (let i = 0; i < str.length; i++) {
      result += str[i]
      if (i % 2 === 1) {
        result += ','
      }
    }
    return result
    }


/**
 * @feature 判断是否为整数
 * @return {Boolean}
 */
export const isInteger = (num) => {
    if (!isNaN(num) && num % 1 === 0) {
      return true
    } else {
      return false
    }
}


/**
 * @feature 数字位数不足指定位数时，左侧补0
 * @param {string} n-初始数字
 * @param {string} targetLen-数字位数为几位
 * @param {placeholder} placeholder-补什么数字
 * 例： padNumber(10, 8, 0) 结果：00000010
 * @return {string}
 */
export const padNumber = (n, targetLen, placeholder) => {
    const arr = ('' + n).split('')
    const diff = arr.length - targetLen
    if (diff < 0) {
      return Array(0 - diff)
        .fill(placeholder, 0, 0 - diff + 1)
        .concat(arr)
        .join('')
    } else {
      return arr.join('')
    }
  }


// 计算持续时间
export const calculateDuration = (startTime, endTime) => {
  // 确保 startTime 和 endTime 是有效的 dayjs 对象
  if (!dayjs(startTime).isValid() || !dayjs(endTime).isValid()) {
    return
  }
  // 计算时间差（以秒为单位）
  const durationMs = (endTime * 1000) - (startTime * 1000)

  // 将秒转换为分钟和秒
  const totalSeconds = Math.floor(durationMs / 1000); // 总秒数
  const milliseconds = Math.round(durationMs % 1000); // 剩余毫秒数
  const days = Math.floor(totalSeconds / (24 * 60 * 60)); // 天
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60)); // 小时
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60); // 分钟
  const seconds = totalSeconds % 60; // 秒
  if (minutes > 0) {
    return `${minutes}分钟${seconds}秒`
  } else if (seconds > 0) {
    return `${seconds}秒`
  } else {
    return milliseconds ? `${milliseconds}毫秒` : 0
  }
}


/**
 * @feature 十六进制转ASCII, 换行，不存在字符全部用. 代替
 * @param {string}
 * @return {string}
 */
export const hexCharCodeToAscStr = (hex) => {
  const _hex = hex.toString()
  let str = ''
  for (let i = 0; i < _hex.length; i += 2) {
    const ten = hex2int(_hex.substr(i, 2))
    // if(ten == hex2int('0d') || ten == hex2int('0a') || ten <= 32 || ten >= 127) {
    if (ten <= 32 || ten >= 127) {
      str += ten === 13 ? '\n' : ten === 10 ? '\r' : ten === '2E' ? '.' : '.'
    } else {
      str += String.fromCharCode(parseInt(_hex.substr(i, 2), 16))
    }
  }
  return str
}
/**
 * @feature 字符串按指定位数，符号分割
 * @param {string} str-字符串
 * @param {string} str-字符串
 * @param {string} sign-用什么符号分割
 */
export const strSexteenSplit = (str, number, sign) => {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    result += str[i] === '\r' || str[i] === '\n' ? ' .' : ` ${str[i]}`
    if ((i + 1) % number == 0 && str[i + 1]) {
      result += sign
    }
  }
  return result
}


/**
 * formatFileSize. 文件大小格式化
 *
 * @param      {<type>}    [fileSize]      文件大小,单位字节
 * @param      {string}    [unit]          文件单位
 */
export const formatFileSize = (fileSize, unit = 'B') => {
  if (fileSize == null || fileSize === '' || !fileSize || fileSize === '0') {
    if (unit === 'bit') return '0bps'
    else return '0' + unit
  }
  const unitArr = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
  let index = 0
  let size = 0
  if (unit === 'bit') fileSize = fileSize * 8
  if (fileSize > 1) {
    const srcSize = parseFloat(fileSize)
    index = Math.floor(Math.log(srcSize) / Math.log(1024))
    size = srcSize / Math.pow(1024, index)
    size = Math.round(size * 100) / 100
  } else {
    size = fileSize
  }
  let str = ''
  if (unit === 'bit') {
    str = `${size} ${unitArr[index] ? unitArr[index] : ''}bps`
  } else {
    str = size + unitArr[index] + unit
  }
  return str
}