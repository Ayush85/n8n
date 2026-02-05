(function () {
    // Configuration
    const API_URL = 'http://localhost:3001';
    const SOCKET_IO_CDN = 'https://cdn.socket.io/4.7.2/socket.io.min.js';

    // State
    let socket = null;
    let sessionId = localStorage.getItem('n8n_chat_session_id') || 'sess_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('n8n_chat_session_id', sessionId);

    // Styles
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
            background: #2563eb;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #n8n-chat-button:hover { transform: scale(1.05); }
        #n8n-chat-button svg { fill: white; width: 30px; height: 30px; }
        
        #n8n-chat-window {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        #n8n-chat-window.open { display: flex; }
        
        .n8n-chat-header {
            padding: 16px;
            background: #2563eb;
            color: white;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .n8n-chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #f8fafc;
        }
        .n8n-chat-input-area {
            padding: 12px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            gap: 8px;
        }
        .n8n-chat-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            outline: none;
        }
        .n8n-chat-input:focus { border-color: #2563eb; }
        .n8n-chat-send {
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        
        .n8n-msg {
            margin-bottom: 12px;
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.4;
        }
        .n8n-msg-user {
            align-self: flex-end;
            background: #2563eb;
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 2px;
        }
        .n8n-msg-admin {
            align-self: flex-start;
            background: #e2e8f0;
            color: #1e293b;
            border-bottom-left-radius: 2px;
        }
    `;

    // Inject Styles
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // Create UI
    const widget = document.createElement('div');
    widget.id = 'n8n-chat-widget';
    widget.innerHTML = `
        <div id="n8n-chat-window">
            <div class="n8n-chat-header">
                <span>Support Chat</span>
                <span id="n8n-chat-close" style="cursor:pointer">&times;</span>
            </div>
            <div id="n8n-chat-messages" class="n8n-chat-messages"></div>
            <form id="n8n-chat-form" class="n8n-chat-input-area">
                <input type="text" id="n8n-chat-input" class="n8n-chat-input" placeholder="Type a message..." autocomplete="off">
                <button type="submit" class="n8n-chat-send">Send</button>
            </form>
        </div>
        <div id="n8n-chat-button">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </div>
    `;
    document.body.appendChild(widget);

    const chatWindow = document.getElementById('n8n-chat-window');
    const chatButton = document.getElementById('n8n-chat-button');
    const chatClose = document.getElementById('n8n-chat-close');
    const chatForm = document.getElementById('n8n-chat-form');
    const chatInput = document.getElementById('n8n-chat-input');
    const chatMessages = document.getElementById('n8n-chat-messages');

    // Toggle Window
    chatButton.onclick = () => chatWindow.classList.toggle('open');
    chatClose.onclick = () => chatWindow.classList.remove('open');

    // Helper: Add Message to UI
    function addMessage(sender, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `n8n-msg n8n-msg-${sender}`;
        msgDiv.innerText = content;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Load Socket.io and Initialize
    function init() {
        socket = io(API_URL);

        socket.emit('join_session', sessionId);

        // Fetch history
        fetch(`${API_URL}/api/sessions/${sessionId}/messages`)
            .then(res => res.json())
            .then(msgs => {
                msgs.forEach(m => addMessage(m.sender === 'admin' ? 'admin' : 'user', m.content));
            });

        socket.on('new_message', (msg) => {
            if (msg.sessionId === sessionId) {
                addMessage(msg.sender === 'admin' ? 'admin' : 'user', msg.content);
            }
        });
    }

    // Inject Socket.io Script
    const script = document.createElement('script');
    script.src = SOCKET_IO_CDN;
    script.onload = init;
    document.head.appendChild(script);

    // Form Submit
    chatForm.onsubmit = (e) => {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content) return;

        // Post to API (to trigger dashboard update and save to DB)
        fetch(`${API_URL}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, sender: 'user', content })
        });

        chatInput.value = '';
    };

})();
