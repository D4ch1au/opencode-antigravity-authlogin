#!/usr/bin/env node
/**
 * Auto-terminating Antigravity IDE Network Traffic Capture
 *
 * Launches Antigravity with CDP, captures API traffic for up to CAPTURE_DURATION_MS,
 * then auto-saves and exits. No interaction needed.
 *
 * Also captures via Chromium net-log as backup.
 */

import { spawn } from "node:child_process"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ANTIGRAVITY_EXE = "E:\\Antigravity\\Antigravity.exe"
const CDP_PORT = 9222
const CAPTURE_DURATION_MS = 120_000 // 2 minutes
const NET_LOG_FILE = path.join(__dirname, "chromium-net-log.json")
const OUTPUT_FILE = path.join(__dirname, "captured-traffic.json")

const TARGET_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "autopush-cloudcode-pa.sandbox.googleapis.com",
  "autopush-cloudcode-pa.googleapis.com",
  "play.googleapis.com",
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
  "oauth2.googleapis.com",
  "accounts.google.com",
  "www.googleapis.com",
]

const capturedRequests = []
let antigravityProcess = null

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function sanitizeHeaders(headers) {
  if (!headers) return {}
  const sanitized = { ...headers }
  for (const key of Object.keys(sanitized)) {
    if (key.toLowerCase() === "authorization") {
      const val = sanitized[key]
      if (typeof val === "string" && val.startsWith("Bearer ")) {
        sanitized[key] = `Bearer [REDACTED_${val.length - 7}_chars]`
      }
    }
    if (key.toLowerCase() === "cookie") {
      sanitized[key] = "[REDACTED]"
    }
  }
  return sanitized
}

function truncateBody(body, maxLen = 4000) {
  if (!body) return null
  if (body.length <= maxLen) return body
  return body.slice(0, maxLen) + `...[truncated, total ${body.length} chars]`
}

function isTargetUrl(url) {
  if (!url) return false
  return TARGET_HOSTS.some((host) => url.includes(host))
}

// ── CDP helpers ──

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = ""
      res.on("data", (chunk) => (body += chunk))
      res.on("end", () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(e) }
      })
    })
    req.on("error", reject)
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")) })
  })
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 10000)

    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data ?? event.toString())
        if (msg.id === id) {
          clearTimeout(timer)
          ws.removeEventListener ? ws.removeEventListener("message", handler) : ws.off?.("message", handler)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      } catch {}
    }

    ws.addEventListener ? ws.addEventListener("message", handler) : ws.on?.("message", handler)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener("open", () => resolve(ws))
    ws.addEventListener("error", (e) => reject(e))
    setTimeout(() => reject(new Error("WebSocket connect timeout")), 10000)
  })
}

// ── Main ──

async function main() {
  log("══════════════════════════════════════════════════════════════")
  log("  Antigravity IDE Auto-Capture (non-interactive)")
  log(`  Duration: ${CAPTURE_DURATION_MS / 1000}s`)
  log("══════════════════════════════════════════════════════════════")

  // 1. Launch Antigravity with CDP + net-log
  log("Launching Antigravity IDE...")
  antigravityProcess = spawn(ANTIGRAVITY_EXE, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--log-net-log=${NET_LOG_FILE}`,
    "--net-log-capture-mode=Everything",
  ], {
    detached: true,
    stdio: "ignore",
  })
  antigravityProcess.unref()
  log(`  PID: ${antigravityProcess.pid}`)

  // 2. Wait for CDP
  log("Waiting for CDP endpoint...")
  let browserWsUrl = null
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const info = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`)
      browserWsUrl = info.webSocketDebuggerUrl
      if (browserWsUrl) {
        log(`  Connected: ${browserWsUrl}`)
        log(`  Browser: ${info.Browser}`)
        log(`  Protocol: ${info["Protocol-Version"]}`)
        log(`  User-Agent: ${info["User-Agent"]}`)
        break
      }
    } catch {
      process.stdout.write(".")
    }
  }

  if (!browserWsUrl) {
    log("ERROR: Could not connect to CDP after 80s")
    cleanup()
    return
  }

  // 3. List all targets
  try {
    const targets = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/list`)
    log(`  Found ${targets.length} CDP targets:`)
    for (const t of targets) {
      log(`    [${t.type}] ${(t.title || t.url || "").slice(0, 80)}`)
    }
  } catch (e) {
    log(`  Could not list targets: ${e.message}`)
  }

  // 4. Connect to browser and enable Network monitoring
  log("Connecting to browser CDP target...")
  const ws = await connectWs(browserWsUrl)
  
  await cdpSend(ws, "Network.enable", {
    maxTotalBufferSize: 50_000_000,
    maxResourceBufferSize: 10_000_000,
  })
  log("  Network.enable OK")

  // Also enable Fetch domain for more detailed request interception info
  try {
    await cdpSend(ws, "Network.setCacheDisabled", { cacheDisabled: false })
  } catch {}

  // 5. Listen for events
  const pendingRequests = new Map()
  let eventCount = 0

  const messageHandler = (event) => {
    try {
      const msg = JSON.parse(event.data ?? event.toString())
      if (!msg.method) return

      // Track ALL requests for debugging, but only detail-log target ones
      if (msg.method === "Network.requestWillBeSent") {
        const { requestId, request, timestamp, type, initiator } = msg.params
        eventCount++
        
        if (isTargetUrl(request.url)) {
          const entry = {
            id: requestId,
            capturedAt: new Date().toISOString(),
            cdpTimestamp: timestamp,
            type,
            method: request.method,
            url: request.url,
            headers: sanitizeHeaders(request.headers),
            headerOrder: Object.keys(request.headers),
            postData: truncateBody(request.postData),
            initiator: initiator ? {
              type: initiator.type,
              url: initiator.url?.slice(0, 200),
              lineNumber: initiator.lineNumber,
            } : null,
          }
          pendingRequests.set(requestId, entry)

          log(`▶ ${request.method} ${request.url}`)
          log(`  Headers (${Object.keys(request.headers).length}):`)
          for (const [k, v] of Object.entries(sanitizeHeaders(request.headers))) {
            const displayVal = typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "..." : v
            log(`    ${k}: ${displayVal}`)
          }
          if (request.postData) {
            try {
              const body = JSON.parse(request.postData)
              log(`  Body top-level keys: [${Object.keys(body).join(", ")}]`)
              if (body.model) log(`  Body.model: ${body.model}`)
              if (body.project) log(`  Body.project: ${body.project}`)
              if (body.userAgent) log(`  Body.userAgent: ${body.userAgent}`)
              if (body.requestId) log(`  Body.requestId: ${body.requestId}`)
              if (body.metadata) log(`  Body.metadata: ${JSON.stringify(body.metadata)}`)
              if (body.request) {
                log(`  Body.request keys: [${Object.keys(body.request).join(", ")}]`)
                if (body.request.model) log(`  Body.request.model: ${body.request.model}`)
                if (body.request.metadata) log(`  Body.request.metadata: ${JSON.stringify(body.request.metadata)}`)
              }
            } catch {
              // Not JSON, might be protobuf or form data
              log(`  Body (non-JSON): ${request.postData.slice(0, 200)}`)
            }
          }
          log("")
        }
      }

      if (msg.method === "Network.requestWillBeSentExtraInfo") {
        const { requestId, headers, associatedCookies } = msg.params
        const entry = pendingRequests.get(requestId)
        if (entry) {
          entry.extraHeaders = sanitizeHeaders(headers)
          // These are the ACTUAL headers sent on the wire (including Chromium-added ones)
          log(`ℹ  Extra/wire headers for ${entry.url.split("/").pop()}:`)
          for (const [k, v] of Object.entries(sanitizeHeaders(headers))) {
            // Only log headers NOT in the original set
            if (!entry.headers[k.toLowerCase()] && !entry.headers[k]) {
              const displayVal = typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "..." : v
              log(`    + ${k}: ${displayVal}`)
            }
          }
          if (associatedCookies?.length > 0) {
            entry.cookieCount = associatedCookies.length
            log(`    Cookies: ${associatedCookies.length} associated`)
          }
          log("")
        }
      }

      if (msg.method === "Network.responseReceived") {
        const { requestId, response } = msg.params
        const entry = pendingRequests.get(requestId)
        if (entry) {
          entry.response = {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            protocol: response.protocol,
            remoteAddress: response.remoteIPAddress ? `${response.remoteIPAddress}:${response.remotePort}` : null,
            securityDetails: response.securityDetails ? {
              protocol: response.securityDetails.protocol,
              cipher: response.securityDetails.cipher,
              subjectName: response.securityDetails.subjectName,
              issuer: response.securityDetails.issuer,
              sanList: response.securityDetails.sanList,
            } : null,
          }

          log(`◀ ${response.status} ${response.statusText} for ${entry.url.split("/").pop()}`)
          log(`  Protocol: ${response.protocol}`)
          if (response.remoteIPAddress) {
            log(`  Remote: ${response.remoteIPAddress}:${response.remotePort}`)
          }
          if (response.securityDetails) {
            log(`  TLS: ${response.securityDetails.protocol} / ${response.securityDetails.cipher}`)
          }
          log("")

          capturedRequests.push(entry)
          pendingRequests.delete(requestId)
        }
      }

      // Also capture loading failures
      if (msg.method === "Network.loadingFailed") {
        const { requestId, errorText, canceled } = msg.params
        const entry = pendingRequests.get(requestId)
        if (entry) {
          entry.error = { errorText, canceled }
          capturedRequests.push(entry)
          pendingRequests.delete(requestId)
          log(`✗ Failed: ${entry.url.split("/").pop()} - ${errorText}`)
        }
      }
    } catch {}
  }

  ws.addEventListener ? ws.addEventListener("message", messageHandler) : ws.on("message", messageHandler)

  // 6. Wait for duration
  log(`Capturing for ${CAPTURE_DURATION_MS / 1000}s... (use Antigravity normally if you want model-specific traffic)`)
  log(`Watching: ${TARGET_HOSTS.join(", ")}`)
  log("")

  // Progress updates every 15s
  const progressInterval = setInterval(() => {
    log(`  ... ${capturedRequests.length} API requests captured, ${eventCount} total network events`)
  }, 15000)

  await new Promise((r) => setTimeout(r, CAPTURE_DURATION_MS))
  clearInterval(progressInterval)

  // 7. Save and cleanup
  saveAndReport()
  cleanup()
}

function saveAndReport() {
  log("══════════════════════════════════════════════════════════════")
  log(`Capture complete. ${capturedRequests.length} API requests captured.`)

  if (capturedRequests.length > 0) {
    const output = {
      captureDate: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      totalRequests: capturedRequests.length,
      requests: capturedRequests,
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
    log(`Saved to: ${OUTPUT_FILE}`)

    // Detailed summary
    log("")
    log("═══ REQUEST SUMMARY ═══")
    
    // Group by endpoint
    const byEndpoint = new Map()
    for (const req of capturedRequests) {
      const urlObj = new URL(req.url)
      const key = `${req.method} ${urlObj.host}${urlObj.pathname}`
      if (!byEndpoint.has(key)) byEndpoint.set(key, [])
      byEndpoint.get(key).push(req)
    }

    for (const [endpoint, reqs] of byEndpoint) {
      log(`\n  ${endpoint} (×${reqs.length})`)
      const first = reqs[0]
      log("    Headers:")
      for (const [k, v] of Object.entries(first.headers)) {
        log(`      ${k}: ${typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "..." : v}`)
      }
      if (first.extraHeaders) {
        log("    Extra headers (Chromium/Electron added):")
        for (const [k, v] of Object.entries(first.extraHeaders)) {
          if (!first.headers[k]) {
            log(`      ${k}: ${typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "..." : v}`)
          }
        }
      }
      if (first.postData) {
        try {
          const body = JSON.parse(first.postData)
          log(`    Body structure: ${JSON.stringify(Object.keys(body))}`)
          // Print full body for first request of each type
          log(`    Full body: ${first.postData.slice(0, 2000)}`)
        } catch {
          log(`    Body (non-JSON): ${first.postData.slice(0, 500)}`)
        }
      }
    }
  } else {
    log("No API requests captured.")
    log("This could mean:")
    log("  - No Google account is logged in to Antigravity")
    log("  - Antigravity didn't make API calls during the capture window")
    log("  - Extension host network traffic isn't visible from browser CDP target")
    log("")
    log(`Check Chromium net-log at: ${NET_LOG_FILE}`)
  }
}

function cleanup() {
  log("")
  log("Terminating Antigravity process...")
  try {
    if (antigravityProcess?.pid) {
      // Kill the process tree on Windows
      spawn("taskkill", ["/F", "/T", "/PID", String(antigravityProcess.pid)], { stdio: "ignore" })
    }
  } catch {}
  
  setTimeout(() => process.exit(0), 2000)
}

// Handle unexpected termination
process.on("SIGINT", () => { saveAndReport(); cleanup() })
process.on("SIGTERM", () => { saveAndReport(); cleanup() })
process.on("uncaughtException", (e) => {
  log(`Uncaught error: ${e.message}`)
  saveAndReport()
  cleanup()
})

main().catch((err) => {
  log(`Fatal error: ${err.message}`)
  log(err.stack)
  cleanup()
})
