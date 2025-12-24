
(function () {
  if (window.ChatWidget) {
    return;
  }

  let state = {
    chatId: 'default',
    params: {},
    isOpen: false,
    iframe: null,
    widgetContainer: null,
    toggleButton: null,
  };

  const STORAGE_KEY = 'posal_chat_state';

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      isOpen: state.isOpen,
      chatId: state.chatId
    }));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load chat state', e);
    }
    return null;
  }

  function init(config) {
    const saved = loadState();

    // If a session exists in storage, we use it to maintain continuity
    state.chatId = (saved && saved.chatId) ? saved.chatId : (config.chatId || 'default');
    state.params = config.params || {};

    injectStyles();
    createWidgetContainer();
    createToggleButton();

    // Listen for messages from the iframe
    window.addEventListener('message', function (event) {
      if (event.data === 'close-chat-widget') {
        close();
      }
      if (event.data === 'reset-chat-session') {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }
    });

    // Check if it was open before reload
    if (saved && saved.isOpen) {
      open();
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      #posal-chat-widget-container {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 400px;
        height: 600px;
        max-height: calc(100vh - 110px);
        background: white;
        box-shadow: 0 12px 24px rgba(0,0,0,0.15);
        border-radius: 16px;
        overflow: hidden;
        z-index: 999998;
        display: flex;
        flex-direction: column;
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out;
        transform-origin: bottom right;
      }

      #posal-chat-widget-container.is-open {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: auto;
      }

      #posal-chat-toggle-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        z-index: 999999;
        transition: transform 0.2s ease, background 0.2s ease;
      }

      #posal-chat-toggle-button:hover {
        transform: scale(1.05);
        background: #2563eb;
      }

      #posal-chat-toggle-button svg {
        width: 30px;
        height: 30px;
        transition: transform 0.3s ease;
      }

      #posal-chat-toggle-button.is-open svg {
        // transform: rotate(90deg); // Removed rotate for the < icon
      }

      @media (max-width: 768px) {
        #posal-chat-widget-container {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          bottom: 0 !important;
          right: 0 !important;
          border-radius: 0 !important;
          transform: translateY(100%);
        }
        #posal-chat-widget-container.is-open {
          transform: translateY(0);
        }
        #posal-chat-toggle-button {
          bottom: 15px;
          right: 15px;
        }
        #posal-chat-toggle-button.is-open {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createWidgetContainer() {
    state.widgetContainer = document.createElement('div');
    state.widgetContainer.id = 'posal-chat-widget-container';
    document.body.appendChild(state.widgetContainer);
  }

  function createToggleButton() {
    state.toggleButton = document.createElement('div');
    state.toggleButton.id = 'posal-chat-toggle-button';
    state.toggleButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    state.toggleButton.onclick = toggle;
    document.body.appendChild(state.toggleButton);
  }

  function createIframe() {
    if (state.iframe) return;

    state.iframe = document.createElement('iframe');
    const widgetUrl = new URL(`${window.ChatWidgetOrigin || window.location.origin}/chat-widget`);
    widgetUrl.searchParams.set('chatId', state.chatId);
    widgetUrl.searchParams.set('origin', window.location.origin);
    widgetUrl.searchParams.set('params', JSON.stringify(state.params));

    state.iframe.src = widgetUrl.toString();
    state.iframe.style.width = '100%';
    state.iframe.style.height = '100%';
    state.iframe.style.border = 'none';
    state.widgetContainer.appendChild(state.iframe);
  }

  function open() {
    state.isOpen = true;
    if (!state.iframe) {
      createIframe();
    }
    state.widgetContainer.classList.add('is-open');
    state.toggleButton.classList.add('is-open');
    state.toggleButton.innerHTML = `
       <svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;
    saveState();
  }

  function close() {
    state.isOpen = false;
    state.widgetContainer.classList.remove('is-open');
    state.toggleButton.classList.remove('is-open');
    state.toggleButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    saveState();
  }

  function toggle() {
    if (state.isOpen) {
      close();
    } else {
      open();
    }
  }

  window.ChatWidget = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
  };
})();
