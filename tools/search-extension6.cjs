// Find getCloudCodeUrl definition in the env module
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

// Find getCloudCodeUrl in the env module (module 91398 is vscode, so it's probably in a different module)
console.log("========== getCloudCodeUrl definition ==========");
extractAll(c, "getCloudCodeUrl", 300, 1200, 5).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 1400)}\n`));

// Find env.ts / config module that exports getCloudCodeUrl  
console.log("\n========== daily-cloudcode ==========");
extractAll(c, "daily-cloudcode", 300, 800, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 1000)}\n`));

// Find EXTENSION_METADATA ideName
console.log("\n========== EXTENSION_METADATA ideName static ==========");
extractAll(c, "static ideName=", 100, 600, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// Find the Model proto enum from common_pb
console.log("\n========== Model proto enum ==========");
extractAll(c, "ModelSchema", 100, 600, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// Find the actual Model enum values (not ActionStatus)
console.log("\n========== Model values ==========");
extractAll(c, "CHAT_SONIC", 100, 2000, 1).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 2000)}\n`));

// Try finding GEMINI_ or CLAUDE_ enum names
extractAll(c, "CLAUDE_", 100, 1500, 2).forEach((r, i) =>
  console.log(`[CLAUDE at ${r.offset}]: ${r.context.substring(0, 1500)}\n`));
