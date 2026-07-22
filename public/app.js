// ===== State =====
const sessionId = crypto.randomUUID();
let isLoading = false;

// ===== DOM Elements =====
const messagesEl = document.getElementById("messages");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");
const sessionIndicator = document.getElementById("sessionIndicator");

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
    const prompt = chip.dataset.prompt;
    messageInput.value = prompt;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
    sendBtn.disabled = false;
    sendMessage();
  });
});

// ===== New Chat =====
newChatBtn.addEventListener("click", resetChat);

// ===== Sidebar toggle (mobile) =====
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar when clicking outside on mobile
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

  // Hide welcome screen on first message
  if (welcomeScreen.style.display !== "none") {
    welcomeScreen.style.display = "none";
  }

  // Add user message to UI
  appendMessage("user", text);

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isLoading = true;

  // Update sidebar session label
  if (sessionIndicator.querySelector("span").textContent === "New conversation") {
    sessionIndicator.querySelector("span").textContent =
      text.length > 30 ? text.slice(0, 30) + "…" : text;
  }

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
function appendMessage(role, text) {
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
    // Render markdown for assistant messages
    textEl.innerHTML = marked.parse(text);
  } else {
    // Plain text for user messages (escape HTML)
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

// ===== Reset / New Chat =====
async function resetChat() {
  // Reset UI
  messagesEl.innerHTML = "";
  welcomeScreen.style.display = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  sessionIndicator.querySelector("span").textContent = "New conversation";

  // Tell server to clear session history
  try {
    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch (_) {}

  messageInput.focus();
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
}

// Focus input on load
window.addEventListener("load", () => messageInput.focus());
