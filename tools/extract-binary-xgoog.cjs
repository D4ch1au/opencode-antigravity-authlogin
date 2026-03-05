// Extract x-goog-api-client header value construction from Go binary
// Go's google-api-go-client constructs this header with specific format
const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe";
const buf = fs.readFileSync(path);
const text = buf.toString("utf8", 0, buf.length);

function findPrintableContexts(text, pattern, before = 500, after = 500, max = 5) {
  const results = [];
  let idx = 0;
  while (results.length < max) {
    idx = text.indexOf(pattern, idx);
    if (idx === -1) break;
    const start = Math.max(0, idx - before);
    const end = Math.min(text.length, idx + pattern.length + after);
    let ctx = "";
    for (let i = start; i < end; i++) {
      const ch = text.charCodeAt(i);
      if (ch >= 32 && ch < 127) ctx += text[i];
      else ctx += ".";
    }
    results.push({ offset: idx, context: ctx });
    idx += pattern.length;
  }
  return results;
}

// 1. gl-go/ pattern - this is part of x-goog-api-client value
console.log("========== gl-go/ (Go version component) ==========");
findPrintableContexts(text, "gl-go/", 200, 500).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 2. gdcl/ pattern - Google Discovery Client Library
console.log("========== gdcl/ ==========");
findPrintableContexts(text, "gdcl/", 200, 400).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 3. gccl/ pattern - Google Cloud Client Library
console.log("========== gccl/ ==========");
findPrintableContexts(text, "gccl/", 200, 400).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 4. gax/ pattern - Google API Extensions
console.log("========== gax/ version ==========");
findPrintableContexts(text, "gax/v", 200, 400, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 5. auth/ pattern for go auth
console.log("========== auth/ ==========");
findPrintableContexts(text, " auth/", 100, 300, 5).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 6. grpc-go version
console.log("========== grpc-go version ==========");
findPrintableContexts(text, "grpc-go/", 100, 300, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 7. The actual x-goog-api-client value construction
// In Go SDKs, it's typically: "gl-go/1.xx gdcl/0.xx" or "gl-go/1.xx gccl/0.xx gax/2.xx grpc/1.xx"
console.log("========== x-goog-api-client value patterns ==========");
findPrintableContexts(text, "x-goog-api-client", 300, 600).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 8. User-Agent construction in Go
console.log("========== User-Agent construction ==========");
findPrintableContexts(text, "User-Agent: %s", 300, 500).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 9. The actual endpoint URL used
console.log("========== endpoint URL ==========");
findPrintableContexts(text, "https://cloudcode-pa", 100, 400).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

findPrintableContexts(text, "https://daily-cloudcode-pa", 100, 400).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 10. How OAuth token is attached
console.log("========== token attachment ==========");
findPrintableContexts(text, "Bearer %s", 200, 400, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 11. google-c2p - traffic director
console.log("========== traffic-director / c2p ==========");
findPrintableContexts(text, "traffic-director", 100, 400, 2).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 12. The actual Go version compiled into binary
console.log("========== Go version ==========");
findPrintableContexts(text, "go1.", 20, 40, 10).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context}`));

// 13. source/ sa-impersonation/ pattern (found in gl-go search)
console.log("\n========== source/ sa-impersonation ==========");
findPrintableContexts(text, "source/", 200, 400, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 14. google-byoid-sdk
console.log("========== google-byoid-sdk ==========");
findPrintableContexts(text, "google-byoid-sdk", 200, 400).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));
