const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:3000/ws");
ws.on("open", () => {
    console.log("TEST_WS_READY");
});
ws.on("message", (data) => {
    console.log("EVENT_RECEIVED:", data.toString());
});
