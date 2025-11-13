
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
  };

  function init(config) {
    state.chatId = config.chatId || 'default';
    state.params = config.params || {};
    
    createWidgetContainer();
    
    // The chat widget is not opened automatically.
    // A button or other element on the host page should call window.ChatWidget.open()
  }

  function createWidgetContainer() {
    if (state.widgetContainer) {
      document.body.removeChild(state.widgetContainer);
    }
    
    state.widgetContainer = document.createElement('div');
    state.widgetContainer.id = 'posal-chat-widget-container';
    state.widgetContainer.style.position = 'fixed';
    state.widgetContainer.style.bottom = '20px';
    state.widgetContainer.style.right = '20px';
    state.widgetContainer.style.width = '400px';
    state.widgetContainer.style.height = '600px';
    state.widgetContainer.style.boxShadow = '0 5px 40px rgba(0,0,0,.16)';
    state.widgetContainer.style.borderRadius = '8px';
    state.widgetContainer.style.overflow = 'hidden';
    state.widgetContainer.style.display = 'none';
    state.widgetContainer.style.zIndex = '9999';

    document.body.appendChild(state.widgetContainer);

    const style = document.createElement('style');
    style.innerHTML = `
      @media (max-width: 420px) {
        #posal-chat-widget-container {
          width: 100vw;
          height: 100vh;
          bottom: 0;
          right: 0;
          border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createIframe() {
    if (state.iframe) return;

    state.iframe = document.createElement('iframe');
    const widgetUrl = new URL(`${window.location.origin}/chat-widget`);
    widgetUrl.searchParams.set('chatId', state.chatId);
    
    // We need to pass the params and the host origin for the allow-list check
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
    if (state.widgetContainer) {
       state.widgetContainer.style.display = 'block';
    }
  }

  function close() {
    state.isOpen = false;
    if (state.widgetContainer) {
      state.widgetContainer.style.display = 'none';
    }
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
