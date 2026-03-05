// Extract interesting strings from the language server binary
// Focus on: HTTP headers, UA strings, API endpoints, proto service names, model names
const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\bin\\language_server_windows_x64.exe";

// Read binary file
const buf = fs.readFileSync(path);
const text = buf.toString("utf8", 0, buf.length);

// Search patterns in binary
const patterns = [
  // API endpoints
  { name: "cloudcode-pa", regex: /[\w.-]*cloudcode[\w.-]*/g },
  { name: "googleapis", regex: /[\w.-]*googleapis[\w.-]*/g },
  { name: "generativelanguage", regex: /[\w.-]*generativelanguage[\w.-]*/g },
  
  // HTTP headers
  { name: "User-Agent header", regex: /[Uu]ser-[Aa]gent/g },
  { name: "x-goog headers", regex: /x-goog-[\w-]+/g },
  { name: "Content-Type", regex: /Content-Type/g },
  { name: "Authorization", regex: /Authorization/g },
  
  // UA strings
  { name: "antigravity/", regex: /antigravity\/[\d.]+/g },
  { name: "jetski/", regex: /jetski\/[\d.]+/g },
  
  // Model names
  { name: "claude model", regex: /claude-[\w.-]+/g },
  { name: "gemini model", regex: /gemini-[\w.-]+/g },
  { name: "models/", regex: /models\/[\w.-]+/g },
  
  // Proto services
  { name: "generateContent", regex: /[Gg]enerate[Cc]ontent/g },
  { name: "streamGenerateContent", regex: /[Ss]tream[Gg]enerate[Cc]ontent/g },
  { name: "CodeAssist", regex: /[Cc]ode[Aa]ssist[\w]*/g },
  { name: "CloudCode", regex: /[Cc]loud[Cc]ode[\w]*/g },
  
  // gRPC related
  { name: "grpc", regex: /grpc[\w.-]*/g },
  
  // Metadata fields
  { name: "ideVersion", regex: /ideVersion/g },
  { name: "ideType", regex: /ideType/g },
  { name: "ideName", regex: /ideName/g },
  { name: "machineId", regex: /machineId/g },
  { name: "deviceId", regex: /deviceId/g },
  { name: "sessionId", regex: /sessionId/g },
  { name: "fingerprint", regex: /fingerprint/g },
  
  // Important config
  { name: "telemetry", regex: /telemetry/gi },
  { name: "clearcut", regex: /clearcut/gi },
  { name: "recordCodeAssist", regex: /recordCodeAssist/gi },
];

for (const p of patterns) {
  const matches = [...new Set(text.match(p.regex) || [])];
  if (matches.length === 0) {
    console.log(`${p.name}: NOT FOUND`);
  } else {
    // Deduplicate and show unique values
    const unique = [...new Set(matches)].sort();
    console.log(`\n=== ${p.name} === (${matches.length} raw, ${unique.length} unique)`);
    // Show up to 50 unique values
    for (const m of unique.slice(0, 50)) {
      console.log(`  ${m}`);
    }
    if (unique.length > 50) console.log(`  ... and ${unique.length - 50} more`);
  }
}
