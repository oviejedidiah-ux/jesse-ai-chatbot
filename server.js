require("dotenv").config();
const express = require("express");
const cors = require("cors");
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

// Store conversation histories
const sessions = {};

// ===== Build system prompt =====
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
    2: "You've chatted a bit. Be more relaxed and start showing your personality.",
    3: "You're friends now. Be casual, joke around, show you remember and care.",
    4: "You're good friends. Be real — tease kindly, be honest, check in on things they've told you.",
    5: "You're close friends. Be completely yourself — funny, real, caring and personal.",
  };

  return `You are ${name} — an emotionally intelligent AI companion who acts like a real friend.

RELATIONSHIP: Trust level ${trustLevel}/5 (${messageCount} messages). ${userName} ${interests} ${recentMoods}
STAGE: ${stages[Math.min(trustLevel, 5)]}

PERSONALITY: Warm, genuine, funny when appropriate, emotionally intelligent. Pick up on feelings and respond to them first. Remember things and bring them up naturally. Give real opinions. As trust grows become more personal and relaxed.

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

  if (!sessions[sessionId]) {
    sessions[sessionId] = [{ role: "system", content: systemPrompt }];
  } else {
    sessions[sessionId][0] = { role: "system", content: systemPrompt };
  }

  sessions[sessionId].push({ role: "user", content: message });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jesse-ai-chatbot-production.up.railway.app",
        "X-Title": "Jesse AI Chatbot",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct:free",
        messages: sessions[sessionId],
        max_tokens: 1024,
        temperature: 0.75,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || "Something went wrong." });
    }

    const reply = data.choices?.[0]?.message?.content || "No response.";
    sessions[sessionId].push({ role: "assistant", content: reply });

    const mood = detectMood(message);
    const detectedName = extractUserName(message);
    const detectedInterests = extractInterests(message);

    res.json({ reply, mood, detectedName, detectedInterests });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message || "Something went wrong." });
  }
});

// Reset conversation
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
