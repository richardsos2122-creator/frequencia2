const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:3000/ws");
ws.on("open", () => {
  console.log("CONEXAO_ESTABELECIDA");
});
ws.on("message", (data) => {
  console.log("MENSAGEM_RECEBIDA:", data.toString());
});
ws.on("error", (err) => {
  console.error("ERRO_WS:", err.message);
});
setTimeout(() => {
  process.exit(0);
}, 5000);
