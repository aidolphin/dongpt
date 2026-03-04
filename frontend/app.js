(() => {
    const config = {
        defaultBackendUrl: "http://127.0.0.1:5000/api/chat",
        typingDelayPerChar: 20,
        chatsStorageKey: "dongpt:chats:v2",
        activeChatKey: "dongpt:active-chat:v2",
        legacyStorageKey: "dongpt:messages",
        defaultProvider: "auto",
        defaultModel: "",
    };

    const els = {
        messages: document.getElementById("messages"),
        typing: document.getElementById("typing"),
        inputForm: document.getElementById("inputForm"),
        input: document.getElementById("messageInput"),
        clearBtn: document.getElementById("clearBtn"),
        stopBtn: document.getElementById("stopBtn"),
        micBtn: document.getElementById("micBtn"),
        newChatBtn: document.getElementById("newChatBtn"),
        historyToggleBtn: document.getElementById("historyToggleBtn"),
        historyPanel: document.getElementById("historyPanel"),
        workspace: document.querySelector(".workspace"),
        chatList: document.getElementById("chatList"),
        sendBtn: document.getElementById("sendBtn"),
    };

    let isProcessing = false;
    let stopRequested = false;
    let activeController = null;
    let recognition = null;

    let chats = loadChats();
    let activeChatId = loadActiveChatId();

    ensureChatState();
    renderHistory();
    renderMessages();
    scrollToBottom();
    autoResizeInput();
    updateControls();

    els.inputForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = els.input.value.trim();
        if (!text || isProcessing) return;

        els.input.value = "";
        autoResizeInput();

        addMessage({ role: "user", text, ts: Date.now() });
        try {
            await handleUserMessage(text);
        } catch (err) {
            if (err && err.name === "AbortError") {
                return;
            }
            console.error(err);
            addMessage({ role: "system", text: "Error: " + (err.message || "unknown"), ts: Date.now() });
        }
    });

    els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            els.inputForm.requestSubmit();
        }
    });

    els.input.addEventListener("input", autoResizeInput);

    els.clearBtn.addEventListener("click", () => {
        const chat = getActiveChat();
        if (!chat) return;
        if (!confirm("Clear messages in this chat?")) return;
        chat.messages = [];
        chat.updatedAt = Date.now();
        saveChats();
        renderMessages();
        renderHistory();
    });

    els.stopBtn.addEventListener("click", stopGeneration);

    els.micBtn.addEventListener("click", () => {
        if (isProcessing) return;
        toggleVoiceInput();
    });

    els.newChatBtn.addEventListener("click", () => {
        const chat = createChat();
        chats.unshift(chat);
        activeChatId = chat.id;
        addMessage({ role: "ai", text: "New chat ready. Ask anything.", ts: Date.now() }, chat.id);
        saveChats();
        renderHistory();
        renderMessages();
        els.input.focus();
    });

    els.historyToggleBtn.addEventListener("click", () => {
        els.historyPanel.classList.toggle("hidden");
        els.workspace.classList.toggle("history-collapsed");
    });

    function loadChats() {
        try {
            const raw = localStorage.getItem(config.chatsStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }

            const legacyRaw = localStorage.getItem(config.legacyStorageKey);
            if (legacyRaw) {
                const legacyMessages = JSON.parse(legacyRaw);
                if (Array.isArray(legacyMessages) && legacyMessages.length > 0) {
                    return [{
                        id: uid(),
                        title: "Imported Chat",
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        messages: legacyMessages,
                    }];
                }
            }
            return [];
        } catch (e) {
            console.warn("Could not load chats", e);
            return [];
        }
    }

    function saveChats() {
        try {
            const compact = chats.slice(0, 50).map(chat => ({
                ...chat,
                messages: (chat.messages || []).slice(-300),
            }));
            localStorage.setItem(config.chatsStorageKey, JSON.stringify(compact));
            localStorage.setItem(config.activeChatKey, activeChatId);
        } catch (e) {
            console.warn("Could not save chats", e);
        }
    }

    function loadActiveChatId() {
        return localStorage.getItem(config.activeChatKey);
    }

    function ensureChatState() {
        if (!chats.length) {
            const chat = createChat("Welcome Chat");
            chat.messages.push({ role: "ai", text: "Hi, I am DONGPT. Ask me anything to begin.", ts: Date.now() });
            chats.push(chat);
        }

        if (!activeChatId || !chats.find(c => c.id === activeChatId)) {
            activeChatId = chats[0].id;
        }

        saveChats();
    }

    function createChat(forcedTitle) {
        return {
            id: uid(),
            title: forcedTitle || "New Chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
        };
    }

    function getActiveChat() {
        return chats.find(c => c.id === activeChatId) || null;
    }

    function cleanAIText(text) {
        return String(text || "").replace(/["\/|\\'()\*#\:\;`<>]/g, "");
    }

    function addMessage(msg, forcedChatId) {
        const targetId = forcedChatId || activeChatId;
        const chat = chats.find(c => c.id === targetId);
        if (!chat) return;

        const safe = { ...msg };
        if (safe.role === "ai" && typeof safe.text === "string") {
            safe.text = cleanAIText(safe.text);
        }

        chat.messages.push(safe);
        chat.updatedAt = Date.now();
        refreshChatTitle(chat);

        saveChats();

        if (targetId === activeChatId) {
            appendMessageToDOM(safe);
            scrollToBottom();
        }

        renderHistory();
    }

    function refreshChatTitle(chat) {
        if (!chat || chat.title !== "New Chat") return;
        const firstUser = (chat.messages || []).find(m => m.role === "user" && m.text);
        if (firstUser) {
            chat.title = firstUser.text.slice(0, 28);
        }
    }

    function formatAIText(text) {
        const lines = String(text || "").split(/\r?\n/).filter(line => line.trim() !== "");
        if (!lines.length) return "";

        let html = "";
        let inList = false;
        let listType = null;

        for (const line of lines) {
            if (/^\d+\.\s+/.test(line)) {
                if (!inList || listType !== "ol") {
                    if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
                    html += "<ol>";
                    inList = true;
                    listType = "ol";
                }
                html += `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`;
                continue;
            }

            if (/^[-\*]\s+/.test(line)) {
                if (!inList || listType !== "ul") {
                    if (inList) html += listType === "ol" ? "</ol>" : "</ul>";
                    html += "<ul>";
                    inList = true;
                    listType = "ul";
                }
                html += `<li>${escapeHtml(line.replace(/^[-\*]\s+/, ""))}</li>`;
                continue;
            }

            if (inList) {
                html += listType === "ol" ? "</ol>" : "</ul>";
                inList = false;
                listType = null;
            }

            if (/^.+:\s+.+/.test(line)) {
                const parts = line.split(":");
                const term = escapeHtml(parts[0]);
                const desc = escapeHtml(parts.slice(1).join(":").trim());
                html += `<div class="def"><strong>${term}</strong>: ${desc}</div>`;
            } else {
                html += `<p>${escapeHtml(line)}</p>`;
            }
        }

        if (inList) {
            html += listType === "ol" ? "</ol>" : "</ul>";
        }

        return html;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function appendMessageToDOM(msg) {
        const div = document.createElement("div");
        div.className = "msg " + (msg.role === "user" ? "me" : (msg.role === "ai" ? "ai" : "system"));

        if (msg.role === "user") {
            div.innerHTML = `<span class="meta">You · ${formatTime(msg.ts)}</span><div class="text"></div>`;
            div.querySelector(".text").textContent = msg.text || "";
        } else if (msg.role === "ai") {
            div.innerHTML = `<span class="meta">DONGPT · ${formatTime(msg.ts)}</span><div class="text"></div>`;
            const textEl = div.querySelector(".text");
            if (msg.stream && Array.isArray(msg.stream)) {
                textEl.innerHTML = formatAIText(msg.stream.join(""));
            } else {
                textEl.innerHTML = formatAIText(msg.text || "");
            }
        } else {
            div.innerHTML = `<span class="meta">System</span><div class="text"></div>`;
            div.querySelector(".text").textContent = msg.text || "";
        }

        els.messages.appendChild(div);
    }

    function renderMessages() {
        els.messages.innerHTML = "";
        const chat = getActiveChat();
        if (!chat) return;
        (chat.messages || []).forEach(appendMessageToDOM);
        scrollToBottom();
    }

    function renderHistory() {
        const sorted = [...chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        els.chatList.innerHTML = "";

        for (const chat of sorted) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
            button.innerHTML = `
                <span class="title">${escapeHtml(chat.title || "Untitled Chat")}</span>
                <span class="time">${formatTime(chat.updatedAt)}</span>
            `;
            button.addEventListener("click", () => {
                activeChatId = chat.id;
                saveChats();
                renderHistory();
                renderMessages();
            });
            els.chatList.appendChild(button);
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            const container = els.messages.parentElement;
            container.scrollTop = container.scrollHeight;
        }, 30);
    }

    function formatTime(ts) {
        if (!ts) return "";
        return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function uid() {
        return "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    }

    function setProcessing(processing) {
        isProcessing = processing;
        updateControls();
        showTyping(processing);
    }

    function updateControls() {
        els.sendBtn.disabled = isProcessing;
        els.stopBtn.disabled = !isProcessing;
        els.micBtn.disabled = isProcessing;
    }

    async function handleUserMessage(text) {
        stopRequested = false;
        setProcessing(true);

        const useMock = false;

        try {
            if (useMock) {
                await runMockReply(text);
                return;
            }

            const response = await fetchBackend(text);
            if (stopRequested) return;

            if (response.stream && Array.isArray(response.stream)) {
                const aiMsg = { role: "ai", text: "", stream: [], ts: Date.now() };
                addMessage(aiMsg);
                for (const chunk of response.stream) {
                    if (stopRequested) break;
                    aiMsg.stream.push(chunk);
                    updateLastAiMessage(aiMsg);
                    await wait(25);
                }
                aiMsg.text = aiMsg.stream.join("");
                saveChats();
            } else {
                addMessage({ role: "ai", text: response.text || "(empty)", ts: Date.now() });
            }
        } finally {
            setProcessing(false);
            activeController = null;
        }
    }

    async function runMockReply(userText) {
        const reply = localMockReply(userText);
        const aiMsg = { role: "ai", text: "", stream: [], ts: Date.now() };
        addMessage(aiMsg);

        for (const ch of replyToChunks(reply)) {
            if (stopRequested) break;
            aiMsg.stream.push(ch);
            updateLastAiMessage(aiMsg);
            await wait(config.typingDelayPerChar);
        }

        aiMsg.text = aiMsg.stream.join("");
        saveChats();
    }

    function updateLastAiMessage(aiMsg) {
        const nodes = els.messages.querySelectorAll(".msg.ai");
        const last = nodes[nodes.length - 1];
        if (!last) return;
        const textEl = last.querySelector(".text");
        if (textEl) textEl.innerHTML = formatAIText(aiMsg.stream.join(""));
        scrollToBottom();
    }

    async function fetchBackend(userText) {
        const payload = {
            input: userText,
            provider: config.defaultProvider,
            model: config.defaultModel,
        };

        activeController = new AbortController();
        const res = await fetch(config.defaultBackendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: activeController.signal,
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Backend error ${res.status}: ${txt}`);
        }

        return await res.json();
    }

    function stopGeneration() {
        if (!isProcessing) return;
        stopRequested = true;
        if (activeController) {
            activeController.abort();
        }
        addMessage({ role: "system", text: "Generation stopped by user.", ts: Date.now() });
        setProcessing(false);
    }

    function localMockReply(userText) {
        return `Received: "${userText}"\n\n1. Backend is currently unavailable.\n2. Start backend server and try again.\n3. You can stop generation anytime.`;
    }

    function replyToChunks(text) {
        const words = text.split(" ");
        const chunks = [];
        let cur = "";

        for (const word of words) {
            if ((cur + " " + word).length > 12) {
                chunks.push(cur + " ");
                cur = word;
            } else {
                cur = cur ? (cur + " " + word) : word;
            }
        }

        if (cur) chunks.push(cur);
        return chunks;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showTyping(show) {
        els.typing.hidden = !show;
    }

    function autoResizeInput() {
        els.input.style.height = "auto";
        const max = 180;
        els.input.style.height = Math.min(els.input.scrollHeight, max) + "px";
    }

    function toggleVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addMessage({ role: "system", text: "Voice input is not supported in this browser.", ts: Date.now() });
            return;
        }

        if (recognition) {
            recognition.stop();
            recognition = null;
            els.micBtn.innerHTML = "&#127908;";
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            els.micBtn.textContent = "Rec";
        };

        recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript || "";
            if (!transcript) return;
            els.input.value = (els.input.value ? els.input.value + " " : "") + transcript;
            autoResizeInput();
        };

        recognition.onerror = () => {
            addMessage({ role: "system", text: "Voice capture error. Please try again.", ts: Date.now() });
        };

        recognition.onend = () => {
            recognition = null;
            els.micBtn.innerHTML = "&#127908;";
        };

        recognition.start();
    }
})();
