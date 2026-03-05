import {
  ANTIGRAVITY_API_CLIENT,
  ANTIGRAVITY_ENDPOINT_DAILY,
  getAntigravityHeaders,
} from "../constants.ts"
import { createLogger } from "./logger.ts"
import { proxyFetch } from "./proxy.ts"

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10 * 1000
const STARTUP_JITTER_MIN_MS = 2000
const STARTUP_JITTER_MAX_MS = 5000
const CALL_JITTER_MIN_MS = 100
const CALL_JITTER_MAX_MS = 500

const log = createLogger("heartbeat")

export interface HeartbeatOptions {
  getAccessToken: () => Promise<string | undefined>
  getProjectId: () => string | undefined
  getDispatcher: () => RequestInit["dispatcher"]
  intervalMs?: number
}

interface HeartbeatRequest {
  url: string
  method: "GET" | "POST"
  headers: Record<string, string>
  body?: string
}

let intervalId: ReturnType<typeof setInterval> | null = null
let startupTimeoutId: ReturnType<typeof setTimeout> | null = null
let cycleInProgress = false

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function buildBaseHeaders(accessToken: string): Record<string, string> {
  const antigravityHeaders = getAntigravityHeaders()
  return {
    ...antigravityHeaders,
    authorization: `Bearer ${accessToken}`,
  }
}

function buildPostHeaders(baseHeaders: Record<string, string>, body: string): Record<string, string> {
  return {
    ...baseHeaders,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body).toString(),
  }
}

function buildHeartbeatRequests(accessToken: string, projectId: string): HeartbeatRequest[] {
  const baseHeaders = buildBaseHeaders(accessToken)
  const fetchUserInfoBody = JSON.stringify({ project: projectId })
  const fetchAvailableModelsBody = JSON.stringify({ project: projectId })

  return [
    {
      method: "GET",
      url: `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal/cascadeNuxes`,
      headers: {
        ...baseHeaders,
        "content-type": "application/json",
      },
    },
    {
      method: "POST",
      url: `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:fetchUserInfo`,
      headers: buildPostHeaders(baseHeaders, fetchUserInfoBody),
      body: fetchUserInfoBody,
    },
    {
      method: "POST",
      url: `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:fetchAvailableModels`,
      headers: buildPostHeaders(baseHeaders, fetchAvailableModelsBody),
      body: fetchAvailableModelsBody,
    },
    {
      method: "GET",
      url: "https://www.googleapis.com/oauth2/v2/userinfo",
      headers: {
        ...baseHeaders,
      },
    },
  ]
}

async function sendHeartbeatRequest(
  request: HeartbeatRequest,
  dispatcher?: RequestInit["dispatcher"],
): Promise<void> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await proxyFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      dispatcher,
    })

    if (!response.ok) {
      log.debug("Heartbeat request returned non-OK status", {
        method: request.method,
        url: request.url,
        status: response.status,
      })
    }

    if (response.body) {
      try {
        await response.body.cancel()
      } catch {
        // Ignore body cancellation issues
      }
    }
  } catch (error) {
    log.warn("Heartbeat request failed", {
      method: request.method,
      url: request.url,
      error: String(error),
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runHeartbeatCycle(options: HeartbeatOptions): Promise<void> {
  if (cycleInProgress) {
    log.debug("Skipping heartbeat cycle because previous cycle is still running")
    return
  }

  cycleInProgress = true

  try {
    const accessToken = await options.getAccessToken()
    if (!accessToken) {
      log.debug("Skipping heartbeat cycle: access token unavailable")
      return
    }

    const projectId = options.getProjectId()
    if (!projectId) {
      log.debug("Skipping heartbeat cycle: project id unavailable")
      return
    }

    const dispatcher = options.getDispatcher()
    const requests = buildHeartbeatRequests(accessToken, projectId)

    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index]
      if (!request) {
        continue
      }

      await sendHeartbeatRequest(request, dispatcher)

      if (index < requests.length - 1) {
        const jitterMs = getRandomInt(CALL_JITTER_MIN_MS, CALL_JITTER_MAX_MS)
        await sleep(jitterMs)
      }
    }
  } catch (error) {
    log.error("Heartbeat cycle failed", { error: String(error) })
  } finally {
    cycleInProgress = false
  }
}

export function startHeartbeat(options: HeartbeatOptions): void {
  if (isHeartbeatRunning()) {
    stopHeartbeat()
  }

  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    log.warn("Heartbeat not started due to invalid interval", { intervalMs })
    return
  }

  intervalId = setInterval(() => {
    void runHeartbeatCycle(options)
  }, intervalMs)

  const startupJitterMs = getRandomInt(STARTUP_JITTER_MIN_MS, STARTUP_JITTER_MAX_MS)
  startupTimeoutId = setTimeout(() => {
    startupTimeoutId = null
    void runHeartbeatCycle(options)
  }, startupJitterMs)

  log.info("Heartbeat started", {
    intervalMs,
    startupJitterMs,
  })
}

export function stopHeartbeat(): void {
  if (startupTimeoutId) {
    clearTimeout(startupTimeoutId)
    startupTimeoutId = null
  }

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    log.info("Heartbeat stopped")
  }
}

export function isHeartbeatRunning(): boolean {
  return intervalId !== null
}
