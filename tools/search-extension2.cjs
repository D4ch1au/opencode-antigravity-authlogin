const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\dist\\extension.js";
const c = fs.readFileSync(path, "utf8");

// Search patterns with more context
const searches = [
  // IPC / command communication
  { name: "executeCommand", pattern: "executeCommand" },
  { name: "sendRequest", pattern: "sendRequest" },
  { name: "postMessage", pattern: "postMessage" },
  
  // Metadata
  { name: "EXTENSION_METADATA", pattern: "EXTENSION_METADATA" },
  { name: "MetadataProvider", pattern: "MetadataProvider" },
  { name: "getMetadata", pattern: "getMetadata" },
  
  // Model / chat related
  { name: "modelName", pattern: "modelName" },
  { name: "modelId", pattern: "modelId" },
  { name: "claude", pattern: "claude" },
  { name: "gemini", pattern: "gemini" },
  { name: "opus", pattern: "opus" },
  { name: "sonnet", pattern: "sonnet" },
  
  // API / service calls
  { name: "RecordCodeAssist", pattern: "RecordCodeAssist" },
  { name: "RecordClientEvent", pattern: "RecordClientEvent" },
  { name: "codeAssist", pattern: "codeAssist" },
  { name: "chat.send", pattern: "chat.send" },
  { name: "chat.request", pattern: "chat.request" },
  { name: "agentic", pattern: "agentic" },
  
  // Proto schemas
  { name: "Schema=", pattern: "Schema=" },
  { name: "RequestSchema", pattern: "RequestSchema" },
  { name: "ResponseSchema", pattern: "ResponseSchema" },
  
  // Auth / token
  { name: "getAccessToken", pattern: "getAccessToken" },
  { name: "authenticate", pattern: "authenticate" },
  { name: "apiKey", pattern: "apiKey" },
  
  // HTTP client
  { name: "fetch(", pattern: "fetch(" },
  { name: "axios", pattern: "axios" },
  { name: "node-fetch", pattern: "node-fetch" },
  { name: "undici", pattern: "undici" },
  { name: "http.request", pattern: "http.request" },
  { name: "https.request", pattern: "https.request" },
  
  // Unleash (feature flags)
  { name: "unleash", pattern: "unleash" },
  { name: "isEnabled", pattern: "isEnabled" },
  
  // Interesting service names
  { name: "CloudCodeService", pattern: "CloudCodeService" },
  { name: "CodeAssistService", pattern: "CodeAssistService" },
  { name: "GrpcService", pattern: "GrpcService" },
  { name: "grpc", pattern: "grpc" },
];

for (const s of searches) {
  const escaped = s.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = c.match(new RegExp(escaped, "g"));
  const count = matches ? matches.length : 0;
  
  if (count === 0) {
    console.log(`${s.name}: NOT FOUND`);
  } else {
    const idx = c.indexOf(s.pattern);
    console.log(`\n=== ${s.name} === (${count} occurrences, first at offset ${idx})`);
    // Show first occurrence with context
    const context = c.substring(Math.max(0, idx - 200), idx + s.pattern.length + 300);
    console.log(context.replace(/\n/g, "\\n").substring(0, 500));
    
    // If few occurrences, show all
    if (count <= 5 && count > 1) {
      let searchFrom = 0;
      for (let i = 0; i < count; i++) {
        const pos = c.indexOf(s.pattern, searchFrom);
        if (pos === -1) break;
        if (i > 0) {
          const ctx = c.substring(Math.max(0, pos - 100), pos + s.pattern.length + 200);
          console.log(`  [#${i+1} at ${pos}]: ${ctx.replace(/\n/g, "\\n").substring(0, 400)}`);
        }
        searchFrom = pos + 1;
      }
    }
  }
}
