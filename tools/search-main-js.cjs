const fs = require("fs");
const path = "E:/Antigravity/resources/app/out/main.js";
const content = fs.readFileSync(path, "utf8");
const lines = content.split("\n");

console.log("=== FILE INFO ===");
console.log("Total lines:", lines.length);
console.log("Line 1152 length:", lines[1151]?.length || "N/A");
console.log();

const line1152 = lines[1151] || "";

// 1. Search for _ae function definition on line 1152
console.log("=== SEARCH 1: _ae function definition ===");
const aePatterns = [/_ae\s*[\(=]/g, /function\s+_ae/g];
for (const p of aePatterns) {
  let m;
  while ((m = p.exec(line1152)) !== null) {
    const start = Math.max(0, m.index - 100);
    const end = Math.min(line1152.length, m.index + 1000);
    console.log(`Match "${m[0]}" at offset ${m.index}:`);
    console.log(line1152.slice(start, end));
    console.log();
  }
}

// 2. Search entire file for interceptor patterns
console.log("=== SEARCH 2: Interceptors & axios ===");
const interceptorPatterns = [
  "interceptors.request.use",
  "interceptors.response.use",
  "axios.create(",
];
for (const p of interceptorPatterns) {
  let idx = -1;
  while ((idx = content.indexOf(p, idx + 1)) !== -1) {
    const lineNum = content.slice(0, idx).split("\n").length;
    const start = Math.max(0, idx - 300);
    const end = Math.min(content.length, idx + 600);
    console.log(`"${p}" at line ${lineNum}:`);
    console.log(content.slice(start, end));
    console.log();
  }
}

// 3. Search for hidden header strings
console.log("=== SEARCH 3: Hidden header strings ===");
const headerPatterns = [
  "x-goog-api-client",
  "x-goog-request",
  "x-client-data",
  "x-device-id",
  "x-session-id",
  "x-request-id",
  "grpc-timeout",
  "grpc-encoding",
  "sec-ch-ua",
];
for (const p of headerPatterns) {
  let idx = -1;
  let count = 0;
  while ((idx = content.indexOf(p, idx + 1)) !== -1 && count < 5) {
    const lineNum = content.slice(0, idx).split("\n").length;
    const start = Math.max(0, idx - 200);
    const end = Math.min(content.length, idx + 300);
    console.log(`"${p}" at line ${lineNum}:`);
    console.log(content.slice(start, end));
    console.log();
    count++;
  }
}

// 4. Search for Authorization/Bearer near cloudcode or headers
console.log("=== SEARCH 4: Auth header injection ===");
let authIdx = -1;
let authCount = 0;
while ((authIdx = content.indexOf("Authorization", authIdx + 1)) !== -1 && authCount < 10) {
  const ctx = content.slice(Math.max(0, authIdx - 300), Math.min(content.length, authIdx + 300));
  if (ctx.includes("headers") || ctx.includes("interceptor") || ctx.includes("request")) {
    const lineNum = content.slice(0, authIdx).split("\n").length;
    console.log(`"Authorization" at line ${lineNum}:`);
    console.log(ctx);
    console.log();
    authCount++;
  }
}

// 5. Search for _qn and wqn (platform/arch functions)
console.log("=== SEARCH 5: Platform/Arch functions ===");
for (const fname of ["_qn", "wqn"]) {
  const pat = new RegExp(`(?:function\\s+${fname}|(?:const|let|var)\\s+${fname}\\s*=|${fname}\\s*=\\s*function)`, "g");
  let m;
  while ((m = pat.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    const start = Math.max(0, m.index - 50);
    const end = Math.min(content.length, m.index + 500);
    console.log(`"${fname}" definition at line ${lineNum}:`);
    console.log(content.slice(start, end));
    console.log();
  }
}

// 6. Search for platform/arch construction patterns
console.log("=== SEARCH 6: Platform strings ===");
for (const p of ["win32/amd64", "darwin/arm64", "linux/amd64", "process.platform", "process.arch"]) {
  let idx = content.indexOf(p);
  if (idx !== -1) {
    const lineNum = content.slice(0, idx).split("\n").length;
    const start = Math.max(0, idx - 200);
    const end = Math.min(content.length, idx + 300);
    console.log(`"${p}" at line ${lineNum}:`);
    console.log(content.slice(start, end));
    console.log();
  }
}
