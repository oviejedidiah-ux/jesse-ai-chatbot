// ===== Constants =====
const STORAGE_KEY = "jesse_ai_chats";

// ===== State =====
let sessionId = crypto.randomUUID();
let isLoading = false;
let currentChatId = null;
let chats = loadChatsFromStorage();

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

// ===== Storage =====
function loadChatsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveChatsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function createNewChat() {
  const id = crypto.randomUUID();
  chats[id] = {
    id,
    title: "New conversation",
    messages: [],
    createdAt: Date.now(),
  };
  saveChatsToStorage();
  return id;
}

function saveChatMessage(chatId, role, text) {
  if (!chats[chatId]) return;
  chats[chatId].messages.push({ role, text, timestamp: Date.now() });
  saveChatsToStorage();
}

function updateChatTitle(chatId, title) {
  if (!chats[chatId]) return;
  chats[chatId].title = title.length > 32 ? title.slice(0, 32) + "…" : title;
  saveChatsToStorage();
}

// ===== Render Sidebar History =====
function renderChatHistory() {
  chatHistoryEl.innerHTML = "";

  // Only show chats that have at least one message
  const sorted = Object.values(chats)
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    chatHistoryEl.innerHTML = `<p class="no-history">No saved chats yet</p>`;
    return;
  }

  sorted.forEach((chat) => {
    const item = document.createElement("div");
    item.classList.add("session-item");
    if (chat.id === currentChatId) item.classList.add("active");

    item.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>${chat.title}</span>
      <button class="delete-chat-btn" data-id="${chat.id}" title="Delete chat">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Load chat on click
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-chat-btn")) return;
      loadChat(chat.id);
      if (window.innerWidth <= 768) sidebar.classList.remove("open");
    });

    // Delete chat
    item.querySelector(".delete-chat-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    chatHistoryEl.appendChild(item);
  });
}

// ===== Load a saved chat =====
function loadChat(chatId) {
  if (!chats[chatId]) return;

  currentChatId = chatId;
  sessionId = chatId; // reuse chatId as sessionId for server continuity

  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "none";

  chats[chatId].messages.forEach((msg) => {
    appendMessage(msg.role, msg.text, false); // false = don't save again
  });

  renderChatHistory();
  scrollToBottom();
}

// ===== Delete a chat =====
function deleteChat(chatId) {
  delete chats[chatId];
  saveChatsToStorage();

  // If deleted current chat, start fresh
  if (chatId === currentChatId) {
    startNewChat();
  } else {
    renderChatHistory();
  }
}

// ===== Start a new chat =====
function startNewChat() {
  // If current chat has no messages, reuse it instead of creating a new one
  if (currentChatId && chats[currentChatId] && chats[currentChatId].messages.length === 0) {
    messagesEl.innerHTML = "";
    welcomeScreen.style.display = "";
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;
    renderChatHistory();
    messageInput.focus();
    return;
  }

  currentChatId = createNewChat();
  sessionId = currentChatId;

  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;

  renderChatHistory();

  // Tell server to clear session
  fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});

  messageInput.focus();
}

// ===== Auto-resize textarea =====
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
  sendBtn.disabled = messageInput.value.trim() === "" || isLoading;
});

// ===== Send on Enter (Shift+Enter for newline) =====
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// ===== Send button =====
sendBtn.addEventListener("click", sendMessage);

// ===== Suggestion chips =====
document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    messageInput.value = chip.dataset.prompt;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
    sendBtn.disabled = false;
    sendMessage();
  });
});

// ===== New Chat button =====
newChatBtn.addEventListener("click", () => {
  startNewChat();
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
});

// ===== Sidebar toggle =====
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
    if (!sidebar.contains(e.target) && e.target !== menuToggle) {
      sidebar.classList.remove("open");
    }
  }
});

// ===== Core: Send Message =====
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  // Hide welcome screen
  welcomeScreen.style.display = "none";

  // Update chat title with first message
  if (chats[currentChatId] && chats[currentChatId].messages.length === 0) {
    updateChatTitle(currentChatId, text);
    renderChatHistory();
  }

  // Add user message
  appendMessage("user", text);
  saveChatMessage(currentChatId, "user", text);

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isLoading = true;

  // Show typing indicator
  const typingId = showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    const data = await res.json();
    removeTyping(typingId);

    if (res.ok) {
      appendMessage("assistant", data.reply);
      saveChatMessage(currentChatId, "assistant", data.reply);
    } else {
      appendMessage("assistant", `Sorry, something went wrong: ${data.error}`);
    }
  } catch (err) {
    removeTyping(typingId);
    appendMessage("assistant", "Network error. Please check your connection and try again.");
  }

  isLoading = false;
  sendBtn.disabled = messageInput.value.trim() === "";
  messageInput.focus();
}

// ===== Append a message bubble =====
function appendMessage(role, text, save = true) {
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

  const indicator = document.createElement("div");
  indicator.classList.add("typing-indicator");
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  content.appendChild(roleLabel);
  content.appendChild(indicator);
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

// ===== Scroll to bottom =====
function scrollToBottom() {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: "smooth",
  });
}

// ===== Init =====
window.addEventListener("load", () => {
  startNewChat();
  messageInput.focus();
});
