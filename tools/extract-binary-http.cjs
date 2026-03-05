// Deep extract from language server binary - focus on HTTP request construction
// The Go binary is the actual HTTP client talking to googleapis.com
const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe";
const buf = fs.readFileSync(path);
const text = buf.toString("utf8", 0, buf.length);

function findContexts(text, pattern, before = 300, after = 500, maxResults = 5) {
  const results = [];
  let idx = 0;
  while (results.length < maxResults) {
    idx = text.indexOf(pattern, idx);
    if (idx === -1) break;
    // Extract printable ASCII context
    const start = Math.max(0, idx - before);
    const end = Math.min(text.length, idx + pattern.length + after);
    let ctx = "";
    for (let i = start; i < end; i++) {
      const ch = text.charCodeAt(i);
      if (ch >= 32 && ch < 127) {
        ctx += text[i];
      } else {
        ctx += ".";
      }
    }
    results.push({ offset: idx, context: ctx });
    idx += pattern.length;
  }
  return results;
}

// 1. x-goog-api-client - THIS IS CRITICAL
// We removed it from the plugin, but the Go binary has it
console.log("\n========== x-goog-api-client ==========");
const xgoog = findContexts(text, "x-goog-api-client", 200, 400);
xgoog.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 2. User-Agent construction in Go binary
console.log("\n========== User-Agent ==========");
const ua = findContexts(text, "User-Agent", 200, 400);
ua.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// user-agent (lowercase)
console.log("\n========== user-agent (lowercase) ==========");
const ualc = findContexts(text, "user-agent", 200, 400);
ualc.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 3. How generateContent is called
console.log("\n========== generateContent ==========");
const gc = findContexts(text, "generateContent", 300, 500);
gc.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

console.log("\n========== GenerateContent ==========");
const GC = findContexts(text, "GenerateContent", 300, 500);
GC.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 4. StreamGenerateContent
console.log("\n========== StreamGenerateContent ==========");
const sgc = findContexts(text, "StreamGenerateContent", 300, 500);
sgc.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 5. CloudCodeServerUrl - the actual endpoint configuration
console.log("\n========== CloudCodeServerUrl ==========");
const ccsurl = findContexts(text, "CloudCodeServerUrl", 200, 400);
ccsurl.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

console.log("\n========== cloudCodeServerUrl ==========");
const ccsurl2 = findContexts(text, "cloudCodeServerUrl", 200, 400);
ccsurl2.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 6. How the Go binary makes HTTP requests (google-api-go-client patterns)
console.log("\n========== google-api-go ==========");
const gapiGo = findContexts(text, "google-api-go", 100, 300, 3);
gapiGo.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 7. gl-go - Go client SDK header value
console.log("\n========== gl-go ==========");
const glgo = findContexts(text, "gl-go/", 100, 300, 5);
glgo.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 8. gax-go
console.log("\n========== gax ==========");
const gax = findContexts(text, "gax/", 100, 300, 3);
gax.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 9. google.golang.org patterns
console.log("\n========== google.golang.org ==========");
const ggo = findContexts(text, "google.golang.org", 50, 200, 5);
ggo.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 10. oauth2 token handling in Go
console.log("\n========== oauth2.googleapis.com ==========");
const oauth2 = findContexts(text, "oauth2.googleapis.com", 200, 400);
oauth2.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 11. grpc-go version
console.log("\n========== grpc-go/ ==========");
const grpcGoVer = findContexts(text, "grpc-go/", 50, 200, 3);
grpcGoVer.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));

// 12. The actual HTTP method used
console.log("\n========== POST ==========");
// Search for POST near cloudcode to see HTTP method 
const postNearCC = findContexts(text, "cloudcode-pa.googleapis.com", 50, 400);
postNearCC.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]:\n${r.context}\n`));
