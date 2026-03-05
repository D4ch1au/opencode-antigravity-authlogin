const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\dist\\extension.js";
const c = fs.readFileSync(path, "utf8");

// Find how language server is launched
const searches = [
  { name: "LanguageServerClient", ctx: 400 },
  { name: "languageServer", ctx: 400 },
  { name: "language_server", ctx: 300 },
  { name: "serverPath", ctx: 300 },
  { name: "serverExecutable", ctx: 300 },
  { name: "spawn", ctx: 300 },
  { name: "child_process", ctx: 300 },
  { name: "LanguageClient", ctx: 400 },
  { name: "handleStreamingCommand", ctx: 400 },
  { name: "handleStreaming", ctx: 300 },
  { name: "connectTransport", ctx: 300 },
  { name: "createServerProcess", ctx: 300 },
  { name: "startServer", ctx: 300 },
  { name: "lsp_port", ctx: 300 },
  { name: "localhost", ctx: 300 },
  { name: "127.0.0.1", ctx: 300 },
  { name: "grpc-web", ctx: 300 },
  { name: "connect-go", ctx: 300 },
  { name: "connectrpc", ctx: 300 },
  { name: "@connectrpc", ctx: 300 },
  { name: "createGrpcTransport", ctx: 300 },
  { name: "createConnectTransport", ctx: 300 },
  { name: "createGrpcWebTransport", ctx: 300 },
  { name: "Transport", ctx: 300 },
  { name: "baseUrl", ctx: 300 },
];

for (const s of searches) {
  const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = c.match(new RegExp(escaped, "g"));
  const count = matches ? matches.length : 0;
  
  if (count === 0) {
    console.log(`${s.name}: NOT FOUND`);
  } else {
    const idx = c.indexOf(s.name);
    console.log(`\n=== ${s.name} === (${count} occurrences, first at offset ${idx})`);
    const context = c.substring(Math.max(0, idx - 150), idx + s.name.length + s.ctx);
    console.log(context.replace(/\n/g, "\\n").substring(0, 600));
  }
}
