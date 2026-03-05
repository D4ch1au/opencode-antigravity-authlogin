// Multi-target CDP capture script - monitors browser + all page targets
const http = require("http")
const fs = require("fs")

const TARGET_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa",
  "autopush-cloudcode-pa",
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
  "oauth2.googleapis.com",
  "play.googleapis.com",
]

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ""
      res.on("data", (c) => (body += c))
      res.on("end", () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on("error", reject)
  })
}

function cdpSend(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => reject(new Error("timeout " + method)), 10000)
    ws.addEventListener("message", function handler(ev) {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.id === id) {
          clearTimeout(timer)
          ws.removeEventListener("message", handler)
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
        }
      } catch {}
    })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
}

function isTarget(url) {
  return url && TARGET_HOSTS.some((h) => url.includes(h))
}

function sanitize(headers) {
  const s = { ...headers }
  for (const k of Object.keys(s)) {
    if (k.toLowerCase() === "authorization" && typeof s[k] === "string" && s[k].startsWith("Bearer "))
      s[k] = "Bearer [REDACTED]"
    if (k.toLowerCase() === "cookie") s[k] = "[REDACTED]"
  }
  return s
}

const captured = []
const pendingMap = new Map()
let totalEvents = 0

async function monitorTarget(wsUrl, label) {
  try {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve)
      ws.addEventListener("error", reject)
      setTimeout(() => reject(new Error("ws timeout")), 10000)
    })

    await cdpSend(ws, "Network.enable", { maxTotalBufferSize: 50000000, maxResourceBufferSize: 10000000 })
    console.log("[" + label + "] Network.enable OK")

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (!msg.method) return
        totalEvents++

        if (msg.method === "Network.requestWillBeSent") {
          const { requestId, request, type } = msg.params
          if (isTarget(request.url)) {
            const entry = {
              source: label,
              capturedAt: new Date().toISOString(),
              type,
              method: request.method,
              url: request.url,
              headers: sanitize(request.headers),
              headerOrder: Object.keys(request.headers),
              postData: request.postData ? request.postData.slice(0, 8000) : null,
            }
            pendingMap.set(label + ":" + requestId, entry)
            console.log("")
            console.log(">>> [" + label + "] " + request.method + " " + request.url)
            for (const [k, v] of Object.entries(sanitize(request.headers))) {
              const dv = typeof v === "string" && v.length > 150 ? v.slice(0, 150) + "..." : v
              console.log("  " + k + ": " + dv)
            }
            if (request.postData) {
              try {
                const body = JSON.parse(request.postData)
                console.log("  Body keys: [" + Object.keys(body).join(", ") + "]")
                if (body.model) console.log("  model: " + body.model)
                if (body.project) console.log("  project: " + body.project)
                if (body.userAgent) console.log("  userAgent: " + body.userAgent)
                if (body.requestId) console.log("  requestId: " + body.requestId)
                if (body.metadata) console.log("  metadata: " + JSON.stringify(body.metadata))
                if (body.request) {
                  console.log("  request keys: [" + Object.keys(body.request).join(", ") + "]")
                  if (body.request.model) console.log("  request.model: " + body.request.model)
                  if (body.request.metadata) console.log("  request.metadata: " + JSON.stringify(body.request.metadata))
                }
              } catch {
                console.log("  Body (raw): " + request.postData.slice(0, 300))
              }
            }
          }
        }

        if (msg.method === "Network.requestWillBeSentExtraInfo") {
          const { requestId, headers } = msg.params
          const entry = pendingMap.get(label + ":" + requestId)
          if (entry) {
            entry.extraHeaders = sanitize(headers)
            const extras = Object.entries(sanitize(headers)).filter(([k]) => !entry.headers[k])
            if (extras.length > 0) {
              console.log("  Extra wire headers:")
              for (const [k, v] of extras) {
                const dv = typeof v === "string" && v.length > 150 ? v.slice(0, 150) + "..." : v
                console.log("    + " + k + ": " + dv)
              }
            }
          }
        }

        if (msg.method === "Network.responseReceived") {
          const { requestId, response } = msg.params
          const entry = pendingMap.get(label + ":" + requestId)
          if (entry) {
            entry.response = {
              status: response.status,
              statusText: response.statusText,
              protocol: response.protocol,
              remoteIP: response.remoteIPAddress,
              headers: response.headers,
            }
            console.log("<<< " + response.status + " " + response.statusText + " [" + response.protocol + "]")
            captured.push(entry)
            pendingMap.delete(label + ":" + requestId)
          }
        }
      } catch {}
    })

    return ws
  } catch (e) {
    console.log("[" + label + "] Failed: " + e.message)
    return null
  }
}

async function main() {
  console.log("Starting multi-target CDP capture...")

  const info = await httpGet("http://127.0.0.1:9222/json/version")
  const targets = await httpGet("http://127.0.0.1:9222/json/list")

  console.log("Browser: " + info.Browser)
  console.log("UA: " + info["User-Agent"])
  console.log("Targets: " + targets.length)

  const wsList = []

  // Monitor browser target
  const bws = await monitorTarget(info.webSocketDebuggerUrl, "browser")
  if (bws) wsList.push(bws)

  // Monitor all page targets
  for (const t of targets) {
    if (t.webSocketDebuggerUrl) {
      const ws = await monitorTarget(t.webSocketDebuggerUrl, (t.title || "page").slice(0, 25))
      if (ws) wsList.push(ws)
    }
  }

  console.log("")
  console.log("Monitoring " + wsList.length + " targets for 90s...")
  console.log(">>> USE ANTIGRAVITY IDE NOW - ask a question in chat to trigger API calls <<<")
  console.log("")

  const interval = setInterval(() => {
    console.log("  [tick] " + captured.length + " API reqs, " + totalEvents + " total events")
  }, 10000)

  await new Promise((r) => setTimeout(r, 90000))
  clearInterval(interval)

  console.log("")
  console.log("========================================")
  console.log("Capture complete: " + captured.length + " API requests")

  if (captured.length > 0) {
    fs.writeFileSync(
      "D:/opencode/opencode-antigravity-auth/tools/captured-traffic.json",
      JSON.stringify({ captureDate: new Date().toISOString(), browserUA: info["User-Agent"], totalRequests: captured.length, requests: captured }, null, 2),
    )
    console.log("Saved to tools/captured-traffic.json")

    for (const r of captured) {
      console.log("")
      console.log(r.method + " " + r.url)
      console.log("  Source: " + r.source)
      console.log("  Headers:")
      for (const [k, v] of Object.entries(r.headers)) {
        if (k.toLowerCase() !== "authorization")
          console.log("    " + k + ": " + (typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "..." : v))
      }
      if (r.extraHeaders) {
        console.log("  Extra headers (Chromium-injected):")
        for (const [k, v] of Object.entries(r.extraHeaders)) {
          if (!r.headers[k] && k.toLowerCase() !== "authorization")
            console.log("    + " + k + ": " + (typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "..." : v))
        }
      }
      if (r.postData) {
        console.log("  Body (first 2000): " + r.postData.slice(0, 2000))
      }
    }
  } else {
    console.log("No API requests captured via CDP.")
    console.log("Extension host HTTP likely bypasses Chromium network layer.")
    console.log("Check chromium-net-log.json for captured traffic.")
  }

  for (const ws of wsList) try { ws.close() } catch {}
  process.exit(0)
}

main().catch((e) => {
  console.error("Fatal:", e.message)
  process.exit(1)
})
