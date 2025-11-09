// DONGPT MVP frontend JS
// Features:
// - send messages
// - simulated streaming AI response
// - switchable to real backend (fetch to /api/chat)
// - localStorage message history
// - simple error handling and UI polish

(() => {
    // configuration: if you run backend, set useBackend=true
    const config = {
        useBackend: true,              // <--- set false to run fully local mock mode
        backendUrl: "http://127.0.0.1:5000/api/chat", // change if backend runs elsewhere
        storageKey: "dongpt:messages",
        typingDelayPerChar: 20,       // ms per char during streaming simulation
    };

    // UI elements
    const messagesEl = document.getElementById("messages");
    const typingEl = document.getElementById("typing");
    const inputForm = document.getElementById("inputForm");
    const inputEl = document.getElementById("messageInput");
    const clearBtn = document.getElementById("clearBtn");

    // app state
    let isProcessing = false;
    let messages = loadMessages();

    // init
    renderMessages();
    scrollToBottom();

    // events
    inputForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (!text || isProcessing) return;
        inputEl.value = "";
        addMessage({ role: "user", text, ts: Date.now() });
        try {
            await handleUserMessage(text);
        } catch (err) {
            console.error(err);
            addMessage({ role: "system", text: "Error: " + (err.message || "unknown") });
        }
    });

    clearBtn.addEventListener("click", () => {
        if (!confirm("Clear chat history?")) return;
        messages = [];
        saveMessages();
        renderMessages();
    });

    // functions
    function loadMessages() {
        try {
            const raw = localStorage.getItem(config.storageKey);
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) {
            console.warn("Could not load messages", e);
            return [];
        }
    }

    function saveMessages() {
        try {
            localStorage.setItem(config.storageKey, JSON.stringify(messages.slice(-200))); // keep last 200
        } catch (e) {
            console.warn("Could not save messages", e);
        }
    }

    function addMessage(msg) {
        messages.push(msg);
        saveMessages();
        appendMessageToDOM(msg);
        scrollToBottom();
    }

    function appendMessageToDOM(msg) {
        const div = document.createElement("div");
        div.className = "msg " + (msg.role === "user" ? "me" : (msg.role === "ai" ? "ai" : "system"));
        if (msg.role === "user") {
            div.innerHTML = `<span class="meta">You · ${formatTime(msg.ts)}</span><div class="text"></div>`;
            div.querySelector(".text").textContent = msg.text;
        } else if (msg.role === "ai") {
            div.innerHTML = `<span class="meta">DONGPT · ${formatTime(msg.ts)}</span><div class="text"></div>`;
            // streaming support: if msg.stream is an array of chunks
            const textEl = div.querySelector(".text");
            if (msg.stream && Array.isArray(msg.stream)) {
                // we get chunks progressively
                msg.stream.forEach(chunk => { textEl.textContent += chunk; });
            } else {
                textEl.textContent = msg.text;
            }
        } else {
            div.innerHTML = `<span class="meta">System</span><div class="text">${msg.text}</div>`;
        }
        messagesEl.appendChild(div);
    }

    function renderMessages() {
        messagesEl.innerHTML = "";
        messages.forEach(appendMessageToDOM);
    }

    function scrollToBottom() {
        setTimeout(() => {
            messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
        }, 50);
    }

    function formatTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    async function handleUserMessage(text) {
        isProcessing = true;
        showTyping(true);

        if (config.useBackend) {
            try {
                const response = await fetchBackend(text);
                // response should be { text: "..."} or { stream: ["a","b"...] }
                if (response.stream) {
                    // stream simulation on frontend receiving chunk array
                    const aiMsg = { role: "ai", text: "", stream: [], ts: Date.now() };
                    addMessage(aiMsg); // adds initial empty AI message
                    // append chunks slowly (simulate streaming)
                    for (const chunk of response.stream) {
                        aiMsg.stream.push(chunk);
                        updateLastAiMessage(aiMsg);
                        await wait(30);
                    }
                    // finalize
                    aiMsg.text = aiMsg.stream.join("");
                    saveMessages();
                } else {
                    addMessage({ role: "ai", text: response.text || "(empty)", ts: Date.now() });
                }
            } catch (err) {
                addMessage({ role: "ai", text: "Sorry, something went wrong.", ts: Date.now() });
                throw err;
            } finally {
                isProcessing = false;
                showTyping(false);
            }
        } else {
            // mock mode — local simulated reply
            const reply = localMockReply(text);
            // streaming simulation
            const aiMsg = { role: "ai", text: "", stream: [], ts: Date.now() };
            addMessage(aiMsg);
            for (const ch of replyToChunks(reply)) {
                aiMsg.stream.push(ch);
                updateLastAiMessage(aiMsg);
                await wait(config.typingDelayPerChar);
            }
            aiMsg.text = aiMsg.stream.join("");
            saveMessages();
            isProcessing = false;
            showTyping(false);
        }
    }

    // replace last AI message DOM content with updated stream
    function updateLastAiMessage(aiMsg) {
        // find last .msg.ai element
        const nodes = messagesEl.querySelectorAll(".msg.ai");
        const last = nodes[nodes.length - 1];
        if (!last) return;
        const textEl = last.querySelector(".text");
        if (textEl) textEl.textContent = aiMsg.stream.join("");
        scrollToBottom();
    }

    function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

    // Basic chunking helper for streaming effect
    function replyToChunks(text) {
        // break into small chunks; keep words intact usually
        const words = text.split(" ");
        const chunks = [];
        let cur = "";
        for (const w of words) {
            if ((cur + " " + w).length > 12) {
                chunks.push(cur + " ");
                cur = w;
            } else {
                cur = cur ? (cur + " " + w) : w;
            }
        }
        if (cur) chunks.push(cur);
        return chunks;
    }

    function localMockReply(userText) {
        // simple friendly echo + suggestion. Replace with real AI logic later.
        const base = `Nice — I got: "${userText}". Here's a plan: 1) Practice daily 2) Build small models 3) Iterate fast.`;
        return base;
    }

    async function fetchBackend(userText) {
        // call your backend. Backend must support JSON {input: "..."}
        const payload = { input: userText };
        const res = await fetch(config.backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Backend error ${res.status}: ${txt}`);
        }
        // backend returns JSON e.g. { text: "...", stream: ["a","b"] }
        const json = await res.json();
        return json;
    }

    function showTyping(show) {
        typingEl.hidden = !show;
    }

    // initial helper: if empty chat, add welcome
    if (messages.length === 0) {
        addMessage({ role: "ai", text: "Hi — I'm DONGPT (MVP). Ask me anything to start the demo!", ts: Date.now() });
    }

})();
