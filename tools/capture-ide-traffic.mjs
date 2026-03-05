#!/usr/bin/env node
/**
 * Antigravity IDE Network Traffic Capture Tool
 *
 * Captures real HTTP(S) requests from the Antigravity IDE using
 * Chrome DevTools Protocol (CDP). No MITM proxy or certificates needed.
 *
 * Usage:
 *   1. Close any running Antigravity instances
 *   2. Run: node tools/capture-ide-traffic.mjs
 *   3. Use Antigravity normally (chat, code assist, etc.)
 *   4. Press Ctrl+C to stop and save the capture log
 *
 * Output: tools/captured-traffic.json
 */

import { execSync, spawn } from "node:child_process"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"

const ANTIGRAVITY_EXE = "E:\\Antigravity\\Antigravity.exe"
const CDP_PORT = 9222
const TARGET_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "autopush-cloudcode-pa.sandbox.googleapis.com",
  "play.googleapis.com",
]
const OUTPUT_FILE = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "captured-traffic.json")

const capturedRequests = []

// ── CDP WebSocket client (minimal, no dependencies) ──

function cdpRequest(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const payload = JSON.stringify({ id, method, params })

    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id === id) {
          ws.removeListener("message", handler)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      } catch {}
    }

    ws.on("message", handler)
    ws.send(payload)
  })
}

async function getWebSocketUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      let body = ""
      res.on("data", (chunk) => (body += chunk))
      res.on("end", () => {
        try {
          const data = JSON.parse(body)
          resolve(data.webSocketDebuggerUrl)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on("error", reject)
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error("Timeout connecting to CDP"))
    })
  })
}

async function getTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, (res) => {
      let body = ""
      res.on("data", (chunk) => (body += chunk))
      res.on("end", () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on("error", reject)
    req.setTimeout(5000, () => {
      req.destroy()
      reject(new Error("Timeout"))
    })
  })
}

function connectWebSocket(url) {
  // Minimal WebSocket client using raw TCP (avoids npm dependency)
  // For simplicity, use the built-in WebSocket if available (Node 21+)
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url)
      ws.on("open", () => resolve(ws))
      ws.on("error", reject)
    } catch {
      reject(new Error("WebSocket not available. Use Node.js 21+ or install 'ws' package."))
    }
  })
}

function isTargetUrl(url) {
  if (!url) return false
  return TARGET_HOSTS.some((host) => url.includes(host))
}

function sanitizeHeaders(headers) {
  const sanitized = { ...headers }
  // Redact auth tokens but keep the format
  if (sanitized.Authorization || sanitized.authorization) {
    const key = sanitized.Authorization ? "Authorization" : "authorization"
    const val = sanitized[key]
    if (typeof val === "string" && val.startsWith("Bearer ")) {
      sanitized[key] = `Bearer [REDACTED_${val.length - 7}_chars]`
    }
  }
  return sanitized
}

function truncateBody(body, maxLen = 2000) {
  if (!body) return null
  if (body.length <= maxLen) return body
  return body.slice(0, maxLen) + `...[truncated, total ${body.length} chars]`
}

// ── Main ──

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗")
  console.log("║  Antigravity IDE Network Traffic Capture                    ║")
  console.log("╚══════════════════════════════════════════════════════════════╝")
  console.log()

  // Step 1: Launch Antigravity with remote debugging
  console.log(`[1/4] Launching Antigravity IDE with CDP on port ${CDP_PORT}...`)
  console.log(`       Exe: ${ANTIGRAVITY_EXE}`)

  const child = spawn(ANTIGRAVITY_EXE, [`--remote-debugging-port=${CDP_PORT}`], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()

  console.log(`       PID: ${child.pid}`)
  console.log()

  // Step 2: Wait for CDP to become available
  console.log("[2/4] Waiting for CDP endpoint...")
  let wsUrl = null
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      wsUrl = await getWebSocketUrl()
      if (wsUrl) break
    } catch {
      process.stdout.write(".")
    }
  }
  if (!wsUrl) {
    console.error("\n       ERROR: Could not connect to CDP. Is Antigravity running?")
    process.exit(1)
  }
  console.log(`\n       Connected: ${wsUrl}`)
  console.log()

  // Step 3: Connect and enable Network monitoring
  console.log("[3/4] Connecting to CDP and enabling Network domain...")
  const ws = await connectWebSocket(wsUrl)

  // Enable Network domain
  await cdpRequest(ws, "Network.enable", {
    maxTotalBufferSize: 10000000,
    maxResourceBufferSize: 5000000,
  })
  console.log("       Network monitoring enabled.")
  console.log()

  // Also try to attach to all targets (extension host, shared process)
  try {
    const targets = await getTargets()
    console.log(`       Found ${targets.length} CDP targets:`)
    for (const t of targets) {
      console.log(`         - [${t.type}] ${t.title?.slice(0, 60) || t.url?.slice(0, 60)}`)
    }
  } catch {}

  // Step 4: Capture traffic
  console.log()
  console.log("[4/4] Capturing traffic... (use Antigravity normally, press Ctrl+C to stop)")
  console.log("       Watching for requests to:")
  for (const host of TARGET_HOSTS) {
    console.log(`         • ${host}`)
  }
  console.log()

  const pendingRequests = new Map()

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())

      // Network.requestWillBeSent — captures outgoing requests
      if (msg.method === "Network.requestWillBeSent") {
        const { requestId, request, timestamp, type } = msg.params
        if (isTargetUrl(request.url)) {
          const entry = {
            id: requestId,
            timestamp: new Date().toISOString(),
            cdpTimestamp: timestamp,
            type,
            method: request.method,
            url: request.url,
            headers: sanitizeHeaders(request.headers),
            postData: truncateBody(request.postData),
            headerOrder: Object.keys(request.headers),
          }
          pendingRequests.set(requestId, entry)

          console.log(`  ▶ [${entry.timestamp}] ${request.method} ${request.url}`)
          console.log(`    Headers (${Object.keys(request.headers).length}):`)
          for (const [k, v] of Object.entries(sanitizeHeaders(request.headers))) {
            const displayVal = typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "..." : v
            console.log(`      ${k}: ${displayVal}`)
          }
          if (request.postData) {
            try {
              const body = JSON.parse(request.postData)
              const topKeys = Object.keys(body)
              console.log(`    Body keys: [${topKeys.join(", ")}]`)
              if (body.model) console.log(`    Model: ${body.model}`)
              if (body.project) console.log(`    Project: ${body.project}`)
              if (body.request?.model) console.log(`    Request.model: ${body.request.model}`)
              // Check for metadata in body (vs header)
              if (body.metadata) console.log(`    Body.metadata: ${JSON.stringify(body.metadata)}`)
              if (body.request?.metadata) console.log(`    Body.request.metadata: ${JSON.stringify(body.request.metadata)}`)
            } catch {}
          }
          console.log()
        }
      }

      // Network.responseReceived — captures response headers
      if (msg.method === "Network.responseReceived") {
        const { requestId, response } = msg.params
        const entry = pendingRequests.get(requestId)
        if (entry) {
          entry.response = {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            protocol: response.protocol,
            securityState: response.securityState,
            // TLS info
            securityDetails: response.securityDetails
              ? {
                  protocol: response.securityDetails.protocol,
                  cipher: response.securityDetails.cipher,
                  subjectName: response.securityDetails.subjectName,
                  issuer: response.securityDetails.issuer,
                }
              : null,
          }

          console.log(`  ◀ [${new Date().toISOString()}] ${response.status} ${response.statusText}`)
          console.log(`    Protocol: ${response.protocol}`)
          if (response.securityDetails) {
            console.log(`    TLS: ${response.securityDetails.protocol} / ${response.securityDetails.cipher}`)
          }
          console.log()

          capturedRequests.push(entry)
          pendingRequests.delete(requestId)
        }
      }

      // Network.requestWillBeSentExtraInfo — additional headers (cookies, etc.)
      if (msg.method === "Network.requestWillBeSentExtraInfo") {
        const { requestId, headers } = msg.params
        const entry = pendingRequests.get(requestId)
        if (entry) {
          entry.extraHeaders = sanitizeHeaders(headers)
          console.log(`  ℹ Extra headers for ${entry.url.split("/").pop()}:`)
          for (const [k, v] of Object.entries(sanitizeHeaders(headers))) {
            if (!entry.headers[k]) {
              console.log(`    + ${k}: ${v}`)
            }
          }
          console.log()
        }
      }
    } catch {}
  })

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log()
    console.log("═══════════════════════════════════════════════════════════════")
    console.log(`Captured ${capturedRequests.length} API requests.`)

    if (capturedRequests.length > 0) {
      const output = {
        captureDate: new Date().toISOString(),
        electronVersion: "39.2.3",
        ideVersion: "1.19.6",
        totalRequests: capturedRequests.length,
        requests: capturedRequests,
      }
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
      console.log(`Saved to: ${OUTPUT_FILE}`)

      // Print summary
      console.log()
      console.log("Header Summary (from first request):")
      const first = capturedRequests[0]
      if (first) {
        console.log("  Standard headers:")
        for (const [k, v] of Object.entries(first.headers)) {
          console.log(`    ${k}: ${typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : v}`)
        }
        if (first.extraHeaders) {
          console.log("  Extra headers (Chromium-added):")
          for (const [k, v] of Object.entries(first.extraHeaders)) {
            if (!first.headers[k]) {
              console.log(`    ${k}: ${v}`)
            }
          }
        }
      }
    } else {
      console.log("No API requests captured. Try using Antigravity chat or code assist features.")
    }

    console.log()
    console.log("Done. Close Antigravity manually if needed.")
    process.exit(0)
  })
}

main().catch((err) => {
  console.error("Fatal error:", err.message)
  process.exit(1)
})
