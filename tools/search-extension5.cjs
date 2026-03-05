// Find getCloudCodeUrl implementation and Model enum values
const fs = require("fs");
const c = fs.readFileSync("E:\\Antigravity\\resources\\app\\extensions\\antigravity\\dist\\extension.js", "utf8");

function extractAll(content, pattern, before = 200, after = 600, max = 5) {
  const results = [];
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "g");
  let match;
  while ((match = re.exec(content)) !== null && results.length < max) {
    const start = Math.max(0, match.index - before);
    const end = Math.min(content.length, match.index + match[0].length + after);
    results.push({ offset: match.index, context: content.substring(start, end).replace(/\n/g, "\\n") });
  }
  return results;
}

// 1. getCloudCodeUrl function implementation
console.log("========== getCloudCodeUrl IMPLEMENTATION ==========");
extractAll(c, "getCloudCodeUrl=function", 50, 1500, 2).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 1500)}\n`));

// alt search
extractAll(c, "getCloudCodeUrl:", 50, 1000, 2).forEach((r, i) =>
  console.log(`[ALT #${i+1} at ${r.offset}]: ${r.context.substring(0, 1000)}\n`));

// 2. cloudcode-pa URL strings in extension.js
console.log("========== cloudcode-pa in extension.js ==========");
extractAll(c, "cloudcode-pa", 200, 500, 5).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// 3. Model enum - find the actual values
console.log("========== Model enum values ==========");
extractAll(c, "e.UNSPECIFIED=0", 50, 3000, 1).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 3000)}\n`));

// 4. LanguageServerService definition
console.log("========== LanguageServerService ==========");
extractAll(c, "LanguageServerService", 200, 600, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 800)}\n`));

// 5. How token/apiKey is passed to language server
console.log("========== apiKey passing to LS ==========");
extractAll(c, "apiKey", 200, 400, 5).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 600)}\n`));

// 6. Is there any REST call in extension.js to cloudcode?
console.log("========== /v1internal ==========");
extractAll(c, "v1internal", 200, 500, 5).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// 7. installationId 
console.log("========== installationId ==========");
extractAll(c, "installationId", 200, 500, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));
