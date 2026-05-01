import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.GATEWAY_PORT || process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// Placeholder routes
app.get('/', (req, res) => {
  res.json({ message: 'API Gateway is running' });
});

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
