import { beforeEach, describe, expect, it, vi } from "vitest"

const mockState = vi.hoisted(() => {
  const proxyAgents: Array<{ url: string; close: ReturnType<typeof vi.fn> }> = []
  const failingProxyUrls = new Set<string>()
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const createLogger = vi.fn(() => logger)

  return {
    proxyAgents,
    failingProxyUrls,
    logger,
    createLogger,
  }
})

vi.mock("undici", () => {
  class ProxyAgent {
    readonly url: string
    readonly close: ReturnType<typeof vi.fn>

    constructor(url: string) {
      if (mockState.failingProxyUrls.has(url)) {
        throw new Error(`proxy-constructor-failed:${url}`)
      }
      this.url = url
      this.close = vi.fn()
      mockState.proxyAgents.push(this)
    }
  }

  return {
    ProxyAgent,
  }
})

vi.mock("./logger", () => ({
  createLogger: mockState.createLogger,
}))

import { destroyProxies, getProxyDispatcher, initGlobalProxy, proxyFetch } from "./proxy"

function installFetchMock() {
  const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function lastFetchInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit | undefined {
  const lastCall = fetchMock.mock.calls.at(-1)
  if (!lastCall) {
    throw new Error("Expected fetch to be called")
  }
  return lastCall[1] as RequestInit | undefined
}

beforeEach(() => {
  destroyProxies()
  mockState.proxyAgents.length = 0
  mockState.failingProxyUrls.clear()
  mockState.createLogger.mockClear()
  mockState.logger.debug.mockClear()
  mockState.logger.info.mockClear()
  mockState.logger.warn.mockClear()
  mockState.logger.error.mockClear()
})

describe("initGlobalProxy", () => {
  it("initializes a global dispatcher and redacts credentials in logs", () => {
    initGlobalProxy("http://user:secret@proxy.local:8080")

    expect(mockState.proxyAgents).toHaveLength(1)
    expect(getProxyDispatcher()).toBe(mockState.proxyAgents[0])
    expect(mockState.logger.info).toHaveBeenCalledWith("Global proxy initialized", {
      proxy: "http://user:***@proxy.local:8080/",
    })
  })

  it("replaces an existing global dispatcher and closes the previous one", () => {
    initGlobalProxy("http://proxy-one:9001")
    const firstAgent = mockState.proxyAgents[0]

    initGlobalProxy("http://proxy-two:9002")

    expect(mockState.proxyAgents).toHaveLength(2)
    expect(firstAgent?.close).toHaveBeenCalledTimes(1)
    expect(getProxyDispatcher()).toBe(mockState.proxyAgents[1])
  })

  it("logs an error and keeps state unchanged when initialization fails", () => {
    initGlobalProxy("http://proxy-ok:9001")
    const currentDispatcher = getProxyDispatcher()
    mockState.failingProxyUrls.add("http://proxy-fail:9002")

    initGlobalProxy("http://proxy-fail:9002")

    expect(getProxyDispatcher()).toBe(currentDispatcher)
    expect(mockState.logger.error).toHaveBeenCalledWith("Failed to initialize global proxy", {
      proxy: "http://proxy-fail:9002/",
      error: "Error: proxy-constructor-failed:http://proxy-fail:9002",
    })
  })

  it("logs invalid proxy URLs with fallback redaction token", () => {
    mockState.failingProxyUrls.add("not-a-url")

    initGlobalProxy("not-a-url")

    expect(getProxyDispatcher()).toBeUndefined()
    expect(mockState.logger.error).toHaveBeenCalledWith("Failed to initialize global proxy", {
      proxy: "[invalid-url]",
      error: "Error: proxy-constructor-failed:not-a-url",
    })
  })
})

describe("getProxyDispatcher", () => {
  it("returns undefined when no global or account proxy is configured", () => {
    expect(getProxyDispatcher()).toBeUndefined()
  })

  it("returns the global dispatcher when account proxy is absent", () => {
    initGlobalProxy("http://global-proxy:8080")

    expect(getProxyDispatcher()).toBe(mockState.proxyAgents[0])
  })

  it("prefers account proxy over global proxy", () => {
    initGlobalProxy("http://global-proxy:8080")
    const globalDispatcher = getProxyDispatcher()

    const accountDispatcher = getProxyDispatcher("http://account-proxy:8080", "acc-1")

    expect(accountDispatcher).toBe(mockState.proxyAgents[1])
    expect(accountDispatcher).not.toBe(globalDispatcher)
  })

  it("reuses the same account dispatcher when URL is unchanged", () => {
    const first = getProxyDispatcher("http://account-proxy:8080", "acc-1")
    const second = getProxyDispatcher("http://account-proxy:8080", "acc-1")

    expect(first).toBe(second)
    expect(mockState.proxyAgents).toHaveLength(1)
    expect(mockState.proxyAgents[0]?.close).not.toHaveBeenCalled()
  })

  it("recreates account dispatcher when URL changes and closes previous agent", () => {
    const first = getProxyDispatcher("http://account-proxy-a:8080", "acc-1")
    const firstAgent = mockState.proxyAgents[0]

    const second = getProxyDispatcher("http://account-proxy-b:8080", "acc-1")

    expect(first).not.toBe(second)
    expect(firstAgent?.close).toHaveBeenCalledTimes(1)
    expect(mockState.proxyAgents).toHaveLength(2)
  })

  it("creates independent account dispatchers for different accounts", () => {
    const first = getProxyDispatcher("http://shared-proxy:8080", "acc-1")
    const second = getProxyDispatcher("http://shared-proxy:8080", "acc-2")

    expect(first).not.toBe(second)
    expect(mockState.proxyAgents).toHaveLength(2)
  })

  it("falls back to global dispatcher when account proxy creation fails", () => {
    initGlobalProxy("http://global-proxy:8080")
    const globalDispatcher = getProxyDispatcher()
    const failingProxy = "http://user:secret@broken-proxy:8080"
    mockState.failingProxyUrls.add(failingProxy)

    const dispatcher = getProxyDispatcher(failingProxy, "1234567890abcdef")

    expect(dispatcher).toBe(globalDispatcher)
    expect(mockState.logger.error).toHaveBeenCalledWith("Failed to initialize account proxy", {
      account: "12345678...",
      proxy: "http://user:***@broken-proxy:8080/",
      error: `Error: proxy-constructor-failed:${failingProxy}`,
    })
  })

  it("returns undefined when account proxy creation fails and no global exists", () => {
    mockState.failingProxyUrls.add("http://broken-proxy:8080")

    const dispatcher = getProxyDispatcher("http://broken-proxy:8080", "acc-1")

    expect(dispatcher).toBeUndefined()
    expect(mockState.logger.error).toHaveBeenCalledTimes(1)
  })

  it("ignores account proxy when account ID is missing", () => {
    initGlobalProxy("http://global-proxy:8080")

    const dispatcher = getProxyDispatcher("http://account-proxy:8080")

    expect(dispatcher).toBe(mockState.proxyAgents[0])
    expect(mockState.proxyAgents).toHaveLength(1)
  })

  it("ignores account ID when account proxy URL is missing", () => {
    initGlobalProxy("http://global-proxy:8080")

    const dispatcher = getProxyDispatcher(undefined, "acc-1")

    expect(dispatcher).toBe(mockState.proxyAgents[0])
    expect(mockState.proxyAgents).toHaveLength(1)
  })
})

describe("proxyFetch", () => {
  it("bypasses proxy for non-google URLs", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()
    const init: RequestInit = { method: "POST" }

    await proxyFetch("https://example.com/api", init)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastFetchInit(fetchMock)).toBe(init)
  })

  it("routes googleapis.com hostnames through the global dispatcher", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()

    await proxyFetch("https://googleapis.com/v1/models")

    expect(lastFetchInit(fetchMock)?.dispatcher).toBe(getProxyDispatcher())
  })

  it("routes subdomain.googleapis.com URL objects through the global dispatcher", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()

    await proxyFetch(new URL("https://generativelanguage.googleapis.com/v1beta/models"))

    expect(lastFetchInit(fetchMock)?.dispatcher).toBe(getProxyDispatcher())
  })

  it("routes Request inputs for googleapis subdomains through the global dispatcher", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()
    const request = new Request("https://foo.googleapis.com/v1")

    await proxyFetch(request)

    expect(lastFetchInit(fetchMock)?.dispatcher).toBe(getProxyDispatcher())
  })

  it("bypasses proxy for invalid URL strings", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()

    await proxyFetch("not-a-url")

    expect(lastFetchInit(fetchMock)).toBeUndefined()
  })

  it("respects init.dispatcher over global dispatcher", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const accountDispatcher = getProxyDispatcher("http://account-proxy:8080", "acc-1")
    const fetchMock = installFetchMock()

    expect(accountDispatcher).toBeDefined()

    await proxyFetch("https://foo.googleapis.com/v1", {
      dispatcher: accountDispatcher,
      method: "GET",
    })

    expect(lastFetchInit(fetchMock)?.dispatcher).toBe(accountDispatcher)
  })

  it("preserves init fields when injecting dispatcher", async () => {
    initGlobalProxy("http://global-proxy:8080")
    const fetchMock = installFetchMock()
    const init: RequestInit = {
      method: "POST",
      headers: {
        "x-test": "1",
      },
      body: "payload",
    }

    await proxyFetch("https://bar.googleapis.com/v1", init)

    const calledInit = lastFetchInit(fetchMock)
    expect(calledInit?.method).toBe("POST")
    expect(calledInit?.headers).toEqual({ "x-test": "1" })
    expect(calledInit?.body).toBe("payload")
    expect(calledInit?.dispatcher).toBe(getProxyDispatcher())
    expect(init.dispatcher).toBeUndefined()
  })

  it("does not inject dispatcher for googleapis URLs when global proxy is absent", async () => {
    const fetchMock = installFetchMock()

    await proxyFetch("https://baz.googleapis.com/v1")

    expect(lastFetchInit(fetchMock)).toBeUndefined()
  })
})

describe("destroyProxies", () => {
  it("closes global and account dispatchers and clears state", () => {
    initGlobalProxy("http://global-proxy:8080")
    getProxyDispatcher("http://account-a:8080", "acc-1")
    getProxyDispatcher("http://account-b:8080", "acc-2")

    const [globalAgent, accountA, accountB] = mockState.proxyAgents

    destroyProxies()

    expect(globalAgent?.close).toHaveBeenCalledTimes(1)
    expect(accountA?.close).toHaveBeenCalledTimes(1)
    expect(accountB?.close).toHaveBeenCalledTimes(1)
    expect(getProxyDispatcher()).toBeUndefined()
  })

  it("is safe to call destroyProxies repeatedly", () => {
    initGlobalProxy("http://global-proxy:8080")
    getProxyDispatcher("http://account-a:8080", "acc-1")

    const [globalAgent, accountAgent] = mockState.proxyAgents

    destroyProxies()
    destroyProxies()

    expect(globalAgent?.close).toHaveBeenCalledTimes(1)
    expect(accountAgent?.close).toHaveBeenCalledTimes(1)
  })
})
