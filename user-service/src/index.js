import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.USER_SERVICE_PORT;
console.log(PORT)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Placeholder routes
app.get('/', (req, res) => {
  res.json({ message: 'User Service is running' });
});

app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});
