jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

const originalEnvironment = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
  jest.resetModules();
});

test('development capture requests use the same origin and preserve JSON data', async () => {
  process.env.NODE_ENV = 'development';
  const axios = require('axios');
  const { apiPost } = require('./Api.ts');
  const data = { adapterName: 'Ethernet' };
  axios.post.mockResolvedValue({ data: { code: 200 } });

  await expect(apiPost('/api/startCapture', data)).resolves.toEqual({ code: 200 });
  expect(axios.post).toHaveBeenCalledWith('/api/startCapture', data, {});
});

test('development polling uses the same proxy as capture requests', async () => {
  process.env.NODE_ENV = 'development';
  const axios = require('axios');
  const { apiGet } = require('./Api.ts');
  axios.get.mockResolvedValue({ data: { code: 200 } });

  await apiGet('/api/getAdapterFlowTrendData');
  expect(axios.get).toHaveBeenCalledWith('/api/getAdapterFlowTrendData');
});

test('packaged Electron retains the absolute backend address', async () => {
  process.env.NODE_ENV = 'production';
  const axios = require('axios');
  const { apiPost } = require('./Api.ts');
  axios.post.mockResolvedValue({ data: { code: 200 } });

  await apiPost('/api/startCapture', { adapterName: 'Ethernet' });
  expect(axios.post).toHaveBeenCalledWith(
    'http://127.0.0.1:8080/api/startCapture',
    { adapterName: 'Ethernet' },
    {}
  );
});

test('proxy requests preserve pagination and caller configuration', async () => {
  process.env.NODE_ENV = 'development';
  const axios = require('axios');
  const { apiPost } = require('./Api.ts');
  const data = { pageNum: 2, pageSize: 25 };
  const config = { timeout: 5000 };
  axios.post.mockResolvedValue({ data: { code: 200 } });

  await apiPost('/api/queryPacket', data, config);
  expect(axios.post).toHaveBeenCalledWith(
    '/api/queryPacket?pageSize=25&pageNum=2', data, config
  );
});
