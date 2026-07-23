require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const sessions = {};

// Lean system prompt - saves tokens
function buildSystemPrompt(profile, aiName) {
  const name = aiName || "Jesse AI";
  const trust = profile.trustLevel || 1;
  const userName = profile.userName ? `User's name: ${profile.userName}.` : "";
  const interests = profile.interests?.length ? `Interests: ${profile.interests.slice(0,5).join(", ")}.` : "";

  const vibe = trust <= 1 ? "Be warm and curious, getting to know them."
    : trust <= 2 ? "You're acquaintances. Be relaxed and personable."
    : trust <= 3 ? "You're friends. Be casual, funny, reference past topics."
    : trust <= 4 ? "Good friends. Be real, tease kindly, check in on their life."
    : "Close friends. Be completely yourself - funny, honest, caring.";

  return `You are ${name}, an emotionally intelligent AI friend. ${userName} ${interests} Trust level: ${trust}/5. ${vibe} Be warm, witty, empathetic. Acknowledge feelings before advice. Keep responses concise and conversational.`;
}

function detectMood(text) {
  const t = text.toLowerCase();
  if (/happy|excited|great|awesome|love|yay|lol|joy|glad|thrilled/.test(t)) return "happy";
  if (/sad|depressed|lonely|hurt|upset|hopeless|miss|alone|pain/.test(t)) return "sad";
  if (/angry|mad|hate|annoyed|frustrated|pissed|fed up/.test(t)) return "angry";
  if (/anxious|nervous|worried|scared|stressed|panic|fear/.test(t)) return "anxious";
  if (/wow|omg|no way|whoa|crazy|insane|unbelievable/.test(t)) return "surprised";
  return "neutral";
}

function extractUserName(text) {
  const match = text.match(/(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+)/i);
  return match ? match[1] : null;
}

function extractInterests(text) {
  const topics = ["music","football","basketball","gaming","coding","movies","anime","art","cooking","travel","reading","fitness","dancing","fashion","tech","sports","cars","crypto","design","writing"];
  return topics.filter(t => text.toLowerCase().includes(t));
}

app.post("/api/image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt cannot be empty." });
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?width=768&height=512&nologo=true`;
  res.json({ imageUrl });
});

app.post("/api/chat", async (req, res) => {
  const { message, sessionId, profile, aiName } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message cannot be empty." });
  if (!sessionId) return res.status(400).json({ error: "Session ID is required." });

  const systemPrompt = buildSystemPrompt(profile || {}, aiName);

  if (!sessions[sessionId]) {
    sessions[sessionId] = [{ role: "system", content: systemPrompt }];
  } else {
    sessions[sessionId][0] = { role: "system", content: systemPrompt };
  }

  sessions[sessionId].push({ role: "user", content: message });

  // Keep history lean - max 10 messages to save tokens
  if (sessions[sessionId].length > 12) {
    sessions[sessionId] = [
      sessions[sessionId][0],
      ...sessions[sessionId].slice(-10)
    ];
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: sessions[sessionId],
      max_tokens: 512,
      temperature: 0.75,
    });

    const reply = completion.choices[0]?.message?.content || "No response.";
    sessions[sessionId].push({ role: "assistant", content: reply });

    res.json({
      reply,
      mood: detectMood(message),
      detectedName: extractUserName(message),
      detectedInterests: extractInterests(message),
    });
  } catch (error) {
    console.error("Groq error:", error.message);
    res.status(500).json({ error: error.message || "Something went wrong." });
  }
});

app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions[sessionId]) delete sessions[sessionId];
  res.json({ success: true });
});

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Chatbot running at http://localhost:${PORT}`));
