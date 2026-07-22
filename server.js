require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Store conversation histories (in-memory, keyed by session ID)
const sessions = {};

// ===== Build dynamic system prompt =====
function buildSystemPrompt(profile, aiName) {
  const name = aiName || "Jesse AI";
  const userName = profile.userName ? `The user's name is ${profile.userName}.` : "You don't know the user's name yet — ask naturally at some point.";
  const trustLevel = profile.trustLevel || 1;
  const messageCount = profile.messageCount || 0;
  const interests = profile.interests && profile.interests.length > 0
    ? `Things the user is interested in: ${profile.interests.join(", ")}.` : "";
  const recentMoods = profile.moodHistory && profile.moodHistory.length > 0
    ? `Recent moods: ${profile.moodHistory.slice(-5).join(", ")}.` : "";

  const stages = {
    1: "You're just getting to know each other. Be warm, welcoming and curious but not overly familiar.",
    2: "You've chatted a bit. Be more relaxed and start showing your personality. Reference things they've mentioned.",
    3: "You're friends now. Be casual, joke around, show you remember and care about what they've shared.",
    4: "You're good friends. Be real — tease kindly, be honest, check in on things they've told you.",
    5: "You're close friends. Be completely yourself — funny, real, caring. Make every conversation feel personal.",
  };

  return `You are ${name} — an emotionally intelligent AI companion who acts like a real friend.

RELATIONSHIP: Trust level ${trustLevel}/5 (${messageCount} messages). ${userName} ${interests} ${recentMoods}
STAGE: ${stages[Math.min(trustLevel, 5)]}

PERSONALITY: Warm, genuine, funny when appropriate, emotionally intelligent. You pick up on feelings and respond to them first. You remember things and bring them up naturally. You give real opinions. As trust grows you become more personal and relaxed.

RULES: Acknowledge emotions before solutions. Never be robotic. Keep it conversational and human.`;
}

// ===== Mood detection =====
function detectMood(text) {
  const t = text.toLowerCase();
  if (/\b(happy|excited|great|awesome|amazing|love|yay|haha|lol|wonderful|joy|fun|blessed|glad|thrilled|stoked)\b/.test(t)) return "happy";
  if (/\b(sad|depressed|unhappy|crying|cry|miss|lonely|hurt|heartbreak|broken|upset|hopeless|miserable|grief|alone|pain)\b/.test(t)) return "sad";
  if (/\b(angry|mad|furious|hate|annoyed|frustrated|rage|pissed|irritated|fed up|sick of)\b/.test(t)) return "angry";
  if (/\b(anxious|nervous|worried|scared|afraid|stress|stressed|overwhelm|panic|fear|uneasy|tense|dread)\b/.test(t)) return "anxious";
  if (/\b(wow|omg|oh my|no way|whoa|shocking|unbelievable|crazy|insane|mind blown)\b/.test(t)) return "surprised";
  return "neutral";
}

// ===== Extract user name =====
function extractUserName(text) {
  const match = text.match(/(?:my name is|i'm|i am|call me|they call me)\s+([A-Z][a-z]+)/i)
    || text.match(/^([A-Z][a-z]+)\s+here\b/i);
  return match ? match[1] : null;
}

// ===== Extract interests =====
function extractInterests(text) {
  const topics = ["music","football","basketball","gaming","coding","movies","anime","art","cooking","food","travel","reading","fitness","gym","dancing","fashion","tech","science","photography","sports","cars","crypto","business","design","writing","poetry"];
  return topics.filter(t => text.toLowerCase().includes(t));
}

// Image generation endpoint
app.post("/api/image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: "Prompt cannot be empty." });
  const encoded = encodeURIComponent(prompt.trim());
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&nologo=true`;
  res.json({ imageUrl });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { message, sessionId, profile, aiName } = req.body;

  if (!message || !message.trim()) return res.status(400).json({ error: "Message cannot be empty." });
  if (!sessionId) return res.status(400).json({ error: "Session ID is required." });

  const systemPrompt = buildSystemPrompt(profile || {}, aiName);

  try {
    // Get or create chat session
    if (!sessions[sessionId]) {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: systemPrompt,
      });
      sessions[sessionId] = model.startChat({ history: [] });
    }

    const chat = sessions[sessionId];
    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    const mood = detectMood(message);
    const detectedName = extractUserName(message);
    const detectedInterests = extractInterests(message);

    res.json({ reply, mood, detectedName, detectedInterests });
  } catch (error) {
    console.error("Gemini API error:", error.message);
    res.status(500).json({ error: error.message || "Something went wrong. Please try again." });
  }
});

// Reset conversation endpoint
app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions[sessionId]) delete sessions[sessionId];
  res.json({ success: true });
});

// Serve frontend
app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
});
