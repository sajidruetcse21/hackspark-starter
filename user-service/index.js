import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.USER_SERVICE_PORT;

app.use(cors());
app.use(express.json());

app.get('/status', (req, res) => {
  res.json({
    service: 'user-service',
    status: 'OK'
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'User Service is running' });
});

app.listen(PORT, () => {
  console.log(`User service listening on port ${PORT}`);
});