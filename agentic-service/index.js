import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '../.env' });

const app = express();
app.use(express.json());

// --- MONGODB SETUP (MERN Core) ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/rentpi_agentic')
  .then(() => console.log('Agentic MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true, index: true, required: true },
  name: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', sessionSchema);

const messageSchema = new mongoose.Schema({
  sessionId: { type: String, index: true, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// --- GEMINI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: "You are the RentPi AI Assistant. Answer questions politely and concisely based strictly on the provided real backend data. If data is unavailable, state that explicitly. Do not invent numbers."
});

// --- SERVICE CONFIG ---
const CENTRAL_API_URL = process.env.CENTRAL_API_URL || 'https://technocracy.brittoo.xyz';
const CENTRAL_API_TOKEN = process.env.CENTRAL_API_TOKEN;
const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8003';
const RENTAL_SERVICE_URL = process.env.RENTAL_SERVICE_URL || 'http://rental-service:8002';

// --- P15: TOPIC GUARD ---
const RENTPI_KEYWORDS = [
  "rental", "product", "category", "price", "discount",
  "available", "availability", "renter", "owner", "rentpi",
  "booking", "gear", "surge", "peak", "trending", "most", "recommend"
];
function isOffTopic(message) {
  const lower = message.toLowerCase();
  return !RENTPI_KEYWORDS.some(kw => lower.includes(kw));
}

// --- P16: CHAT ENDPOINT (Resumable & Grounded) ---
app.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message required" });

  try {
    // 1. Check if this is a new session
    let session = await Session.findOne({ sessionId });
    const isNewSession = !session;

    // 2. Fetch past messages for context (Gemini format)
    const pastMessages = await Message.find({ sessionId }).sort({ timestamp: 1 });
    const geminiHistory = pastMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    let replyText = "";

    // 3. Process the actual message
    if (isOffTopic(message)) {
      replyText = "I am the RentPi Assistant. I can only answer questions regarding rentals, products, trends, and platform availability. How can I help you today?";
    } else {
      let contextData = "No external data needed for this query.";
      const lowerMsg = message.toLowerCase();

      try {
        // Data Grounding Logic (from P15)
        if (lowerMsg.includes('category') || lowerMsg.includes('most')) {
          const resp = await axios.get(`${CENTRAL_API_URL}/api/data/rentals/stats?group_by=category`, { headers: { Authorization: `Bearer ${CENTRAL_API_TOKEN}` } });
          contextData = JSON.stringify(resp.data);
        } else if (lowerMsg.includes('trending') || lowerMsg.includes('recommend')) {
          const today = new Date().toISOString().split('T')[0];
          const resp = await axios.get(`${ANALYTICS_SERVICE_URL}/analytics/recommendations?date=${today}&limit=5`);
          contextData = JSON.stringify(resp.data);
        } else if (lowerMsg.includes('peak')) {
          const resp = await axios.get(`${ANALYTICS_SERVICE_URL}/analytics/peak-window?from=2024-01&to=2024-12`);
          contextData = JSON.stringify(resp.data);
        } else if (lowerMsg.includes('surge')) {
          const monthMatch = message.match(/\b20\d{2}-\d{2}\b/);
          const month = monthMatch ? monthMatch[0] : '2024-03';
          const resp = await axios.get(`${ANALYTICS_SERVICE_URL}/analytics/surge-days?month=${month}`);
          contextData = JSON.stringify(resp.data);
        } else if (lowerMsg.includes('availab')) {
          const idMatch = message.match(/\b\d+\b/);
          if (idMatch) {
            const resp = await axios.get(`${RENTAL_SERVICE_URL}/rentals/products/${idMatch[0]}/availability?from=2024-03-01&to=2024-03-14`);
            contextData = JSON.stringify(resp.data);
          } else {
            contextData = "Ask the user to specify a product ID to check availability.";
          }
        }
      } catch (apiError) {
        contextData = "DATA UNAVAILABLE: The backend service failed. Tell the user you are unable to fetch the specific data. Do not guess.";
      }

      // Initialize chat with MongoDB history
      const chat = model.startChat({ history: geminiHistory });

      // Inject grounding context invisibly for this turn only
      const prompt = `Real Backend Data: ${contextData}\n\nUser Question: "${message}"`;
      const result = await chat.sendMessage(prompt);
      replyText = result.response.text();
    }

    // 4. Handle MongoDB State Updates
    if (isNewSession) {
      // Bonus requirement: Lightweight LLM call for naming the session
      const titleResult = await model.generateContent(`Given this user message, reply with ONLY a short 3-5 word title for this conversation. No punctuation.\nMessage: "${message}"`);
      const sessionName = titleResult.response.text().trim() || "New Conversation";

      session = new Session({ sessionId, name: sessionName });
    }

    session.lastMessageAt = new Date();
    await session.save();

    // Store the CLEAN message in DB (not the augmented prompt)
    await Message.create({ sessionId, role: 'user', content: message });
    await Message.create({ sessionId, role: 'assistant', content: replyText.trim() });

    res.json({ sessionId, reply: replyText.trim() });

  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: "Internal server error processing chat" });
  }
});

// --- P16: LIST SESSIONS ---
app.get('/chat/sessions', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ lastMessageAt: -1 }).select('-_id sessionId name lastMessageAt');
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// --- P16: GET SESSION HISTORY ---
app.get('/chat/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const messages = await Message.find({ sessionId }).sort({ timestamp: 1 }).select('-_id role content timestamp');

    res.json({
      sessionId: session.sessionId,
      name: session.name,
      messages
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// --- P16: DELETE SESSION ---
app.delete('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await Session.deleteOne({ sessionId });
    await Message.deleteMany({ sessionId });
    res.json({ success: true, message: "Session deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete session" });
  }
});

app.get('/status', (req, res) => res.json({ service: 'agentic-service', status: 'OK' }));

const PORT = process.env.AGENTIC_SERVICE_PORT||8004;
app.listen(PORT, () => console.log(`Agentic service running on ${PORT}`));