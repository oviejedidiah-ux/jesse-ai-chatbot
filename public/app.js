// ===== Constants =====
const STORAGE_KEY = "jesse_ai_chats";

// ===== State =====
let isLoading = false;
let currentChatId = null;
let sessionId = null;

// ===== DOM Elements =====
const messagesEl = document.getElementById("messages");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");
const chatHistoryEl = document.getElementById("chatHistory");

// ===== Storage helpers =====
function getAllChats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAllChats(chats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getChat(id) {
  return getAllChats()[id] || null;
}

function saveChat(chat) {
  const chats = getAllChats();
  chats[chat.id] = chat;
  saveAllChats(chats);
}

function deleteChat(id) {
  const chats = getAllChats();
  delete chats[id];
  saveAllChats(chats);
}

// ===== Render sidebar =====
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
      </button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-chat-btn")) {
        e.stopPropagation();
        deleteChatAndRefresh(chat.id);
        return;
      }
      loadChat(chat.id);
      if (window.innerWidth <= 768) sidebar.classList.remove("open");
    });

    chatHistoryEl.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== Load a past chat =====
function loadChat(id) {
  const chat = getChat(id);
  if (!chat) return;

  currentChatId = id;
  sessionId = id;

  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "none";

  chat.messages.forEach((msg) => renderMessage(msg.role, msg.text));

  renderSidebar();
  scrollToBottom();
  messageInput.focus();
}

// ===== Delete chat =====
function deleteChatAndRefresh(id) {
  deleteChat(id);
  if (id === currentChatId) {
    beginNewChat();
  } else {
    renderSidebar();
  }
}

// ===== Begin a new chat =====
function beginNewChat() {
  // Generate fresh IDs
  currentChatId = crypto.randomUUID();
  sessionId = currentChatId;

  // Clear UI
  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;

  renderSidebar();

  // Tell server to reset
  fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});

  messageInput.focus();
}

// ===== Send message =====
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  // Hide welcome screen
  welcomeScreen.style.display = "none";

  // Build or update chat in storage
  const chats = getAllChats();
  const isFirstMessage = !chats[currentChatId] || chats[currentChatId].messages.length === 0;

  if (!chats[currentChatId]) {
    chats[currentChatId] = {
      id: currentChatId,
      title: "New conversation",
      messages: [],
      updatedAt: Date.now(),
    };
  }

  // Set title from first user message
  if (isFirstMessage) {
    chats[currentChatId].title = text.length > 32 ? text.slice(0, 32) + "…" : text;
  }

  // Save user message
  chats[currentChatId].messages.push({ role: "user", text });
  chats[currentChatId].updatedAt = Date.now();
  saveAllChats(chats);

  renderMessage("user", text);
  renderSidebar();

  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isLoading = true;

  const typingId = showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    const data = await res.json();
    removeTyping(typingId);

    const reply = res.ok ? data.reply : `Sorry, something went wrong: ${data.error}`;

    // Save assistant message
    const updatedChats = getAllChats();
    if (updatedChats[currentChatId]) {
      updatedChats[currentChatId].messages.push({ role: "assistant", text: reply });
      updatedChats[currentChatId].updatedAt = Date.now();
      saveAllChats(updatedChats);
    }

    renderMessage("assistant", reply);
  } catch {
    removeTyping(typingId);
    renderMessage("assistant", "Network error. Please check your connection and try again.");
  }

  isLoading = false;
  sendBtn.disabled = messageInput.value.trim() === "";
  messageInput.focus();
}

// ===== Render a single message =====
function renderMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", role);

  const avatar = document.createElement("div");
  avatar.classList.add("message-avatar");
  avatar.textContent = role === "user" ? "U" : "AI";

  const content = document.createElement("div");
  content.classList.add("message-content");

  const roleLabel = document.createElement("div");
  roleLabel.classList.add("message-role");
  roleLabel.textContent = role === "user" ? "You" : "Jesse AI";

  const textEl = document.createElement("div");
  textEl.classList.add("message-text");

  if (role === "assistant") {
    textEl.innerHTML = marked.parse(text);
  } else {
    textEl.textContent = text;
  }

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

  const content = document.createElement("div");
  content.classList.add("message-content");

  const roleLabel = document.createElement("div");
  roleLabel.classList.add("message-role");
  roleLabel.textContent = "Jesse AI";

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
    if (!sidebar.contains(e.target) && e.target !== menuToggle) {
      sidebar.classList.remove("open");
    }
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
  beginNewChat();
  messageInput.focus();
});
