import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Configure dotenv to look one directory up
dotenv.config({ path: '../.env' });

const { Pool } = pg;
const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

const centralApi = axios.create({
  baseURL: process.env.CENTRAL_API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.CENTRAL_API_TOKEN}`
  }
});

// Initialize Database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}
initDB();

// P2: Registration (Needed to create users for login)
app.post('/users/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Mandatory hashing
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email exists' }); // P2 Requirement
    res.status(500).json({ error: 'Server error' });
  }
});

// P2: Login Endpoint
app.post('/users/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' }); // P2 Requirement[cite: 1]
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// P2: Get Current User Profile
app.get('/users/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// P6: The Loyalty Discount
app.get('/users/:id/discount', async (req, res) => {
  const userId = req.params.id;
  try {
    const response = await centralApi.get(`/api/data/users/${userId}`);
    const centralUser = response.data;
    
    if (!centralUser || centralUser.securityScore === undefined) {
      return res.status(404).json({ error: 'User not found' });
    }

    const score = centralUser.securityScore;
    let discountPercent = 0;
    
    if (score >= 80) discountPercent = 20;
    else if (score >= 60) discountPercent = 15;
    else if (score >= 40) discountPercent = 10;
    else if (score >= 20) discountPercent = 5;

    res.json({
      userId: Number(userId),
      securityScore: score,
      discountPercent
    });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'User not found in Central API' });
    }
    res.status(500).json({ error: 'Error fetching from Central API' });
  }
});

// P1: Health Check[cite: 1]
app.get('/status', (req, res) => res.json({ service: 'user-service', status: 'OK' }));

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`User service on ${PORT}`));