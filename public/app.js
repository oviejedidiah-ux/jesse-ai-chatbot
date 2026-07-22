// ===== Constants =====
const STORAGE_KEY = "jesse_ai_chats";
const AI_NAME_KEY = "jesse_ai_name";
const THEME_KEY = "jesse_ai_theme";
const PROFILE_KEY = "jesse_ai_profile";

// ===== Mood config =====
const MOODS = {
  happy:     { label: "Happy 😊",    color: "#10a37f" },
  sad:       { label: "Sad 💙",       color: "#5b8dd9" },
  angry:     { label: "Angry 😡",     color: "#e05c5c" },
  anxious:   { label: "Anxious 😰",   color: "#e0a83a" },
  surprised: { label: "Surprised 😮", color: "#a855f7" },
  neutral:   { label: "Neutral 😐",   color: "#8e8ea0" },
};

// ===== State =====
let isLoading = false;
let currentChatId = null;
let sessionId = null;
let aiName = localStorage.getItem(AI_NAME_KEY) || "Jesse AI";
let currentMood = "neutral";

// ===== DOM Elements =====
const messagesEl = document.getElementById("messages");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const newChatBtn = document.getElementById("newChatBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");
const chatHistoryEl = document.getElementById("chatHistory");
const moodDot = document.getElementById("moodDot");
const moodLabel = document.getElementById("moodLabel");
const sidebarName = document.getElementById("sidebarName");
const topbarName = document.getElementById("topbarName");
const pageTitle = document.getElementById("pageTitle");
const inputHint = document.getElementById("inputHint");
const nameModal = document.getElementById("nameModal");
const aiNameInput = document.getElementById("aiNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");

// ===== Relationship Profile =====
function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {
      trustLevel: 1, messageCount: 0, userName: null, interests: [], moodHistory: [],
    };
  } catch {
    return { trustLevel: 1, messageCount: 0, userName: null, interests: [], moodHistory: [] };
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function updateProfile(mood, detectedName, detectedInterests) {
  const profile = getProfile();
  profile.messageCount = (profile.messageCount || 0) + 1;
  if (profile.messageCount >= 50) profile.trustLevel = 5;
  else if (profile.messageCount >= 25) profile.trustLevel = 4;
  else if (profile.messageCount >= 10) profile.trustLevel = 3;
  else if (profile.messageCount >= 4) profile.trustLevel = 2;
  else profile.trustLevel = 1;
  if (detectedName && !profile.userName) profile.userName = detectedName;
  if (detectedInterests && detectedInterests.length > 0) {
    detectedInterests.forEach((i) => { if (!profile.interests.includes(i)) profile.interests.push(i); });
    if (profile.interests.length > 15) profile.interests = profile.interests.slice(-15);
  }
  if (mood && mood !== "neutral") {
    profile.moodHistory = profile.moodHistory || [];
    profile.moodHistory.push(mood);
    if (profile.moodHistory.length > 10) profile.moodHistory = profile.moodHistory.slice(-10);
  }
  saveProfile(profile);
  return profile;
}

// ===== Apply AI name =====
function applyAiName(name) {
  aiName = name;
  sidebarName.textContent = name;
  topbarName.textContent = `${name} · Groq`;
  pageTitle.textContent = name;
  inputHint.textContent = `${name} can make mistakes. Verify important information.`;
}

// ===== Name modal =====
function checkNameSetup() {
  const saved = localStorage.getItem(AI_NAME_KEY);
  if (!saved) {
    nameModal.classList.add("active");
    aiNameInput.focus();
  } else {
    applyAiName(saved);
  }
}

saveNameBtn.addEventListener("click", () => {
  const name = aiNameInput.value.trim() || "Jesse AI";
  localStorage.setItem(AI_NAME_KEY, name);
  applyAiName(name);
  nameModal.classList.remove("active");
  messageInput.focus();
});

aiNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveNameBtn.click(); });

// ===== Mood =====
function updateMood(mood) {
  if (!mood || !MOODS[mood]) return;
  currentMood = mood;
  const m = MOODS[mood];
  moodDot.style.background = m.color;
  moodLabel.textContent = `Mood: ${m.label}`;
  moodDot.style.boxShadow = `0 0 8px ${m.color}`;
}

// ===== Theme =====
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  if (theme === "light") {
    themeIcon.textContent = "🌙";
    themeText.textContent = "Dark mode";
  } else {
    themeIcon.textContent = "☀️";
    themeText.textContent = "Light mode";
  }
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// ===== Voice input (mic to text only) =====
let isRecording = false;
let recognition = null;

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    voiceBtn.title = "Listening... click to stop";
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
    messageInput.value = transcript;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
    sendBtn.disabled = transcript.trim() === "";
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove("recording");
    voiceBtn.title = "Speak your message";
    if (messageInput.value.trim()) sendBtn.disabled = false;
  };

  recognition.onerror = () => {
    isRecording = false;
    voiceBtn.classList.remove("recording");
  };

  voiceBtn.addEventListener("click", () => {
    if (isRecording) recognition.stop();
    else recognition.start();
  });
} else {
  voiceBtn.style.display = "none";
}

// ===== Storage =====
function getAllChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveAllChats(chats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getChat(id) { return getAllChats()[id] || null; }

function deleteChatById(id) {
  const chats = getAllChats();
  delete chats[id];
  saveAllChats(chats);
}

// ===== Sidebar =====
function renderSidebar() {
  chatHistoryEl.innerHTML = "";
  const chats = getAllChats();
  const list = Object.values(chats)
    .filter((c) => c.messages && c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (list.length === 0) {
    chatHistoryEl.innerHTML = `<p class="no-history">No saved chats yet</p>`;
    return;
  }

  list.forEach((chat) => {
    const item = document.createElement("div");
    item.classList.add("session-item");
    if (chat.id === currentChatId) item.classList.add("active");
    item.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="session-title">${escapeHtml(chat.title)}</span>
      <button class="delete-chat-btn" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-chat-btn")) {
        e.stopPropagation();
        deleteChatById(chat.id);
        if (chat.id === currentChatId) beginNewChat();
        else renderSidebar();
        return;
      }
      loadChat(chat.id);
      if (window.innerWidth <= 768) sidebar.classList.remove("open");
    });
    chatHistoryEl.appendChild(item);
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== Load chat =====
function loadChat(id) {
  const chat = getChat(id);
  if (!chat) return;
  currentChatId = id;
  sessionId = id;
  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "none";
  chat.messages.forEach((msg) => {
    if (msg.type === "image") renderImageMessage(msg.prompt, msg.imageUrl);
    else renderMessage(msg.role, msg.text);
  });
  renderSidebar();
  scrollToBottom();
  messageInput.focus();
}

// ===== New chat =====
function beginNewChat() {
  currentChatId = crypto.randomUUID();
  sessionId = currentChatId;
  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  updateMood("neutral");
  renderSidebar();
  fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
  messageInput.focus();
}

// ===== Save message =====
function saveMessage(chatId, msgObj, firstUserText) {
  const chats = getAllChats();
  if (!chats[chatId]) {
    chats[chatId] = {
      id: chatId,
      title: firstUserText
        ? (firstUserText.length > 32 ? firstUserText.slice(0, 32) + "…" : firstUserText)
        : "New conversation",
      messages: [],
      updatedAt: Date.now(),
    };
  }
  chats[chatId].messages.push(msgObj);
  chats[chatId].updatedAt = Date.now();
  saveAllChats(chats);
}

// ===== Image detection =====
function isImageRequest(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("generate an image") || lower.includes("generate a image") ||
    lower.includes("create an image") || lower.includes("create a image") ||
    lower.includes("make an image") || lower.includes("make a image") ||
    lower.includes("draw me") || lower.includes("draw a ") || lower.includes("draw an ") ||
    lower.includes("show me a picture") || lower.includes("generate a picture") ||
    /^(generate|create|draw|make)\s+.*(image|picture|photo|illustration)/i.test(text)
  );
}

function extractImagePrompt(text) {
  return text
    .replace(/^(generate|create|make|draw|show\s+me)\s+(an?\s+)?(image|picture|photo|illustration|drawing)\s+(of\s+)?/i, "")
    .replace(/^draw\s+me\s+(an?\s+)?/i, "")
    .trim() || text;
}

// ===== Send message =====
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  welcomeScreen.style.display = "none";

  const chats = getAllChats();
  const isFirst = !chats[currentChatId] || chats[currentChatId].messages.length === 0;

  saveMessage(currentChatId, { role: "user", text }, isFirst ? text : null);
  renderMessage("user", text);
  if (isFirst) renderSidebar();

  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isLoading = true;

  const typingId = showTyping();

  if (isImageRequest(text)) {
    const prompt = extractImagePrompt(text);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      removeTyping(typingId);
      if (res.ok) {
        saveMessage(currentChatId, { type: "image", prompt, imageUrl: data.imageUrl });
        renderImageMessage(prompt, data.imageUrl);
      } else {
        renderMessage("assistant", `Couldn't generate the image: ${data.error}`);
      }
    } catch {
      removeTyping(typingId);
      renderMessage("assistant", "Network error. Couldn't generate the image.");
    }
  } else {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, profile: getProfile(), aiName }),
      });
      const data = await res.json();
      removeTyping(typingId);
      const reply = res.ok ? data.reply : `Sorry, something went wrong: ${data.error}`;
      if (res.ok) {
        updateProfile(data.mood, data.detectedName, data.detectedInterests);
        updateMood(data.mood);
      }
      saveMessage(currentChatId, { role: "assistant", text: reply });
      renderMessage("assistant", reply);
    } catch {
      removeTyping(typingId);
      renderMessage("assistant", "Network error. Please check your connection.");
    }
  }

  isLoading = false;
  sendBtn.disabled = messageInput.value.trim() === "";
  messageInput.focus();
}

// ===== Render text message =====
function renderMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", role);

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  if (role === "user") {
    avatar.textContent = "U";
  } else {
    avatar.textContent = "AI";
    avatar.style.background = MOODS[currentMood]?.color || MOODS.neutral.color;
  }

  const content = document.createElement("div");
  content.classList.add("message-content");

  const roleLabel = document.createElement("div");
  roleLabel.classList.add("message-role");
  roleLabel.textContent = role === "user" ? "You" : aiName;

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");
  if (role === "assistant") textEl.innerHTML = marked.parse(text);
  else textEl.textContent = text;

  content.appendChild(roleLabel);
  content.appendChild(textEl);
  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

// ===== Render image message =====
function renderImageMessage(prompt, imageUrl) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "assistant");

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  avatar.textContent = "AI";
  avatar.style.background = MOODS[currentMood]?.color || MOODS.neutral.color;

  const content = document.createElement("div");
  content.classList.add("message-content");

  const roleLabel = document.createElement("div");
  roleLabel.classList.add("message-role");
  roleLabel.textContent = aiName;

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");
  textEl.innerHTML = `<p>Here's your image of <strong>${escapeHtml(prompt)}</strong>:</p>
    <div class="image-container">
      <img src="${imageUrl}" alt="${escapeHtml(prompt)}" class="generated-image" loading="lazy" />
      <a href="${imageUrl}" download="ai-image.jpg" class="download-btn">Download</a>
    </div>`;

  content.appendChild(roleLabel);
  content.appendChild(textEl);
  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

// ===== Typing indicator =====
function showTyping() {
  const id = "typing-" + Date.now();
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "assistant");
  wrapper.id = id;

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  avatar.textContent = "AI";
  avatar.style.background = MOODS[currentMood]?.color || MOODS.neutral.color;

  const content = document.createElement("div");
  content.classList.add("message-content");

  const roleLabel = document.createElement("div");
  roleLabel.classList.add("message-role");
  roleLabel.textContent = aiName;

  const dots = document.createElement("div");
  dots.classList.add("typing-indicator");
  dots.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;

  content.appendChild(roleLabel);
  content.appendChild(dots);
  wrapper.appendChild(avatar);
  wrapper.appendChild(content);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ===== Scroll =====
function scrollToBottom() {
  messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
}

// ===== Event listeners =====
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
  sendBtn.disabled = messageInput.value.trim() === "" || isLoading;
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

newChatBtn.addEventListener("click", () => {
  beginNewChat();
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
});

menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

document.addEventListener("click", (e) => {
  if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
    if (!sidebar.contains(e.target) && e.target !== menuToggle) sidebar.classList.remove("open");
  }
});

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    messageInput.value = chip.dataset.prompt;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
    sendBtn.disabled = false;
    sendMessage();
  });
});

// ===== Init =====
window.addEventListener("load", () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
  checkNameSetup();
  beginNewChat();
  updateMood("neutral");
  messageInput.focus();
});
