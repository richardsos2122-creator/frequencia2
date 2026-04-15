function buildWebSocketUrl() {
  if (window.location.protocol === 'file:') {
    return 'ws://localhost:3000/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function setupRealtime({
  onMessage,
  onFallback,
  pollIntervalMs = 30000,
} = {}) {
  const isServerlessHost = /vercel\.app$/i.test(window.location.hostname || '');
  let socket = null;
  let reconnectTimer = null;
  let pollTimer = null;
  let manuallyClosed = false;

  async function runFallback() {
    if (typeof onFallback === 'function') {
      try {
        await onFallback();
      } catch {
        // fallback silencioso para não quebrar a tela
      }
    }
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }

    void runFallback();
    pollTimer = window.setInterval(() => {
      void runFallback();
    }, pollIntervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleReconnect() {
    if (manuallyClosed || reconnectTimer) {
      return;
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 5000);
  }

  function connect() {
    if (manuallyClosed || isServerlessHost || typeof window.WebSocket !== 'function') {
      startPolling();
      return;
    }

    try {
      socket = new window.WebSocket(buildWebSocketUrl());
    } catch {
      startPolling();
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      stopPolling();
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof onMessage === 'function') {
          onMessage(data);
        }
      } catch {
        // ignora mensagens malformadas
      }
    });

    socket.addEventListener('error', () => {
      try {
        socket?.close();
      } catch {
        // noop
      }
    });

    socket.addEventListener('close', () => {
      if (manuallyClosed) {
        return;
      }

      startPolling();
      scheduleReconnect();
    });
  }

  connect();

  return {
    close() {
      manuallyClosed = true;
      stopPolling();
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
      }
    },
  };
}
