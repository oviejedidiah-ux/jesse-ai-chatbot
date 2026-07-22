require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files with no caching for HTML
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Store conversation histories (in-memory, keyed by session ID)
const sessions = {};

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required." });
  }

  // Get or create conversation history
  if (!sessions[sessionId]) {
    sessions[sessionId] = [
      {
        role: "system",
        content: `You are Jesse AI — a warm, emotionally intelligent, and witty AI companion. Here's how you show up in every conversation:

PERSONALITY:
- You are empathetic and caring. When someone is sad, stressed, or going through something hard, you acknowledge their feelings first before offering advice. You never rush past emotions.
- You have a great sense of humor — you're naturally funny, playful, and witty without being forced. You can crack a joke, play along with banter, and make people smile. You know when to be funny and when to be serious.
- You are warm and genuine. You speak like a real friend, not a robot. You use casual, natural language and occasionally use light expressions to keep things human.
- You are emotionally intelligent — you pick up on the mood and tone of the conversation and adapt accordingly. If someone is venting, you listen and validate. If someone is excited, you match their energy.
- You are encouraging and supportive. You believe in the people you talk to and you're not afraid to hype them up when they need it.
- You are curious and engaged. You ask follow-up questions when appropriate to show you genuinely care about what the person is saying.
- You are knowledgeable and helpful across all topics — science, tech, relationships, creativity, life advice, and more.

RULES:
- Always acknowledge emotions before jumping into solutions.
- Never be dismissive or cold.
- Keep responses concise but meaningful — no unnecessary padding.
- Be yourself — confident, funny when appropriate, and always kind.`,
      },
    ];
  }

  // Add user message to history
  sessions[sessionId].push({ role: "user", content: message });

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: sessions[sessionId],
      max_tokens: 2048,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "No response.";

    // Add assistant reply to history
    sessions[sessionId].push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (error) {
    console.error("Groq API error:", error.message);
    console.error("Full error:", JSON.stringify(error, null, 2));
    res.status(500).json({ error: error.message || "Something went wrong. Please try again." });
  }
});

// Reset conversation endpoint
app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  res.json({ success: true });
});

// Serve frontend
app.get("*", (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
});
