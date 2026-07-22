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
        content:
          "You are a helpful, friendly, and knowledgeable AI assistant. You have general knowledge and can hold conversations on any topic. Be concise but thorough in your responses.",
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
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
});
