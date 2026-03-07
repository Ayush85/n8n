(function () {
    // ============================================
    // CONFIGURATION - Customize these values
    // ============================================
    const CONFIG = {
        API_URL: window.N8N_CHAT_API_URL || 'http://localhost:3001',
        N8N_WEBHOOK_URL: window.N8N_CHAT_WEBHOOK_URL || 'https://n8n.aydexis.com/webhook/9a20ec1a-f508-419f-9194-ba933299ddff/chat',
        CLIENT_ID: window.N8N_CHAT_CLIENT_ID || 'client_1',
        SITE_NAME: window.N8N_CHAT_SITE_NAME || 'Fatafat Sewa',
        PRIMARY_COLOR: window.N8N_CHAT_PRIMARY_COLOR || '#0f67b2',
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

        /* ====================================
           TAB BAR
        ====================================== */
        .n8n-tab-bar {
            display: none;
            align-items: stretch;
            background: #fff;
            border-bottom: 2px solid #e2e8f0;
            flex-shrink: 0;
        }
        .n8n-tab-bar.visible { display: flex; }
        .n8n-tab {
            flex: 1;
            padding: 10px 0;
            background: none;
            border: none;
            border-bottom: 3px solid transparent;
            margin-bottom: -2px;
            font-size: 12px;
            font-weight: 600;
            color: #94a3b8;
            cursor: pointer;
            transition: color 0.2s, border-color 0.2s;
            letter-spacing: 0.01em;
        }
        .n8n-tab:hover { color: #475569; }
        .n8n-tab.active { color: #0f67b2; border-bottom-color: #0f67b2; }
        .n8n-tab-panel { display: none; flex-direction: column; flex: 1; overflow: hidden; }
        .n8n-tab-panel.active { display: flex; }

        /* ====================================
           CHAT ACTION BAR (top of Chat panel)
        ====================================== */
        .n8n-chat-action-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 14px;
            background: #f8fafc;
            border-bottom: 1px solid #e8eef4;
            flex-shrink: 0;
        }
        .n8n-active-session-label {
            flex: 1;
            font-size: 11px;
            color: #64748b;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ====================================
           HISTORY PANEL
        ====================================== */
        .n8n-history-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            border-bottom: 1px solid #e8eef4;
            background: #f8fafc;
            flex-shrink: 0;
        }
        .n8n-history-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        /* Shared New Chat button */
        .n8n-new-chat-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: #0f67b2;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s, transform 0.15s;
            white-space: nowrap;
        }
        .n8n-new-chat-btn:hover { background: #0a56a0; transform: scale(1.02); }
        .n8n-new-chat-btn:active { transform: scale(0.98); }
        .n8n-new-chat-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        /* Session list */
        .n8n-session-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .n8n-session-item {
            display: flex;
            flex-direction: column;
            padding: 11px 16px;
            cursor: pointer;
            border-bottom: 1px solid #f1f5f9;
            transition: background 0.15s;
            gap: 4px;
        }
        .n8n-session-item:hover { background: #f0f7ff; }
        .n8n-session-item.active-session {
            background: #e8f4ff;
            border-left: 3px solid #0f67b2;
            padding-left: 13px;
        }
        .n8n-session-item:last-child { border-bottom: none; }
        .n8n-session-item-title {
            font-size: 13px;
            font-weight: 600;
            color: #1e293b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .n8n-session-item-meta {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 11px;
            color: #94a3b8;
        }
        .n8n-session-item-badge {
            padding: 2px 6px;
            border-radius: 5px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .n8n-badge-ai   { background: rgba(16,185,129,0.12); color: #059669; }
        .n8n-badge-human { background: rgba(239,68,68,0.12); color: #dc2626; }
        .n8n-session-empty {
            padding: 40px 16px;
            text-align: center;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.6;
        }
        @media (max-width: 768px) {
            #n8n-chat-window {
                width: 340px;
                height: 500px;
            }
        }

        /* ====== RESPONSIVE: Mobile (≤480px) ====== */
        @media (max-width: 480px) {
            #n8n-chat-widget {
                bottom: 0;
                right: 0;
                left: 0;
                top: 0;
                pointer-events: none;
            }
            #n8n-chat-button {
                pointer-events: auto;
                position: fixed;
                bottom: 16px;
                right: 16px;
                width: 52px;
                height: 52px;
            }
            #n8n-chat-button svg {
                width: 24px;
                height: 24px;
            }
            /* Hide the toggle button when chat is open */
            #n8n-chat-window.open ~ #n8n-chat-button {
                display: none !important;
            }
            #n8n-chat-window {
                pointer-events: auto;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100%;
                height: 100%;
                border-radius: 0;
                border: none;
                box-shadow: none;
            }
            .n8n-chat-header {
                padding: 14px 16px;
                padding-top: max(14px, env(safe-area-inset-top));
            }
            .n8n-chat-header-title {
                font-size: 15px;
            }
            .n8n-chat-messages {
                padding: 14px;
                gap: 10px;
            }
            .n8n-chat-input-area {
                padding: 10px 12px;
                padding-bottom: max(10px, env(safe-area-inset-bottom));
                gap: 8px;
                align-items: center;
            }
            .n8n-chat-input {
                flex: 1;
                min-width: 0;
                padding: 10px 14px;
                font-size: 16px; /* Prevents iOS zoom on focus */
            }
            .n8n-chat-send {
                padding: 10px 18px;
                font-size: 14px;
                border-radius: 12px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .n8n-msg {
                max-width: 90%;
                padding: 10px 14px;
                font-size: 14px;
            }
            .n8n-msg-wrapper {
                max-width: 90%;
            }
            .n8n-prechat-form {
                padding: 20px 16px;
            }
            .n8n-prechat-title {
                font-size: 16px;
            }
            .n8n-prechat-subtitle {
                font-size: 12px;
                margin-bottom: 20px;
            }
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
            <!-- Header (always visible) -->
            <div class="n8n-chat-header">
                <div>
                    <div class="n8n-chat-header-title">${CONFIG.SITE_NAME}<span id="n8n-mode-badge" class="n8n-mode-badge n8n-mode-ai">AI</span></div>
                    <div class="n8n-chat-header-status" id="n8n-status">Online &bull; Ready to help</div>
                </div>
                <button class="n8n-chat-close" id="n8n-chat-close">&times;</button>
            </div>

            <!-- Tab Bar (hidden until user logs in) -->
            <div class="n8n-tab-bar" id="n8n-tab-bar">
                <button class="n8n-tab active" id="n8n-tab-chat" data-tab="chat">💬 Chat</button>
                <button class="n8n-tab" id="n8n-tab-history" data-tab="history">📋 History</button>
            </div>

            <!-- Pre-chat Form (shown to new users) -->
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

            <!-- TAB PANEL: Chat -->
            <div class="n8n-tab-panel active" id="n8n-panel-chat" style="${userInfo ? '' : 'display: none;'}">
                <div class="n8n-chat-action-bar" id="n8n-chat-action-bar">
                    <span class="n8n-active-session-label" id="n8n-active-session-title"></span>
                    <button class="n8n-new-chat-btn" id="n8n-new-chat-btn-chat">+ New Chat</button>
                </div>
                <div id="n8n-chat-messages" class="n8n-chat-messages"></div>
                <form id="n8n-chat-form" class="n8n-chat-input-area">
                    <input type="text" id="n8n-chat-input" class="n8n-chat-input" placeholder="Type your message..." autocomplete="off">
                    <button type="submit" class="n8n-chat-send" id="n8n-chat-send">Send</button>
                </form>
            </div>

            <!-- TAB PANEL: History -->
            <div class="n8n-tab-panel" id="n8n-panel-history" style="${userInfo ? '' : 'display: none;'}">
                <div class="n8n-history-header">
                    <span class="n8n-history-title">Your Conversations</span>
                    <button class="n8n-new-chat-btn" id="n8n-new-chat-btn">+ New Chat</button>
                </div>
                <div class="n8n-session-list" id="n8n-session-list"></div>
            </div>
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

    // Tab bar elements
    const tabBar = document.getElementById('n8n-tab-bar');
    const tabChat = document.getElementById('n8n-tab-chat');
    const tabHistory = document.getElementById('n8n-tab-history');
    const panelChat = document.getElementById('n8n-panel-chat');
    const panelHistory = document.getElementById('n8n-panel-history');

    // Session/history panel elements
    const sessionList = document.getElementById('n8n-session-list');
    const newChatBtn = document.getElementById('n8n-new-chat-btn');

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

    // Switch between tabs
    function switchTab(tab) {
        if (tab === 'chat') {
            tabChat.classList.add('active');
            tabHistory.classList.remove('active');
            panelChat.style.display = 'flex';
            panelHistory.style.display = 'none';
            setTimeout(() => scrollToBottom(), 50);
        } else {
            tabHistory.classList.add('active');
            tabChat.classList.remove('active');
            panelHistory.style.display = 'flex';
            panelChat.style.display = 'none';
            // Refresh history list when switching to history tab
            if (userInfo?.contact) refreshHistoryList();
        }
    }

    tabChat.addEventListener('click', () => switchTab('chat'));
    tabHistory.addEventListener('click', () => switchTab('history'));

    // Populate + refresh the History tab session list
    async function refreshHistoryList() {
        sessionList.innerHTML = '<div class="n8n-session-empty">Loading...</div>';
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/sessions/by-contact/${encodeURIComponent(userInfo.contact)}`);
            const data = await res.json();
            renderSessionList(data.sessions || []);
        } catch (e) {
            sessionList.innerHTML = '<div class="n8n-session-empty">Failed to load history.</div>';
        }
    }

    // Show chat interface after successful pre-chat form submission
    function showChatInterface() {
        prechatContainer.style.display = 'none';
        // Show tab bar and activate chat panel
        tabBar.classList.add('visible');
        panelChat.style.display = 'flex';
        panelHistory.style.display = 'none';
        tabChat.classList.add('active');
        tabHistory.classList.remove('active');
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

    // ============================================
    // SESSION PICKER HELPERS
    // ============================================

    function formatRelativeDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return d.toLocaleDateString();
    }

    // Render sessions into the History tab list
    function renderSessionList(sessions) {
        sessionList.innerHTML = '';
        if (sessions.length === 0) {
            sessionList.innerHTML = '<div class="n8n-session-empty">No conversations yet. Start a new chat!</div>';
            return;
        }
        sessions.forEach(s => {
            const title = s.title || s.first_message?.slice(0, 55) || 'Untitled Chat';
            const date = formatRelativeDate(s.last_message_at || s.updated_at);
            const badgeClass = s.status === 'human' ? 'n8n-badge-human' : 'n8n-badge-ai';
            const badgeLabel = s.status === 'human' ? 'Human' : 'AI';
            const isActive = s.session_id === sessionId;

            const item = document.createElement('div');
            item.className = 'n8n-session-item' + (isActive ? ' active-session' : '');
            item.innerHTML = `
                <div class="n8n-session-item-title">${isActive ? '▶ ' : ''}${title}</div>
                <div class="n8n-session-item-meta">
                    <span>${date}</span>
                    <span class="n8n-session-item-badge ${badgeClass}">${badgeLabel}</span>
                </div>
            `;
            item.addEventListener('click', () => openSession(s));
            sessionList.appendChild(item);
        });
    }

    async function openSession(s) {
        await switchToSession(s.session_id, s.status || 'ai');
        switchTab('chat');
    }

    async function startNewChat() {
        try {
            newChatBtn.disabled = true;
            newChatBtn.textContent = 'Creating...';
            const resp = await fetch(`${CONFIG.API_URL}/api/sessions/new`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contact: userInfo.contact, customerName: userInfo.contact })
            });
            const data = await resp.json();
            if (!data.session_id) throw new Error('No session_id returned');

            // Switch to new session
            sessionId = data.session_id;
            localStorage.setItem('n8n_chat_session_id', sessionId);
            sessionMode = 'ai';
            localStorage.setItem('n8n_chat_mode', 'ai');
            if (socket) socket.emit('join_session', sessionId);

            chatMessages.innerHTML = '';
            setMode('ai');
            switchTab('chat');
            addSystemMessage('New conversation started. How can we help you?');
        } catch (err) {
            console.error('Failed to create new session:', err);
            newChatBtn.textContent = '+ New Chat';
        } finally {
            newChatBtn.disabled = false;
            newChatBtn.textContent = '+ New Chat';
        }
    }

    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    // New Chat button inside the Chat panel
    const newChatBtnChat = document.getElementById('n8n-new-chat-btn-chat');
    if (newChatBtnChat) newChatBtnChat.addEventListener('click', startNewChat);

    // ✏️ Header "New Chat" button — start a fresh session from within the chat
    const headerNewChatBtn = document.getElementById('n8n-header-new-chat');
    if (headerNewChatBtn) headerNewChatBtn.addEventListener('click', startNewChat);

    // ☰ Header "My Chats" button — go back to session picker
    const headerMyChatsBtn = document.getElementById('n8n-header-my-chats');
    if (headerMyChatsBtn) headerMyChatsBtn.addEventListener('click', async () => {
        if (!userInfo?.contact) return;
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/sessions/by-contact/${encodeURIComponent(userInfo.contact)}`);
            const data = await res.json();
            showSessionPicker(data.sessions || []);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    });

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

        // Save user info
        userInfo = {
            contact: contact,
            email: isEmail ? contact : null,
            phone: isPhone && !isEmail ? contact : null
        };
        localStorage.setItem('n8n_chat_user_info', JSON.stringify(userInfo));

        const submitBtn = prechatForm.querySelector('.n8n-prechat-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Loading...';

        // Fetch ALL sessions for this contact
        try {
            console.log(`🔍 Fetching sessions for contact: ${contact}`);
            const response = await fetch(`${CONFIG.API_URL}/api/sessions/by-contact/${encodeURIComponent(contact)}`);
            const data = await response.json();
            const sessions = data.sessions || [];

            if (sessions.length === 1) {
                // Exactly one session — restore it directly (no picker needed)
                console.log(`✅ Single session found, restoring: ${sessions[0].session_id}`);
                await switchToSession(sessions[0].session_id, sessions[0].status || 'ai');
                showChatInterface();
                return;
            }

            if (sessions.length > 1) {
                // Multiple sessions — show picker
                console.log(`📋 ${sessions.length} sessions found, showing picker`);
                showSessionPicker(sessions);
                return;
            }

            // No existing sessions — new user flow
            console.log('📝 No existing sessions, starting fresh');
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Start Chat';
        }

        // New user: save user info then start chat
        try {
            await fetch(`${CONFIG.API_URL}/api/sessions/${sessionId}/user-info`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userInfo)
            });
        } catch (err) {
            console.error('Failed to save user info:', err);
        }

        showChatInterface();
        addSystemMessage('Welcome! How can we help you today?');
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

        // If this is a returning user (already logged in), show the tabs immediately
        if (userInfo) {
            showChatInterface(); // makes tab bar visible, shows chat panel
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
