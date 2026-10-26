import axios from 'axios';

// Use the CRA proxy in development; packaged Electron pages use file://.
const baseUrl = process.env.NODE_ENV === 'development' ? '' : 'http://127.0.0.1:8080';

export const apiPost = async (url,data={},config={})=>{
   try{
        let _url = url;
        if (data["pageNum"] != undefined && data["pageSize"] != undefined) {
            _url = url + '?pageSize=' + data["pageSize"] + "&pageNum=" + data["pageNum"]
        }
        const response = await axios.post(baseUrl+_url,data,config);

        return response.data;
    }catch(error){
        console.error('Error in postData:', error);
        throw error; 
    }
}

export const apiGet = async (url) => {
  try {
    // 发送 POST 请求
    const response = await axios.get(baseUrl + url);

    // 返回响应数据
    return response.data;
  } catch (error) {
    // 如果请求失败，抛出错误
    console.error('Error in postData:', error);
    throw error; // 可以选择抛出错误或返回一个默认值
  }
};
