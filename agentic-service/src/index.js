import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.AGENTIC_SERVICE_PORT || process.env.PORT || 8004;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'agentic-service' });
});

// Placeholder routes
app.get('/', (req, res) => {
  res.json({ message: 'Agentic Service is running' });
});

app.listen(PORT, () => {
  console.log(`Agentic Service listening on port ${PORT}`);
});
