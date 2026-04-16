function isLocalHost(hostname = '') {
  return /^(localhost|0\.0\.0\.0)$/i.test(hostname)
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(hostname)
    || /^10(?:\.\d{1,3}){3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(hostname);
}

function buildWebSocketUrl() {
  const { protocol, hostname, host, port } = window.location;
  const isWebProtocol = protocol === 'http:' || protocol === 'https:';

  if (!isWebProtocol) {
    return 'ws://localhost:3000/ws';
  }

  if (isLocalHost(hostname) && port !== '3000') {
    return `ws://${hostname}:3000/ws`;
  }

  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${host}/ws`;
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
