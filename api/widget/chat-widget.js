(function () {
    // ============================================
    // CONFIGURATION - Auto-detect API URL
    // ============================================
    const getApiUrl = () => {
        // 1. Check if explicitly set
        if (window.N8N_CHAT_API_URL) return window.N8N_CHAT_API_URL;
        
        // 2. Try to detect from the script's src (works for third-party embeds)
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            if (script.src && script.src.includes('chat-widget.js')) {
                const url = new URL(script.src);
                return `${url.protocol}//${url.host}`;
            }
        }
        
        // 3. Localhost default
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        
        // 4. Fallback to current domain
        return window.location.origin;
    };

    const CONFIG = {
        API_URL: getApiUrl(),
        CLIENT_ID: window.N8N_CHAT_CLIENT_ID || 'client_1',
        SITE_NAME: window.N8N_CHAT_SITE_NAME || 'Fatafat Sewa',
        PRIMARY_COLOR: window.N8N_CHAT_PRIMARY_COLOR || '#0f67b2',
        WEB_PUSH_PUBLIC_KEY: window.N8N_CHAT_WEB_PUSH_PUBLIC_KEY || null,
        PUSH_SW_PATH: window.N8N_CHAT_PUSH_SW_PATH || '/widget/push-sw.js',
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
    let userInfo = JSON.parse(localStorage.getItem('n8n_chat_user_info') || 'null'); // {email, phone, name}
    let alertAudioCtx = null;
    let pendingUserDeliveryQueue = [];
    const userMessageStatusEls = new Map();
    let unreadCount = parseInt(localStorage.getItem('n8n_chat_unread') || '0', 10);
    let pushRegistration = null;
    let cachedPushPublicKey = null;
    let lastAiMessage = { content: '', at: 0 };

    // Global reset function (call from console: n8nChatReset())
    window.n8nChatReset = function () {
        localStorage.removeItem('n8n_chat_session_id');
        localStorage.removeItem('n8n_chat_mode');
        localStorage.removeItem('n8n_chat_user_info');
        localStorage.removeItem('n8n_chat_unread');
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
        #n8n-chat-button.hidden {
            opacity: 0;
            pointer-events: none;
            transform: scale(0.85);
        }
        .n8n-unread-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            min-width: 20px;
            height: 20px;
            padding: 0 5px;
            border-radius: 10px;
            background: #ef4444;
            color: white;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
            animation: n8nBadgePulse 2s ease-in-out infinite;
            pointer-events: none;
        }
        .n8n-unread-badge.hidden { display: none; }
        @keyframes n8nBadgePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        
        #n8n-chat-window {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 400px;
            height: 680px;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        #n8n-chat-window.open {
            display: flex;
            bottom: 0;
            animation: slideUp 0.3s ease;
        }
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
            flex-direction: column;
            gap: 8px;
            background: #ffffff;
        }
        .n8n-input-row {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        /* Paste preview strip */
        .n8n-paste-preview {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #f0f7ff;
            border: 1px solid #bfdbfe;
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 12px;
            color: #1e40af;
        }
        .n8n-paste-preview img {
            width: 48px;
            height: 48px;
            object-fit: cover;
            border-radius: 6px;
            flex-shrink: 0;
        }
        .n8n-paste-preview-name {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 600;
        }
        .n8n-paste-cancel {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            color: #64748b;
            padding: 2px 4px;
            border-radius: 4px;
            flex-shrink: 0;
        }
        .n8n-paste-cancel:hover { color: #ef4444; }
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
            width: 44px;
            height: 44px;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.2s;
        }
        .n8n-chat-send:hover { background: #1d4ed8; transform: scale(1.05); }
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
            border-radius: 12px;
            text-align: center;
            line-height: 1.6;
        }
        .n8n-msg-system a {
            color: #0f67b2;
            font-weight: 600;
            text-decoration: none;
        }
        .n8n-msg-system a:hover { text-decoration: underline; }
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
        .n8n-msg-time {
            font-size: 10px;
            font-weight: 400;
            opacity: 0.5;
            margin-left: 6px;
            white-space: nowrap;
        }
        .n8n-msg-status {
            font-size: 10px;
            font-weight: 600;
            margin-left: 6px;
            opacity: 0.8;
            white-space: nowrap;
        }

        /* ====== SUGGESTION CHIPS ====== */
        .n8n-suggestions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 14px 6px;
            flex-shrink: 0;
            background: #ffffff;
            border-top: 1px solid #f1f5f9;
        }
        .n8n-suggestions.hidden { display: none; }
        .n8n-suggestion-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #f0f7ff;
            border: 1.5px solid #bfdbfe;
            color: #1e40af;
            border-radius: 20px;
            padding: 6px 13px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s;
            line-height: 1;
            font-family: inherit;
        }
        .n8n-suggestion-chip:hover {
            background: #dbeafe;
            border-color: #93c5fd;
            transform: translateY(-1px);
        }
        .n8n-suggestion-chip.human {
            background: #fff1f2;
            border-color: #fecdd3;
            color: #be123c;
        }
        .n8n-suggestion-chip.human:hover {
            background: #ffe4e6;
            border-color: #fda4af;
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

        /* File attachment button */
        .n8n-attach-btn {
            background: #f1f5f9;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .n8n-attach-btn:hover { background: #e2e8f0; border-color: #cbd5e1; }
        .n8n-attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* File message rendering */
        .n8n-file-msg { display: flex; flex-direction: column; gap: 6px; }
        .n8n-file-img {
            max-width: 220px;
            max-height: 180px;
            border-radius: 10px;
            object-fit: cover;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .n8n-file-img:hover { opacity: 0.85; }
        .n8n-file-doc {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.25);
            border: 1px solid rgba(255,255,255,0.4);
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 13px;
            text-decoration: none;
            color: inherit;
            font-weight: 600;
            transition: background 0.2s;
        }
        .n8n-msg-ai .n8n-file-doc, .n8n-msg-admin .n8n-file-doc {
            background: rgba(0,0,0,0.06);
            border-color: rgba(0,0,0,0.12);
            color: #1e293b;
        }
        .n8n-file-doc:hover { background: rgba(255,255,255,0.4); }
        .n8n-file-name { max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .n8n-upload-progress {
            font-size: 12px;
            opacity: 0.8;
            font-style: italic;
        }

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
                width: 360px;
                height: 620px;
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
                gap: 6px;
            }
            .n8n-input-row {
                align-items: center;
            }
            .n8n-chat-input {
                flex: 1;
                min-width: 0;
                padding: 10px 14px;
                font-size: 16px; /* Prevents iOS zoom on focus */
            }
            .n8n-chat-send {
                width: 44px;
                height: 44px;
                padding: 0;
                border-radius: 12px;
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

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i += 1) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function fetchPushPublicKey() {
        if (cachedPushPublicKey) return cachedPushPublicKey;
        if (CONFIG.WEB_PUSH_PUBLIC_KEY) {
            cachedPushPublicKey = CONFIG.WEB_PUSH_PUBLIC_KEY;
            return cachedPushPublicKey;
        }

        try {
            const response = await fetch(`${CONFIG.API_URL}/api/push/public-key`);
            if (!response.ok) return null;
            const data = await response.json();
            if (!data?.publicKey) return null;
            cachedPushPublicKey = data.publicKey;
            return cachedPushPublicKey;
        } catch (err) {
            console.warn('Unable to fetch web-push public key:', err);
            return null;
        }
    }

    async function ensurePushServiceWorker() {
        if (!window.isSecureContext) return null;
        if (!('serviceWorker' in navigator)) return null;
        if (pushRegistration) return pushRegistration;

        try {
            pushRegistration = await navigator.serviceWorker.register(CONFIG.PUSH_SW_PATH, { scope: '/' });
            return pushRegistration;
        } catch (err) {
            console.warn('Push service worker registration failed:', err);
            return null;
        }
    }

    const syncPushIdentity = async () => {
        if (!window.isSecureContext) return false;
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        if (!userInfo?.contact) return false;

        const [registration, publicKey] = await Promise.all([
            ensurePushServiceWorker(),
            fetchPushPublicKey(),
        ]);

        if (!registration || !registration.pushManager || !publicKey) return false;

        try {
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey),
                });
            }

            const response = await fetch(`${CONFIG.API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'user',
                    sessionId,
                    userContact: userInfo.contact,
                    externalId: sessionId,
                    subscription: subscription.toJSON(),
                }),
            });

            if (!response.ok) {
                console.warn('Push subscribe API request failed with status:', response.status);
                return false;
            }

            return true;
        } catch (err) {
            console.warn('Failed to sync user push subscription:', err);
            return false;
        }
    };

    const ensurePushPermissionPrompt = async () => {
        if (!window.isSecureContext) return;
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'default') return;

        const promptKey = 'n8n_chat_push_prompted_v1';
        if (localStorage.getItem(promptKey)) return;
        localStorage.setItem(promptKey, '1');

        try {
            await Notification.requestPermission();
        } catch (err) {
            console.warn('Notification permission request failed:', err);
        }
    };

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
                <button class="n8n-tab active" id="n8n-tab-chat" data-tab="chat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px;margin-right:5px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Chat</button>
                <button class="n8n-tab" id="n8n-tab-history" data-tab="history"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px;margin-right:5px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>History</button>
            </div>

            <!-- Pre-chat Form (shown to new users) -->
            <div id="n8n-prechat-container" class="n8n-prechat-form" style="${userInfo ? 'display: none;' : ''}">
                <div class="n8n-prechat-title">Welcome!</div>
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
                <div id="n8n-suggestions" class="n8n-suggestions hidden"></div>
                <form id="n8n-chat-form" class="n8n-chat-input-area">
                    <input type="file" id="n8n-file-input" accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx" style="display:none">
                    <div id="n8n-paste-preview" style="display:none" class="n8n-paste-preview">
                        <img id="n8n-paste-thumb" src="" alt="">
                        <span class="n8n-paste-preview-name" id="n8n-paste-name"></span>
                        <button type="button" class="n8n-paste-cancel" id="n8n-paste-cancel" title="Remove">×</button>
                    </div>
                    <div class="n8n-input-row">
                        <button type="button" id="n8n-attach-btn" class="n8n-attach-btn" title="Attach file"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
                        <input type="text" id="n8n-chat-input" class="n8n-chat-input" placeholder="Type a message or paste image..." autocomplete="off">
                        <button type="submit" class="n8n-chat-send" id="n8n-chat-send" title="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                    </div>
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
            <span id="n8n-unread-badge" class="n8n-unread-badge hidden"></span>
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

    // File upload elements
    const fileInput = document.getElementById('n8n-file-input');
    const attachBtn = document.getElementById('n8n-attach-btn');
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput && fileInput.click());

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
        syncPushIdentity();
        ensurePushPermissionPrompt();
        setTimeout(() => { scrollToBottom(); showInitialSuggestions(); }, 100);
    }

    // Show session picker (multiple sessions found) — opens History tab pre-populated
    function showSessionPicker(sessions) {
        prechatContainer.style.display = 'none';
        tabBar.classList.add('visible');
        // Render sessions into the list first
        renderSessionList(sessions);
        // Then switch to History tab
        tabHistory.classList.add('active');
        tabChat.classList.remove('active');
        panelHistory.style.display = 'flex';
        panelChat.style.display = 'none';
    }

    // Switch to a different session (for returning users)
    async function switchToSession(newSessionId, status = 'ai') {
        // Leave old socket room if connected
        if (socket) {
            socket.emit('leave_session', sessionId);
        }

        // Update session ID
        sessionId = newSessionId;
        localStorage.setItem('n8n_chat_session_id', sessionId);
        syncPushIdentity();

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
                    addMessage('user', m.content, m.created_at);
                } else if (m.sender === 'admin') {
                    addMessage('admin', m.content, m.created_at);
                } else if (m.sender === 'ai') {
                    addMessage('ai', m.content, m.created_at);
                }
            });
            // Scroll to bottom after loading all messages
            setTimeout(() => scrollToBottom(), 100);
            if (msgs.length === 0) {
                setTimeout(() => showInitialSuggestions(), 120);
            } else {
                showHumanSuggestionOnly();
            }
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
                <div class="n8n-session-item-title">${isActive ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="display:inline;vertical-align:-1px;margin-right:4px;color:#0f67b2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : ''}${title}</div>
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
            showInitialSuggestions();
        } catch (err) {
            console.error('Failed to create new session:', err);
            newChatBtn.textContent = '+ New Chat';
        } finally {
            newChatBtn.disabled = false;
            newChatBtn.textContent = '+ New Chat';
        }
    }

    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    // ============================================
    // FILE UPLOAD HANDLER (shared)
    // ============================================
    async function uploadFile(file) {
        // Show progress placeholder
        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'n8n-msg-wrapper n8n-msg-wrapper-user';
        const progressLabel = document.createElement('div');
        progressLabel.className = 'n8n-msg-label n8n-msg-label-user';
        progressLabel.innerText = 'You';
        const progressBubble = document.createElement('div');
        progressBubble.className = 'n8n-msg n8n-msg-user';
        progressBubble.innerHTML = `<span class="n8n-upload-progress">📎 Uploading ${file.name}...</span>`;
        progressWrapper.appendChild(progressLabel);
        progressWrapper.appendChild(progressBubble);
        chatMessages.appendChild(progressWrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (attachBtn) attachBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('sessionId', sessionId);

            const resp = await fetch(`${CONFIG.API_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(err.error || `Upload failed: ${resp.status}`);
            }

            const result = await resp.json();
            progressWrapper.remove();

            const payload = JSON.stringify({
                fileUrl: result.fileUrl,
                fileName: result.fileName,
                fileType: result.fileType,
                fileSize: result.fileSize
            });
            addMessage('user', payload);

        } catch (err) {
            progressBubble.innerHTML = `<span style="color:#fca5a5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Upload failed: ${err.message}</span>`;
            console.error('File upload error:', err);
        } finally {
            if (attachBtn) attachBtn.disabled = false;
        }
    }

    // File input change (📎 button)
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;
            fileInput.value = '';
            await uploadFile(file);
        });
    }

    // ============================================
    // PASTE PREVIEW (clipboard images)
    // ============================================
    let pendingPasteFile = null;
    const pastePreviewEl = document.getElementById('n8n-paste-preview');
    const pasteThumbEl   = document.getElementById('n8n-paste-thumb');
    const pasteNameEl    = document.getElementById('n8n-paste-name');
    const pasteCancelBtn = document.getElementById('n8n-paste-cancel');

    function showPastePreview(file) {
        pendingPasteFile = file;
        pasteNameEl.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => { pasteThumbEl.src = ev.target.result; };
        reader.readAsDataURL(file);
        pastePreviewEl.style.display = 'flex';
        chatInput.placeholder = 'Add a caption (optional)...';
        chatInput.focus();
    }

    function clearPastePreview() {
        pendingPasteFile = null;
        pastePreviewEl.style.display = 'none';
        pasteThumbEl.src = '';
        pasteNameEl.textContent = '';
        chatInput.placeholder = 'Type a message or paste image...';
    }

    if (pasteCancelBtn) pasteCancelBtn.addEventListener('click', clearPastePreview);

    // Listen for paste on the input and message area
    chatMessages.addEventListener('paste', handlePaste);
    chatInput.addEventListener('paste', handlePaste);

    function handlePaste(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault();
                const ext = item.type === 'image/png' ? '.png' : item.type === 'image/gif' ? '.gif' : item.type === 'image/webp' ? '.webp' : '.jpg';
                const blob = item.getAsFile();
                const file = new File([blob], `screenshot${ext}`, { type: item.type });
                showPastePreview(file);
                return;
            }
        }
    }

    // New Chat button inside the Chat panel
    const newChatBtnChat = document.getElementById('n8n-new-chat-btn-chat');
    if (newChatBtnChat) newChatBtnChat.addEventListener('click', startNewChat);

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
        syncPushIdentity();

        const submitBtn = prechatForm.querySelector('.n8n-prechat-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Loading...';

        // Fetch ALL sessions for this contact
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/sessions/by-contact/${encodeURIComponent(contact)}`);
            const data = await response.json();
            const sessions = data.sessions || [];

            if (sessions.length === 1) {
                // Exactly one session — restore it directly (no picker needed)
                await switchToSession(sessions[0].session_id, sessions[0].status || 'ai');
                showChatInterface();
                return;
            }

            if (sessions.length > 1) {
                // Multiple sessions — show picker
                showSessionPicker(sessions);
                return;
            }

            // No existing sessions — new user flow
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

    // Try to parse a file-message payload from a content string
    function parseFileMsg(content) {
        try {
            const p = JSON.parse(content);
            return (p && typeof p.fileUrl === 'string') ? p : null;
        } catch (e) {
            return null;
        }
    }

    function renderFileMsgContent(fileData, sender) {
        const container = document.createElement('div');
        container.className = 'n8n-file-msg';
        const isImage = fileData.fileType && fileData.fileType.startsWith('image/');
        if (isImage) {
            const img = document.createElement('img');
            img.className = 'n8n-file-img';
            img.src = fileData.fileUrl;
            img.alt = fileData.fileName || 'image';
            img.title = fileData.fileName || 'image';
            img.addEventListener('click', () => window.open(fileData.fileUrl, '_blank'));
            container.appendChild(img);
        } else {
            const link = document.createElement('a');
            link.className = 'n8n-file-doc';
            link.href = fileData.fileUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const sizeKB = fileData.fileSize ? Math.round(fileData.fileSize / 1024) : null;
            link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="n8n-file-name">${fileData.fileName || 'File'}</span>${sizeKB ? `<span style="opacity:0.7;font-size:11px">${sizeKB}KB</span>` : ''}`;
            container.appendChild(link);
        }
        return container;
    }

    function formatMsgTime(ts) {
        const d = ts ? new Date(ts) : new Date();
        const now = new Date();
        const diffSec = Math.floor((now - d) / 1000);
        if (diffSec < 60) return 'Just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
        const h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        const timeStr = `${hour12}:${m} ${ampm}`;
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return `Today ${timeStr}`;
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${timeStr}`;
    }

    function addMessage(sender, content, timestamp = null, options = {}) {
        removeTypingIndicator();

        // Create wrapper div for label + message
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = `n8n-msg-wrapper n8n-msg-wrapper-${sender}`;

        // Add label
        const labelDiv = document.createElement('div');
        labelDiv.className = `n8n-msg-label n8n-msg-label-${sender}`;
        const timeSpan = `<span class="n8n-msg-time">${formatMsgTime(timestamp)}</span>`;
        if (sender === 'user') {
            const localId = options.localId || `user_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const status = options.status || '';
            wrapperDiv.dataset.localId = localId;
            labelDiv.innerHTML = `You${status ? `<span class="n8n-msg-status">${status}</span>` : ''}${timeSpan}`;
            if (status) {
                const statusEl = labelDiv.querySelector('.n8n-msg-status');
                if (statusEl) userMessageStatusEls.set(localId, statusEl);
            }
        } else if (sender === 'ai') {
            labelDiv.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:4px"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>AI Bot' + timeSpan;
        } else if (sender === 'admin') {
            labelDiv.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:4px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Support Agent' + timeSpan;
        }
        wrapperDiv.appendChild(labelDiv);

        // Create message bubble
        const msgDiv = document.createElement('div');
        msgDiv.className = `n8n-msg n8n-msg-${sender}`;

        // Detect file message
        const fileData = parseFileMsg(content);
        if (fileData) {
            msgDiv.appendChild(renderFileMsgContent(fileData, sender));
        } else if (typeof marked !== 'undefined' && sender !== 'user') {
            msgDiv.innerHTML = marked.parse(content);
        } else {
            msgDiv.innerText = content;
        }

        wrapperDiv.appendChild(msgDiv);
        chatMessages.appendChild(wrapperDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (sender === 'ai' && typeof content === 'string') {
            lastAiMessage = {
                content: content.trim(),
                at: Date.now()
            };
        }

        return { wrapper: wrapperDiv, localId: wrapperDiv.dataset.localId || null };
    }

    function shouldIgnoreAiSocketMessage(content) {
        const normalized = typeof content === 'string' ? content.trim() : '';
        if (!normalized) return true;
        return lastAiMessage.content === normalized && (Date.now() - lastAiMessage.at) < 5000;
    }

    function setUserMessageStatus(localId, status) {
        if (!localId || !status) return;
        const statusEl = userMessageStatusEls.get(localId);
        if (!statusEl) return;
        statusEl.textContent = status;
    }

    function markPendingUserMessagesSeen() {
        for (const statusEl of userMessageStatusEls.values()) {
            if (statusEl.textContent !== 'Seen') {
                statusEl.textContent = 'Seen';
            }
        }
    }

    function addSystemMessage(content, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'n8n-msg n8n-msg-system';
        if (isHtml) {
            msgDiv.innerHTML = content;
        } else {
            msgDiv.innerText = content;
        }
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ============================================
    // SUGGESTION CHIPS
    // ============================================
    const suggestionsEl = document.getElementById('n8n-suggestions');

    // Static greeting chips shown before any conversation starts
    const GREETING_CHIPS = [
        { label: '📱 Best mobiles', msg: 'Show me the best mobile phones' },
        { label: '💻 Best laptops', msg: 'Show me the best laptops' },
        // { label: '📺 Best TVs', msg: 'Show me the best TVs' },
        { label: '🔋 Best earbuds', msg: 'Show me the best earbuds' },
        { label: '🛒 New arrivals', msg: 'What are the new arrivals?' },
        { label: '🏷️ Today\'s deals', msg: 'What are today\'s best deals?' },
    ];

    function showInitialSuggestions() {
        if (!suggestionsEl) return;
        suggestionsEl.innerHTML = '';
        GREETING_CHIPS.forEach(({ label, msg }) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'n8n-suggestion-chip';
            chip.textContent = label;
            chip.addEventListener('click', () => {
                clearSuggestions();
                chatInput.value = msg;
                chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
            suggestionsEl.appendChild(chip);
        });
        // Add Chat with Human chip
        const humanChip = document.createElement('button');
        humanChip.type = 'button';
        humanChip.className = 'n8n-suggestion-chip human';
        humanChip.textContent = '👤 Chat with Human';
        humanChip.addEventListener('click', () => {
            clearSuggestions();
            chatInput.value = 'Chat with human';
            chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
        suggestionsEl.appendChild(humanChip);
        suggestionsEl.classList.remove('hidden');
    }

    function showSuggestions(suggestions) {
        if (!suggestionsEl) return;
        if (sessionMode !== 'ai') {
            clearSuggestions();
            return;
        }
        suggestionsEl.innerHTML = '';
        suggestions.forEach(text => {
            const chip = document.createElement('button');
            chip.type = 'button';
            const isHuman = text === '__HUMAN__';
            chip.className = 'n8n-suggestion-chip' + (isHuman ? ' human' : '');
            chip.textContent = isHuman ? '👤 Chat with Human' : text;
            chip.addEventListener('click', () => {
                clearSuggestions();
                const msg = isHuman ? 'Chat with human' : text;
                chatInput.value = msg;
                chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
            suggestionsEl.appendChild(chip);
        });
        suggestionsEl.classList.remove('hidden');
    }

    function clearSuggestions() {
        if (!suggestionsEl) return;
        suggestionsEl.classList.add('hidden');
        suggestionsEl.innerHTML = '';
    }

    function showHumanSuggestionOnly() {
        if (sessionMode === 'ai') {
            showSuggestions(['__HUMAN__']);
        } else {
            clearSuggestions();
        }
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

    function getAlertAudioCtx() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!alertAudioCtx || alertAudioCtx.state === 'closed') {
            alertAudioCtx = new Ctx();
        }
        return alertAudioCtx;
    }

    async function unlockAlertAudio() {
        const ctx = getAlertAudioCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch (err) {
                console.warn('Audio resume failed:', err);
            }
        }
    }

    // Professional 3-note ascending chime (C5 → E5 → G5)
    function playHumanAlertSound() {
        try {
            const ctx = getAlertAudioCtx();
            if (!ctx) return;
            if (ctx.state === 'suspended') return;
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
            const noteGap = 0.14;
            const noteDur = 0.18;
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const start = ctx.currentTime + i * noteGap;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
                gain.gain.setValueAtTime(0.08, start + noteDur - 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + noteDur + 0.01);
            });
        } catch (err) {
            console.warn('Failed to play alert sound:', err);
        }
    }

    // Request browser Notification permission
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
                .then(() => syncPushIdentity())
                .catch(() => {});
        } else if ('Notification' in window && Notification.permission === 'granted') {
            syncPushIdentity();
        }
    }

    // Show browser notification when admin replies and chat is closed
    function showBrowserNotification(content) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        const isChatOpen = chatWindow.classList.contains('open');
        if (isChatOpen && document.visibilityState === 'visible') return;
        try {
            const body = String(content || '').slice(0, 140) || 'You have a new message';
            const n = new Notification(CONFIG.SITE_NAME + ' Support', {
                body,
                icon: undefined,
                tag: 'n8n-chat-' + sessionId,
                renotify: true
            });
            n.onclick = () => {
                window.focus();
                setChatOpen(true);
                n.close();
            };
            setTimeout(() => n.close(), 8000);
        } catch (err) {
            console.warn('Browser notification failed:', err);
        }
    }

    // Update unread badge on chat button
    function updateUnreadBadge() {
        const badge = document.getElementById('n8n-unread-badge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
            localStorage.setItem('n8n_chat_unread', String(unreadCount));
        } else {
            badge.classList.add('hidden');
            localStorage.removeItem('n8n_chat_unread');
        }
    }

    async function setMode(mode, syncToServer = false) {
        if (sessionMode === mode && !syncToServer) return;

        sessionMode = mode;
        localStorage.setItem('n8n_chat_mode', mode);

        if (mode === 'human') {
            clearSuggestions();
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
            const response = await fetch(`${CONFIG.API_URL}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    sender,
                    content,
                    metadata: getMetadata()
                })
            });

            if (!response.ok) {
                throw new Error(`Save failed: ${response.status}`);
            }

            return true;
        } catch (err) {
            console.error('Failed to save message:', err);
            return false;
        }
    }

    // ============================================
    // SEND TO N8N AI (via local proxy to avoid CORS)
    // ============================================
    async function sendToN8nAI(message) {
        try {
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
                const error = new Error(`Chat request failed: ${response.status}`);
                error.status = response.status;
                error.statusText = response.statusText;
                throw error;
            }

            const data = await response.json();

            // Handle response format - could be {output: "..."} or [{output: "..."}] or {text: "..."} or {result: "..."}
            let output = '';

            if (Array.isArray(data)) {
                const first = data[0];
                output = first.output || first.text || first.message || first.response || first.result || (typeof first === 'string' ? first : '');
            } else {
                output = data.output || data.text || data.message || data.response || data.result;
            }

            if (output) {
                // Pass through suggestions from n8n if present
                const suggestions = Array.isArray(data.suggestions) ? data.suggestions : null;
                return { output, ...(suggestions ? { suggestions } : {}) };
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
        await unlockAlertAudio();
        clearSuggestions();
        const content = chatInput.value.trim();

        // If there's a pending pasted image, upload it (with optional caption)
        if (pendingPasteFile) {
            const fileToUpload = pendingPasteFile;
            clearPastePreview();
            chatInput.value = '';
            await uploadFile(fileToUpload);
            // If there was also a caption, send it as a separate text message
            if (content) {
                const localId = `user_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                addMessage('user', content, null, { localId, status: 'Sending' });
                setLoading(true);
                const saved = await saveMessageToDB('user', content);
                if (saved) {
                    setUserMessageStatus(localId, 'Sent');
                    pendingUserDeliveryQueue.push(localId);
                } else {
                    setUserMessageStatus(localId, 'Failed');
                }
                if (sessionMode === 'ai') {
                    showTypingIndicator();
                    try {
                        const aiResponse = await sendToN8nAI(content);
                        removeTypingIndicator();
                        if (aiResponse && aiResponse.output) {
                            addMessage('ai', aiResponse.output);
                                if (!aiResponse.handoff) {
                                    if (Array.isArray(aiResponse.suggestions) && aiResponse.suggestions.length > 0) {
                                        showSuggestions([...aiResponse.suggestions.slice(0, 2), '__HUMAN__']);
                                    } else {
                                        showHumanSuggestionOnly();
                                    }
                                }
                            if (!aiResponse.saved) await saveMessageToDB('ai', aiResponse.output);
                        }
                    } catch (err) {
                        removeTypingIndicator();
                        addSystemMessage('⚠️ AI unavailable. Connecting to human support...');
                        setMode('human');
                    }
                } else {
                    statusText.textContent = 'Message sent • Waiting for response...';
                }
                setLoading(false);
            }
            return;
        }

        if (!content) return;

        // Show user message immediately
        const localId = `user_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        addMessage('user', content, null, { localId, status: 'Sending' });
        chatInput.value = '';
        setLoading(true);

        // Save user message to database
        const saved = await saveMessageToDB('user', content);
        if (saved) {
            setUserMessageStatus(localId, 'Sent');
            pendingUserDeliveryQueue.push(localId);
        } else {
            setUserMessageStatus(localId, 'Failed');
        }

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
                    lastAiMessage = {
                        content: aiResponse.output.trim(),
                        at: Date.now()
                    };
                    // Suggestions always come from the API (generated server-side from products DB)
                    if (!(aiResponse.handoff || wantsHuman)) {
                        if (Array.isArray(aiResponse.suggestions) && aiResponse.suggestions.length > 0) {
                            showSuggestions([...aiResponse.suggestions.slice(0, 2), '__HUMAN__']);
                        } else {
                            showHumanSuggestionOnly();
                        }
                    }

                    // Save AI response to database only if not already saved by API
                    if (!aiResponse.saved) {
                        await saveMessageToDB('ai', aiResponse.output);
                    }

                    // Check if this is a human handoff response
                    if (aiResponse.handoff || wantsHuman) {
                        setMode('human', true); // Sync to server
                        addSystemMessage(
                            '🔄 Switched to human support mode. Our team will respond shortly!<br><br>' +
                            '📱 Or reach us directly on WhatsApp:<br>' +
                            '<a href="https://wa.me/+9779813001000?text=Hi!" target="_blank" rel="noopener noreferrer">+977 9813001000</a>',
                            true
                        );
                    }
                } else {
                    throw new Error('Invalid AI response');
                }
            } catch (err) {
                removeTypingIndicator();
                if (err && (err.status === 504 || /timed out/i.test(err.message || ''))) {
                    addSystemMessage('⏳ AI is still working. The reply may appear shortly.');
                } else {
                    addSystemMessage('⚠️ AI unavailable. Connecting to human support...');
                    setMode('human');
                }
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
                    if (session.status === 'human') {
                        clearSuggestions();
                    }
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
                        addMessage('user', m.content, m.created_at);
                    } else if (m.sender === 'admin') {
                        addMessage('admin', m.content, m.created_at);
                    } else if (m.sender === 'ai') {
                        addMessage('ai', m.content, m.created_at);
                    }
                });
                // Scroll to bottom after loading all messages
                setTimeout(() => scrollToBottom(), 100);
                if (msgs.length === 0) {
                    setTimeout(() => showInitialSuggestions(), 120);
                } else {
                    showHumanSuggestionOnly();
                }
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
            if (msg.sessionId === sessionId && msg.sender === 'user' && pendingUserDeliveryQueue.length > 0) {
                const pendingId = pendingUserDeliveryQueue.shift();
                setUserMessageStatus(pendingId, 'Delivered');
            }

            if (msg.sessionId === sessionId && msg.sender === 'ai') {
                if (shouldIgnoreAiSocketMessage(msg.content)) {
                    return;
                }

                addMessage('ai', msg.content, msg.timestamp || null);
                clearSuggestions();
                statusText.textContent = 'AI replied • Connected';
                return;
            }

            if (msg.sessionId === sessionId && msg.sender === 'admin') {
                addMessage('admin', msg.content);
                clearSuggestions(); // No AI chips in human mode
                statusText.textContent = 'Agent replied • Connected';
                setMode('human'); // Automatically switch to human mode if admin replies
                playHumanAlertSound();
                markPendingUserMessagesSeen();
                // Browser notification + unread badge when chat is closed
                const isChatOpen = chatWindow.classList.contains('open');
                if (!isChatOpen || document.visibilityState !== 'visible') {
                    unreadCount++;
                    updateUnreadBadge();
                }
                showBrowserNotification(msg.content);
            }
        });
    }

    // ============================================
    // TOGGLE HANDLERS
    // ============================================
    function setChatOpen(isOpen) {
        chatWindow.classList.toggle('open', isOpen);
        chatButton.classList.toggle('hidden', isOpen);
        if (isOpen) {
            unlockAlertAudio();
            ensurePushPermissionPrompt();
            syncPushIdentity();
            requestNotificationPermission();
            // Clear unread badge
            unreadCount = 0;
            updateUnreadBadge();
            setTimeout(() => scrollToBottom(), 100);
        }
    }

    chatButton.onclick = () => setChatOpen(true);
    chatClose.onclick = () => setChatOpen(false);

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

    // Restore unread badge from localStorage immediately on load
    updateUnreadBadge();

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
