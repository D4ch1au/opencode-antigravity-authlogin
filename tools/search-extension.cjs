const fs = require("fs");
const path = "E:\\Antigravity\\resources\\app\\extensions\\antigravity\\dist\\extension.js";
const c = fs.readFileSync(path, "utf8");
console.log("File size:", c.length, "bytes");
console.log("Lines:", c.split("\n").length);

const patterns = [
  "generateContent",
  "streamGenerateContent",
  "cloudcode-pa",
  "googleapis.com",
  "User-Agent",
  "userAgent",
  "ideVersion",
  "ideType",
  "ideName",
  "chatCompletions",
  "models/",
  "Content-Type",
  "Authorization",
  "Bearer ",
  "x-goog-api-client",
  "X-Goog-Api-Client",
  "client-metadata",
  "Client-Metadata",
  "antigravity/",
  "cloudcode",
  "fetchAvailableModels",
  "loadCodeAssist",
  "onboardUser",
  "recordCodeAssist",
  "OAuth2Client",
  "setCredentials",
  "access_token",
  "refresh_token",
  "request(",
  "protobuf",
  "fromJson",
  "toJson",
  "machineId",
  "deviceId",
  "sessionToken",
  "fingerprint",
];

for (const p of patterns) {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = c.match(new RegExp(escaped, "g"));
  const count = matches ? matches.length : 0;
  const idx = c.indexOf(p);
  if (idx >= 0) {
    const context = c.substring(Math.max(0, idx - 200), idx + p.length + 200);
    const clean = context.replace(/\n/g, "\\n");
    console.log(`\n=== ${p} === (${count} occurrences, first at offset ${idx})`);
    console.log(clean);
  } else {
    console.log(`\n=== ${p} === NOT FOUND`);
  }
}
