// Deep analysis of extension.js: gRPC transport creation, metadata, and server connection
const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\dist\\extension.js";
const c = fs.readFileSync(path, "utf8");

function extractAround(content, pattern, before = 300, after = 500) {
  const results = [];
  let searchFrom = 0;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "g");
  let match;
  while ((match = re.exec(content)) !== null && results.length < 5) {
    const start = Math.max(0, match.index - before);
    const end = Math.min(content.length, match.index + match[0].length + after);
    results.push({
      offset: match.index,
      context: content.substring(start, end).replace(/\n/g, "\\n")
    });
  }
  return results;
}

// 1. How is the gRPC transport created for the language server?
console.log("\n\n========== 1. GRPC TRANSPORT CREATION ==========");
const transportPatterns = [
  "createGrpcTransport(",
  "createConnectTransport(",
  "createGrpcWebTransport(",
  "httpsPort",
  "csrfToken",
];
for (const p of transportPatterns) {
  const results = extractAround(c, p, 200, 600);
  if (results.length > 0) {
    console.log(`\n--- ${p} (${results.length} occurrences) ---`);
    results.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 800)}`));
  }
}

// 2. MetadataProvider - what metadata is sent with requests?
console.log("\n\n========== 2. METADATA PROVIDER ==========");
const metaPatterns = [
  "class MetadataProvider",
  "getMetadata()",
  "metadata:",
  "ideName:",
  "ideVersion:",
  "ideType:",
  "apiKey:",
  "sessionId:",
  "disableTelemetry",
];
for (const p of metaPatterns) {
  const results = extractAround(c, p, 150, 400);
  if (results.length > 0) {
    console.log(`\n--- ${p} (${results.length} occurrences) ---`);
    results.slice(0, 3).forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 600)}`));
  }
}

// 3. How the extension connects to language server binary
console.log("\n\n========== 3. SERVER PROCESS LAUNCH ==========");
const launchPatterns = [
  "language_server",
  "--server_port",
  "--lsp_port",
  "--random_port",
  "csrfToken",
  "discoveryFile",
  "discovery_file",
];
for (const p of launchPatterns) {
  const results = extractAround(c, p, 200, 600);
  if (results.length > 0) {
    console.log(`\n--- ${p} (${results.length} occurrences) ---`);
    results.slice(0, 3).forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 800)}`));
  }
}

// 4. Model enum and model selection
console.log("\n\n========== 4. MODEL ENUM / SELECTION ==========");
const modelPatterns = [
  "Model.",
  "requestedModelId",
  "getCommandModelFromRequest",
  "MODEL_",
  "enumToString",
];
for (const p of modelPatterns) {
  const results = extractAround(c, p, 100, 400);
  if (results.length > 0) {
    console.log(`\n--- ${p} (${results.length} occurrences) ---`);
    results.slice(0, 3).forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 600)}`));
  }
}

// 5. CSRF token and auth headers for gRPC
console.log("\n\n========== 5. CSRF / AUTH FOR GRPC ==========");
const authPatterns = [
  "x-csrf-token",
  "x-codeium-csrf-token",
  "csrf",
  "interceptor",
  "headerInterceptor",
  "addHeader",
];
for (const p of authPatterns) {
  const results = extractAround(c, p, 150, 400);
  if (results.length > 0) {
    console.log(`\n--- ${p} (${results.length} occurrences) ---`);
    results.slice(0, 3).forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 600)}`));
  }
}
