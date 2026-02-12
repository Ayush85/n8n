(function () {
    // ============================================
    // CONFIGURATION - Customize these values
    // ============================================
    const CONFIG = {
        API_URL: window.N8N_CHAT_API_URL || 'http://localhost:3001',
        N8N_WEBHOOK_URL: window.N8N_CHAT_WEBHOOK_URL || 'https://n8n.aydexis.com/webhook/b5ecaafa-5b1f-483f-b03e-4275a31bdb0a/chat',
        CLIENT_ID: window.N8N_CHAT_CLIENT_ID || '8848',
        SITE_NAME: window.N8N_CHAT_SITE_NAME || '8848 Momo House',
        PRIMARY_COLOR: window.N8N_CHAT_PRIMARY_COLOR || '#2563eb',
        SOCKET_IO_CDN: 'https://cdn.socket.io/4.7.2/socket.io.min.js',
        MARKED_CDN: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    };

    // ============================================
    // STATE
    // ============================================
    let socket = null;
    let sessionId = localStorage.getItem('n8n_chat_session_id') || 'sess_' + Math.random().toString(36).substr(2, 9);
    let sessionMode = localStorage.getItem('n8n_chat_mode') || 'ai'; // 'ai' or 'human'
    let isTyping = false;
    let isSessionLoaded = false; // Track if session status is loaded from server
    let userInfo = JSON.parse(localStorage.getItem('n8n_chat_user_info') || 'null'); // {email, phone, name}

    // Debug log
    console.log('🚀 N8N Chat Widget Initialized');
    console.log('📋 Session ID:', sessionId);
    console.log('🤖 Session Mode:', sessionMode);
    console.log('🔗 N8N Webhook:', CONFIG.N8N_WEBHOOK_URL);
    console.log('🌐 API URL:', CONFIG.API_URL);

    // Global reset function (call from console: n8nChatReset())
    window.n8nChatReset = function () {
        localStorage.removeItem('n8n_chat_session_id');
        localStorage.removeItem('n8n_chat_mode');
        localStorage.removeItem('n8n_chat_user_info');
        console.log('✅ Chat session reset! Refresh the page.');
        location.reload();
    };

    localStorage.setItem('n8n_chat_session_id', sessionId);

    // ============================================
    // STYLES
    // ============================================
    const styles = `
        #n8n-chat-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #n8n-chat-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: ${CONFIG.PRIMARY_COLOR};
            box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            border: none;
        }
        #n8n-chat-button:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(37, 99, 235, 0.5); }
        #n8n-chat-button svg { fill: white; width: 28px; height: 28px; }
        
        #n8n-chat-window {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 380px;
            height: 550px;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        #n8n-chat-window.open { display: flex; animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        .n8n-chat-header {
            padding: 18px 20px;
            background: linear-gradient(135deg, ${CONFIG.PRIMARY_COLOR} 0%, #4f46e5 100%);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .n8n-chat-header-title { font-weight: 700; font-size: 16px; }
        .n8n-chat-header-status { font-size: 11px; opacity: 0.85; margin-top: 2px; }
        .n8n-chat-close { 
            background: rgba(255,255,255,0.2); 
            border: none; 
            color: white; 
            width: 32px; 
            height: 32px; 
            border-radius: 50%; 
            cursor: pointer; 
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .n8n-chat-close:hover { background: rgba(255,255,255,0.3); }

        .n8n-chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .n8n-chat-input-area {
            padding: 16px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            gap: 10px;
            background: #ffffff;
        }
        .n8n-chat-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            outline: none;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        .n8n-chat-input:focus { border-color: ${CONFIG.PRIMARY_COLOR}; }
        .n8n-chat-input:disabled { background: #f1f5f9; }
        
        .n8n-chat-send {
            background: ${CONFIG.PRIMARY_COLOR};
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
        }
        .n8n-chat-send:hover { background: #1d4ed8; transform: scale(1.02); }
        .n8n-chat-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        
        .n8n-msg {
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 16px;
            font-size: 14px;
            line-height: 1.5;
            word-wrap: break-word;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        
        .n8n-msg-user {
            align-self: flex-end;
            background: ${CONFIG.PRIMARY_COLOR};
            color: white;
            border-bottom-right-radius: 4px;
        }
        .n8n-msg-ai {
            align-self: flex-start;
            background: #ecfdf5;
            color: #064e3b;
            border-bottom-left-radius: 4px;
            border: 1px solid #d1fae5;
        }
        .n8n-msg-admin {
            align-self: flex-start;
            background: #f1f5f9;
            color: #1e293b;
            border-bottom-left-radius: 4px;
        }
        .n8n-msg-system {
            align-self: center;
            background: #fef3c7;
            color: #92400e;
            font-size: 12px;
            padding: 8px 14px;
            border-radius: 20px;
        }
        .n8n-msg-label {
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 4px;
            opacity: 0.7;
        }
        .n8n-msg-label-user {
            text-align: right;
            color: #64748b;
        }
        .n8n-msg-label-ai {
            text-align: left;
            color: #059669;
        }
        .n8n-msg-label-admin {
            text-align: left;
            color: #6366f1;
        }
        .n8n-msg-wrapper {
            display: flex;
            flex-direction: column;
            max-width: 85%;
        }
        .n8n-msg-wrapper-user {
            align-self: flex-end;
            align-items: flex-end;
        }
        .n8n-msg-wrapper-ai, .n8n-msg-wrapper-admin {
            align-self: flex-start;
            align-items: flex-start;
        }

        .n8n-typing {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
            background: #f1f5f9;
            border-radius: 16px;
            align-self: flex-start;
            width: fit-content;
        }
        .n8n-typing-dot {
            width: 8px;
            height: 8px;
            background: #94a3b8;
            border-radius: 50%;
            animation: typingBounce 1.4s infinite ease-in-out;
        }
        .n8n-typing-dot:nth-child(1) { animation-delay: 0s; }
        .n8n-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .n8n-typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingBounce { 0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

        .n8n-mode-badge {
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 10px;
            margin-left: 8px;
            font-weight: 600;
        }
        .n8n-mode-ai { background: rgba(16, 185, 129, 0.2); color: #059669; }
        .n8n-mode-human { background: rgba(239, 68, 68, 0.2); color: #dc2626; }

        /* Markdown Styles */
        .n8n-msg p { margin: 0 0 8px 0; }
        .n8n-msg p:last-child { margin-bottom: 0; }
        .n8n-msg strong { font-weight: 700; }
        .n8n-msg ul, .n8n-msg ol { margin: 8px 0; padding-left: 20px; }
        .n8n-msg li { margin-bottom: 4px; }
        .n8n-msg h1, .n8n-msg h2, .n8n-msg h3 { font-size: 1.1em; margin: 12px 0 8px 0; font-weight: 700; }

        /* Pre-chat Form Styles */
        .n8n-prechat-form {
            display: flex;
            flex-direction: column;
            padding: 24px;
            height: 100%;
            background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        }
        .n8n-prechat-title {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
        }
        .n8n-prechat-subtitle {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .n8n-prechat-field {
            margin-bottom: 16px;
        }
        .n8n-prechat-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
        }
        .n8n-prechat-input {
            width: 100%;
            padding: 12px 14px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
        }
        .n8n-prechat-input:focus {
            border-color: ${CONFIG.PRIMARY_COLOR};
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .n8n-prechat-input.error {
            border-color: #ef4444;
        }
        .n8n-prechat-error {
            font-size: 12px;
            color: #ef4444;
            margin-top: 4px;
            display: none;
        }
        .n8n-prechat-error.show {
            display: block;
        }
        .n8n-prechat-divider {
            display: flex;
            align-items: center;
            text-align: center;
            margin: 8px 0 16px;
            color: #94a3b8;
            font-size: 12px;
        }
        .n8n-prechat-divider::before,
        .n8n-prechat-divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #e2e8f0;
        }
        .n8n-prechat-divider span {
            padding: 0 12px;
        }
        .n8n-prechat-submit {
            background: ${CONFIG.PRIMARY_COLOR};
            color: white;
            border: none;
            padding: 14px 20px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
            margin-top: auto;
        }
        .n8n-prechat-submit:hover {
            background: #1d4ed8;
            transform: scale(1.02);
        }
        .n8n-prechat-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
    `;

    // ============================================
    // UI CREATION
    // ============================================
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const widget = document.createElement('div');
    widget.id = 'n8n-chat-widget';
    widget.innerHTML = `
        <div id="n8n-chat-window">
            <div class="n8n-chat-header">
                <div>
                    <div class="n8n-chat-header-title">${CONFIG.SITE_NAME}<span id="n8n-mode-badge" class="n8n-mode-badge n8n-mode-ai">AI</span></div>
                    <div class="n8n-chat-header-status" id="n8n-status">Online • Ready to help</div>
                </div>
                <button class="n8n-chat-close" id="n8n-chat-close">&times;</button>
            </div>
            <!-- Pre-chat Form -->
            <div id="n8n-prechat-container" class="n8n-prechat-form" style="${userInfo ? 'display: none;' : ''}">
                <div class="n8n-prechat-title">👋 Welcome!</div>
                <div class="n8n-prechat-subtitle">Please provide your email or phone number so we can reach you.</div>
                <form id="n8n-prechat-form">
                    <div class="n8n-prechat-field">
                        <label class="n8n-prechat-label" for="n8n-prechat-contact">Email or Phone Number *</label>
                        <input type="text" id="n8n-prechat-contact" class="n8n-prechat-input" placeholder="email@example.com or +1234567890" required>
                        <div class="n8n-prechat-error" id="n8n-prechat-contact-error">Please enter a valid email or phone number</div>
                    </div>
                    <button type="submit" class="n8n-prechat-submit">Start Chat</button>
                </form>
            </div>
            <!-- Chat Area -->
            <div id="n8n-chat-messages" class="n8n-chat-messages" style="${userInfo ? '' : 'display: none;'}"></div>
            <form id="n8n-chat-form" class="n8n-chat-input-area" style="${userInfo ? '' : 'display: none;'}">
                <input type="text" id="n8n-chat-input" class="n8n-chat-input" placeholder="Type your message..." autocomplete="off">
                <button type="submit" class="n8n-chat-send" id="n8n-chat-send">Send</button>
            </form>
        </div>
        <button id="n8n-chat-button">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </button>
    `;
    document.body.appendChild(widget);

    // ============================================
    // DOM REFERENCES
    // ============================================
    const chatWindow = document.getElementById('n8n-chat-window');
    const chatButton = document.getElementById('n8n-chat-button');
    const chatClose = document.getElementById('n8n-chat-close');
    const chatForm = document.getElementById('n8n-chat-form');
    const chatInput = document.getElementById('n8n-chat-input');
    const chatMessages = document.getElementById('n8n-chat-messages');
    const chatSend = document.getElementById('n8n-chat-send');
    const modeBadge = document.getElementById('n8n-mode-badge');
    const statusText = document.getElementById('n8n-status');

    // Pre-chat form elements
    const prechatContainer = document.getElementById('n8n-prechat-container');
    const prechatForm = document.getElementById('n8n-prechat-form');
    const prechatContact = document.getElementById('n8n-prechat-contact');

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    function getMetadata() {
        return {
            client_id: CONFIG.CLIENT_ID,
            site_name: CONFIG.SITE_NAME,
            host: window.location.origin,
            href: window.location.href,
            title: document.title,
            referrer: document.referrer || 'direct',
            user_agent: navigator.userAgent,
            language: navigator.language,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            // User info from pre-chat form
            user_contact: userInfo?.contact || null,
            user_email: userInfo?.email || null,
            user_phone: userInfo?.phone || null,
        };
    }

    // Helper function to scroll to bottom of messages
    function scrollToBottom(smooth = false) {
        if (smooth) {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Show chat interface after successful pre-chat form submission
    function showChatInterface() {
        prechatContainer.style.display = 'none';
        chatMessages.style.display = 'flex';
        chatForm.style.display = 'flex';
        // Scroll to bottom after a short delay to ensure rendering is complete
        setTimeout(() => scrollToBottom(), 100);
    }

    // Switch to a different session (for returning users)
    async function switchToSession(newSessionId, status = 'ai') {
        console.log(`🔄 Switching from session ${sessionId} to ${newSessionId}`);

        // Leave old socket room if connected
        if (socket) {
            socket.emit('leave_session', sessionId);
        }

        // Update session ID
        sessionId = newSessionId;
        localStorage.setItem('n8n_chat_session_id', sessionId);

        // Update mode
        sessionMode = status;
        localStorage.setItem('n8n_chat_mode', status);
        setMode(status);

        // Join new socket room
        if (socket) {
            socket.emit('join_session', sessionId);
        }

        // Clear existing messages
        chatMessages.innerHTML = '';

        // Load chat history for the new session
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}/messages`);
            const msgs = await response.json();
            msgs.forEach(m => {
                if (m.sender === 'user') {
                    addMessage('user', m.content);
                } else if (m.sender === 'admin') {
                    addMessage('admin', m.content);
                } else if (m.sender === 'ai') {
                    addMessage('ai', m.content);
                }
            });
            console.log(`✅ Loaded ${msgs.length} messages for session ${sessionId}`);
            // Scroll to bottom after loading all messages
            setTimeout(() => scrollToBottom(), 100);
        } catch (err) {
            console.error('Failed to load session history:', err);
        }
        chatInput.focus();
    }

    // Validate email format
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Validate phone format (basic: at least 7 digits)
    function isValidPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 7;
    }

    // Pre-chat form submission handler
    prechatForm.onsubmit = async (e) => {
        e.preventDefault();

        const contact = prechatContact.value.trim();

        // Reset error states
        prechatContact.classList.remove('error');
        document.getElementById('n8n-prechat-contact-error').classList.remove('show');

        // Validate - must be either valid email or valid phone
        const isEmail = isValidEmail(contact);
        const isPhone = isValidPhone(contact);

        if (!contact || (!isEmail && !isPhone)) {
            prechatContact.classList.add('error');
            document.getElementById('n8n-prechat-contact-error').classList.add('show');
            return;
        }

        // Save user info - determine if email or phone
        userInfo = {
            contact: contact,
            email: isEmail ? contact : null,
            phone: isPhone && !isEmail ? contact : null
        };
        localStorage.setItem('n8n_chat_user_info', JSON.stringify(userInfo));

        // Check for existing session by contact (session continuity)
        try {
            console.log(`🔍 Checking for existing session with contact: ${contact}`);
            const response = await fetch(`${CONFIG.API_URL}/api/sessions/by-contact/${encodeURIComponent(contact)}`);
            const data = await response.json();

            if (data.found && data.session) {
                // Returning user - restore previous session
                console.log(`✅ Found existing session: ${data.session.session_id}`);

                // Switch to the existing session
                await switchToSession(data.session.session_id, data.session.status || 'ai');

                // Show chat interface
                showChatInterface();

                // Show welcome back message
                addSystemMessage(`Welcome back! Your previous conversation has been restored.`);

                return;
            } else {
                console.log('📝 No existing session found, creating new session');
            }
        } catch (err) {
            console.error('Failed to check for existing session:', err);
            // Continue with new session flow on error
        }

        // New user flow - save user info to server
        try {
            await fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}/user-info`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userInfo)
            });
        } catch (err) {
            console.error('Failed to save user info to server:', err);
        }

        // Show chat interface
        showChatInterface();

        // Add welcome message
        addSystemMessage(`Welcome! How can we help you today?`);
    };

    function addMessage(sender, content) {
        removeTypingIndicator();

        // Create wrapper div for label + message
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = `n8n-msg-wrapper n8n-msg-wrapper-${sender}`;

        // Add label
        const labelDiv = document.createElement('div');
        labelDiv.className = `n8n-msg-label n8n-msg-label-${sender}`;
        if (sender === 'user') {
            labelDiv.innerText = 'You';
        } else if (sender === 'ai') {
            labelDiv.innerText = '🤖 AI Bot';
        } else if (sender === 'admin') {
            labelDiv.innerText = '👤 Support Agent';
        }
        wrapperDiv.appendChild(labelDiv);

        // Create message bubble
        const msgDiv = document.createElement('div');
        msgDiv.className = `n8n-msg n8n-msg-${sender}`;

        if (typeof marked !== 'undefined' && sender !== 'user') {
            msgDiv.innerHTML = marked.parse(content);
        } else {
            msgDiv.innerText = content;
        }

        wrapperDiv.appendChild(msgDiv);
        chatMessages.appendChild(wrapperDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addSystemMessage(content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'n8n-msg n8n-msg-system';
        msgDiv.innerText = content;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        if (isTyping) return;
        isTyping = true;
        const typing = document.createElement('div');
        typing.className = 'n8n-typing';
        typing.id = 'n8n-typing-indicator';
        typing.innerHTML = '<div class="n8n-typing-dot"></div><div class="n8n-typing-dot"></div><div class="n8n-typing-dot"></div>';
        chatMessages.appendChild(typing);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        isTyping = false;
        const typing = document.getElementById('n8n-typing-indicator');
        if (typing) typing.remove();
    }

    async function setMode(mode, syncToServer = false) {
        if (sessionMode === mode && !syncToServer) return;

        sessionMode = mode;
        localStorage.setItem('n8n_chat_mode', mode);

        if (mode === 'human') {
            modeBadge.textContent = 'HUMAN';
            modeBadge.className = 'n8n-mode-badge n8n-mode-human';
            statusText.textContent = 'Connected to human support';
        } else {
            modeBadge.textContent = 'AI';
            modeBadge.className = 'n8n-mode-badge n8n-mode-ai';
            statusText.textContent = 'Online • Ready to help';
        }

        if (syncToServer) {
            try {
                await fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: mode })
                });
            } catch (err) {
                console.error('Failed to sync mode to server:', err);
            }
        }
    }

    function setLoading(loading) {
        chatInput.disabled = loading;
        chatSend.disabled = loading;
    }

    // ============================================
    // SAVE MESSAGE TO DATABASE
    // ============================================
    async function saveMessageToDB(sender, content) {
        try {
            // Non-blocking for the UI
            fetch(`${CONFIG.API_URL}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    sender,
                    content,
                    metadata: getMetadata()
                })
            }).catch(err => console.error('Failed to save message:', err));
        } catch (err) {
            console.error('Failed to save message:', err);
        }
    }

    // ============================================
    // SEND TO N8N AI (via local proxy to avoid CORS)
    // ============================================
    async function sendToN8nAI(message) {
        try {
            console.log('📤 Sending to n8n via proxy:', { message });

            // Use local proxy to avoid CORS issues
            const response = await fetch(`${CONFIG.API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sendMessage',
                    sessionId: sessionId,
                    chatInput: message,
                    metadata: {
                        client_id: CONFIG.CLIENT_ID,
                        site_name: CONFIG.SITE_NAME,
                        ...getMetadata()
                    }
                })
            });

            if (!response.ok) {
                console.error('❌ Proxy Error:', response.status, response.statusText);
                throw new Error(`Chat request failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('🤖 AI Response:', data);

            // Handle response format - could be {output: "..."} or [{output: "..."}] or {text: "..."} or {result: "..."}
            let output = '';

            if (Array.isArray(data)) {
                const first = data[0];
                output = first.output || first.text || first.message || first.response || first.result || (typeof first === 'string' ? first : '');
            } else {
                output = data.output || data.text || data.message || data.response || data.result;
            }

            if (output) {
                return { output: output };
            } else {
                console.warn('⚠️ Unexpected response format:', data);
                // Try to stringify if it's not empty
                if (data && Object.keys(data).length > 0) {
                    return { output: typeof data === 'string' ? data : JSON.stringify(data) };
                }
                return { output: 'I received your message but got an empty response.' };
            }
        } catch (err) {
            console.error('❌ AI Error:', err);
            throw err;
        }
    }

    // ============================================
    // HANDLE FORM SUBMIT
    // ============================================
    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content) return;

        // Show user message immediately
        addMessage('user', content);
        chatInput.value = '';
        setLoading(true);

        // Save user message to database
        await saveMessageToDB('user', content);

        // Check if user wants to chat with human
        const humanPhrases = ['chat with human', 'talk to human', 'speak with human', 'human agent', 'real person', 'live agent', 'talk to someone', 'human support'];
        const wantsHuman = humanPhrases.some(phrase => content.toLowerCase().includes(phrase));

        if (sessionMode === 'ai') {
            // AI MODE: Send to n8n webhook
            showTypingIndicator();
            try {
                const aiResponse = await sendToN8nAI(content);
                removeTypingIndicator();

                if (aiResponse && aiResponse.output) {
                    // Display AI response
                    addMessage('ai', aiResponse.output);

                    // Save AI response to database only if not already saved by API
                    if (!aiResponse.saved) {
                        await saveMessageToDB('ai', aiResponse.output);
                    }

                    // Check if this is a human handoff response
                    if (aiResponse.handoff || wantsHuman) {
                        setMode('human', true); // Sync to server
                        addSystemMessage('🔄 Switched to human support mode. Our team will respond shortly!');
                    }
                } else {
                    throw new Error('Invalid AI response');
                }
            } catch (err) {
                removeTypingIndicator();
                addSystemMessage('⚠️ AI unavailable. Connecting to human support...');
                setMode('human');
            }
        } else {
            // HUMAN MODE: Message already saved, will be picked up by dashboard via socket
            statusText.textContent = 'Message sent • Waiting for response...';
        }

        setLoading(false);
    };

    // ============================================
    // SOCKET.IO INITIALIZATION
    // ============================================
    function initSocket() {
        socket = io(CONFIG.API_URL);
        socket.emit('join_session', sessionId);

        // Fetch actual session status from server (admin-managed)
        // This is the single source of truth — overrides localStorage
        fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}`)
            .then(res => {
                if (!res.ok) throw new Error('Session not found');
                return res.json();
            })
            .then(session => {
                if (session && session.status) {
                    sessionMode = session.status;
                    localStorage.setItem('n8n_chat_mode', session.status);
                    // Force update the UI (bypass the early return check)
                    modeBadge.textContent = session.status === 'human' ? 'HUMAN' : 'AI';
                    modeBadge.className = `n8n-mode-badge n8n-mode-${session.status === 'human' ? 'human' : 'ai'}`;
                    statusText.textContent = session.status === 'human'
                        ? 'Connected to human support'
                        : 'Online • Ready to help';
                    console.log(`📋 Session mode from server: ${session.status}`);
                }
            })
            .catch(err => {
                console.warn('Could not fetch session status, using default:', err);
            });

        // Load chat history
        fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}/messages`)
            .then(res => res.json())
            .then(msgs => {
                msgs.forEach(m => {
                    if (m.sender === 'user') {
                        addMessage('user', m.content);
                    } else if (m.sender === 'admin') {
                        addMessage('admin', m.content);
                    } else if (m.sender === 'ai') {
                        addMessage('ai', m.content);
                    }
                });
                // Scroll to bottom after loading all messages
                setTimeout(() => scrollToBottom(), 100);
            })
            .catch(err => console.error('Failed to load history:', err));

        // Listen for status changes (e.g. from admin)
        socket.on('status_change', (data) => {
            if (data.sessionId === sessionId) {
                setMode(data.status);
            }
        });

        // Listen for new messages (from human agents)
        socket.on('new_message', (msg) => {
            if (msg.sessionId === sessionId && msg.sender === 'admin') {
                addMessage('admin', msg.content);
                statusText.textContent = 'Agent replied • Connected';
                setMode('human'); // Automatically switch to human mode if admin replies
            }
        });
    }

    // ============================================
    // TOGGLE HANDLERS
    // ============================================
    chatButton.onclick = () => {
        chatWindow.classList.toggle('open');
        // Scroll to bottom when opening the chat
        if (chatWindow.classList.contains('open')) {
            setTimeout(() => scrollToBottom(), 100);
        }
    };
    chatClose.onclick = () => chatWindow.classList.remove('open');

    // ============================================
    // LOAD DEPENDENCIES AND INITIALIZE
    // ============================================
    function loadScripts(urls, callback) {
        let loaded = 0;
        urls.forEach(url => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                loaded++;
                if (loaded === urls.length) callback();
            };
            document.head.appendChild(script);
        });
    }

    loadScripts([CONFIG.SOCKET_IO_CDN, CONFIG.MARKED_CDN], () => {
        initSocket();

        // Configure marked to be safe
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true
            });
        }
    });

    // Initialize mode display with localStorage value (will be overridden by server)
    // This just prevents a blank badge before the server responds
    if (sessionMode === 'human') {
        modeBadge.textContent = 'HUMAN';
        modeBadge.className = 'n8n-mode-badge n8n-mode-human';
        statusText.textContent = 'Connected to human support';
    } else {
        modeBadge.textContent = 'AI';
        modeBadge.className = 'n8n-mode-badge n8n-mode-ai';
        statusText.textContent = 'Online • Ready to help';
    }

})();
