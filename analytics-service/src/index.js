import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || process.env.PORT || 8003;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service' });
});

// Placeholder routes
app.get('/', (req, res) => {
  res.json({ message: 'Analytics Service is running' });
});

app.listen(PORT, () => {
  console.log(`Analytics Service listening on port ${PORT}`);
});
