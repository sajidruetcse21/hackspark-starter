import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 8000;

app.get('/status', async (req, res) => {
  const downstream = {};
  const services = {
    'user-service': process.env.USER_SERVICE_URL || 'http://user-service:8001',
    'rental-service': process.env.RENTAL_SERVICE_URL || 'http://rental-service:8002',
    'analytics-service': process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8003',
    'agentic-service': process.env.AGENTIC_SERVICE_URL || 'http://agentic-service:8004'
  };

  await Promise.all(Object.entries(services).map(async ([name, url]) => {
    try {
      const response = await axios.get(`${url}/status`, { timeout: 2000 });
      downstream[name] = response.data.status || 'OK';
    } catch (error) {
      downstream[name] = 'UNREACHABLE';
    }
  }));

  res.json({
    service: 'api-gateway',
    status: 'OK',
    downstream
  });
});

app.listen(port, () => {
  console.log(`api-gateway running on port ${port}`);
});
