import { WebSocket, WebSocketServer } from 'ws';

let realtimeServer = null;

export function attachRealtime(server) {
  if (!server || realtimeServer) {
    return realtimeServer;
  }

  realtimeServer = new WebSocketServer({
    server,
    path: '/ws',
  });

  realtimeServer.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'realtime.connected',
      payload: { mode: 'websocket' },
      timestamp: new Date().toISOString(),
    }));
  });

  return realtimeServer;
}

export function broadcastRealtime(type, payload = {}) {
  if (!realtimeServer) {
    return 0;
  }

  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });

  let delivered = 0;
  realtimeServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      delivered += 1;
    }
  });

  return delivered;
}
