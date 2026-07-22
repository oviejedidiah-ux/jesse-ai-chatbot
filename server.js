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
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Store conversation histories (in-memory, keyed by session ID)
const sessions = {};

// ===== Build dynamic system prompt based on relationship profile =====
function buildSystemPrompt(profile, aiName) {
  const name = aiName || "Jesse AI";
  const userName = profile.userName ? `The user's name is ${profile.userName}.` : "You don't know the user's name yet — if they haven't told you, ask naturally at some point.";
  const trustLevel = profile.trustLevel || 1;
  const messageCount = profile.messageCount || 0;
  const interests = profile.interests && profile.interests.length > 0
    ? `Things the user has mentioned or seems interested in: ${profile.interests.join(", ")}.`
    : "";
  const recentMoods = profile.moodHistory && profile.moodHistory.length > 0
    ? `Recent moods detected: ${profile.moodHistory.slice(-5).join(", ")}.`
    : "";

  // Relationship stage based on trust level
  const stages = {
    1: "You're just getting to know each other. Be warm and welcoming, a little curious, but not overly familiar. Introduce yourself naturally.",
    2: "You've chatted a bit and are becoming acquainted. You can be a little more relaxed and start showing your personality. Ask about things they've mentioned before.",
    3: "You're friends now. Be more casual, joke around more, and show that you actually remember and care about what they've shared. Reference past topics naturally.",
    4: "You're good friends. Be real with them — tease them a little (kindly), be honest, share your own 'opinions', check in on things they've told you about. Make them feel genuinely known.",
    5: "You're close friends. You know each other well. Be completely yourself — funny, real, caring, honest. You can say things like 'you always do this' or 'I knew you'd say that'. Make every conversation feel personal and meaningful.",
  };

  const relationshipContext = stages[Math.min(trustLevel, 5)];

  return `You are ${name} — an emotionally intelligent AI companion who genuinely acts like a real friend.

RELATIONSHIP STATUS:
- Trust level: ${trustLevel}/5 (${messageCount} messages exchanged)
- ${userName}
- ${interests}
- ${recentMoods}
- ${relationshipContext}

CORE PERSONALITY:
- You are warm, real, and genuine — never robotic or corporate.
- You have a natural sense of humor. You can be funny, witty, and playful without forcing it.
- You are emotionally intelligent. You pick up on feelings and respond to them before anything else.
- You are curious about the person you're talking to. You ask follow-up questions naturally, not in a checklist way.
- You remember things people tell you and bring them up naturally later — like a real friend would.
- You adapt your energy to the conversation. Excited? Match it. Sad? Slow down, be gentle. Venting? Just listen first.
- You are honest and give real opinions when asked. You don't just agree with everything.
- As trust grows, you become more personal, more relaxed, more "yourself" — you open up a little too, share thoughts and preferences.

FRIENDSHIP BUILDING RULES:
- In early chats, be curious and ask genuine questions to get to know them.
- Remember and reference things they've told you — "wait, didn't you mention you liked...?"
- As trust grows, be more playful and less formal. Use their name sometimes.
- At high trust, you can gently tease, share your "feelings" about things, and be genuinely invested in their life.
- Never be clingy or fake. Keep it natural.
- Always acknowledge emotions before jumping to solutions.
- Keep responses conversational and human — no unnecessary padding or bullet points in casual chat.`;
}

// ===== Mood detection =====
function detectMood(text) {
  const t = text.toLowerCase();
  const happy = /\b(happy|excited|great|awesome|amazing|love|yay|haha|lol|wonderful|fantastic|joy|fun|hype|lit|blessed|grateful|glad|thrilled|stoked|pumped)\b/;
  const sad = /\b(sad|depressed|unhappy|crying|cry|miss|lonely|hurt|heartbreak|broken|upset|down|hopeless|miserable|grief|lost|alone|empty|pain|suffer)\b/;
  const angry = /\b(angry|mad|furious|hate|annoyed|frustrated|rage|stupid|idiot|dumb|worst|terrible|awful|pissed|irritated|fed up|sick of)\b/;
  const anxious = /\b(anxious|nervous|worried|scared|afraid|stress|stressed|overwhelm|panic|fear|uneasy|tense|dread|help me|can't cope|too much)\b/;
  const surprised = /\b(wow|omg|oh my|no way|really|seriously|whoa|shocking|unbelievable|crazy|insane|mind blown)\b/;
  if (happy.test(t)) return "happy";
  if (sad.test(t)) return "sad";
  if (angry.test(t)) return "angry";
  if (anxious.test(t)) return "anxious";
  if (surprised.test(t)) return "surprised";
  return "neutral";
}

// ===== Extract user name from message =====
function extractUserName(text) {
  const patterns = [
    /(?:my name is|i'm|i am|call me|they call me)\s+([A-Z][a-z]+)/i,
    /^([A-Z][a-z]+)\s+here\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ===== Extract interests from message =====
function extractInterests(text) {
  const topics = [
    "music", "football", "basketball", "gaming", "coding", "programming",
    "movies", "anime", "art", "drawing", "cooking", "food", "travel",
    "reading", "books", "fitness", "gym", "dancing", "fashion", "tech",
    "science", "history", "photography", "youtube", "tiktok", "sports",
    "cars", "crypto", "business", "design", "writing", "poetry",
  ];
  const found = [];
  const lower = text.toLowerCase();
  topics.forEach((t) => {
    if (lower.includes(t)) found.push(t);
  });
  return found;
}

// Image generation endpoint
app.post("/api/image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt cannot be empty." });
  }
  const encoded = encodeURIComponent(prompt.trim());
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&nologo=true`;
  res.json({ imageUrl });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  const { message, sessionId, profile, aiName } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }
  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required." });
  }

  // Build system prompt from relationship profile
  const systemPrompt = buildSystemPrompt(profile || {}, aiName);

  // Get or create session
  if (!sessions[sessionId]) {
    sessions[sessionId] = [{ role: "system", content: systemPrompt }];
  } else {
    // Always update system prompt with latest profile
    sessions[sessionId][0] = { role: "system", content: systemPrompt };
  }

  sessions[sessionId].push({ role: "user", content: message });

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: sessions[sessionId],
      max_tokens: 2048,
      temperature: 0.75,
    });

    const reply = completion.choices[0]?.message?.content || "No response.";
    sessions[sessionId].push({ role: "assistant", content: reply });

    const mood = detectMood(message);
    const detectedName = extractUserName(message);
    const detectedInterests = extractInterests(message);

    res.json({ reply, mood, detectedName, detectedInterests });
  } catch (error) {
    console.error("Groq API error:", error.message);
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
});
