import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.RENTAL_SERVICE_PORT || process.env.PORT || 8002;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'rental-service' });
});

// Placeholder routes
app.get('/', (req, res) => {
  res.json({ message: 'Rental Service is running' });
});

app.listen(PORT, () => {
  console.log(`Rental Service listening on port ${PORT}`);
});
