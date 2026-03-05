// Extract critical patterns from extension.js
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

// 1. getCloudCodeUrl - how the endpoint is determined
console.log("\n========== getCloudCodeUrl ==========");
extractAll(c, "getCloudCodeUrl", 100, 800).forEach((r, i) => 
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 900)}\n`));

// 2. Function G - creates the ConnectRPC transport + client
console.log("\n========== function G(e,t) - transport creation ==========");
// We know from offset 990819 that G(csrfToken, address) creates the transport
const gFunc = extractAll(c, "function G(e,t){const n=[t=>async n=>(n.header.set", 0, 1500, 1);
gFunc.forEach((r, i) => console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 1500)}\n`));

// 3. EXTENSION_METADATA definition - ideName, ideVersion etc.
console.log("\n========== EXTENSION_METADATA definition ==========");
extractAll(c, "EXTENSION_METADATA", 100, 500, 3).forEach((r, i) => 
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// 4. Model enum definition
console.log("\n========== Model enum ==========");
extractAll(c, "Model=void 0", 50, 2000, 1).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 2000)}\n`));

// Alternative: search for Model enum values  
extractAll(c, "UNSPECIFIED=0", 100, 2000, 1).forEach((r, i) =>
  console.log(`[Model enum at ${r.offset}]: ${r.context.substring(0, 2000)}\n`));

// 5. deviceFingerprint - how it's generated
console.log("\n========== deviceFingerprint ==========");
extractAll(c, "deviceFingerprint", 200, 500).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 700)}\n`));

// 6. MetadataSchema - the protobuf schema for metadata
console.log("\n========== MetadataSchema ==========");
extractAll(c, "MetadataSchema", 200, 600, 3).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 800)}\n`));

// 7. getCloudCodeUrl implementation
console.log("\n========== cloudCodeUrl logic ==========");
extractAll(c, "cloudCodeUrlOverride", 200, 800, 2).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 1000)}\n`));

// 8. AntigravityExtensionMetadata class
console.log("\n========== AntigravityExtensionMetadata ==========");
extractAll(c, "AntigravityExtensionMetadata", 100, 800, 2).forEach((r, i) =>
  console.log(`[#${i+1} at ${r.offset}]: ${r.context.substring(0, 900)}\n`));
