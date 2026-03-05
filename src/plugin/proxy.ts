/**
 * Proxy support for Antigravity API requests.
 *
 * Provides a fetch wrapper that routes googleapis.com requests through
 * HTTP/HTTPS/SOCKS5 proxies without affecting the host process globally.
 */

import { ProxyAgent, type Dispatcher } from "undici";
import { createLogger } from "./logger";

declare global {
  interface RequestInit {
    dispatcher?: Dispatcher;
  }
}

const log = createLogger("proxy");

interface AccountProxyAgentEntry {
  url: string;
  agent: ProxyAgent;
}

let globalProxyAgent: ProxyAgent | null = null;
const accountProxyAgents = new Map<string, AccountProxyAgentEntry>();

/**
 * Initialize the global proxy dispatcher.
 * Called once at plugin startup if proxy is configured.
 */
export function initGlobalProxy(proxyUrl: string): void {
  try {
    const nextAgent = new ProxyAgent(proxyUrl);
    if (globalProxyAgent) {
      globalProxyAgent.close();
    }
    globalProxyAgent = nextAgent;
    log.info("Global proxy initialized", { proxy: redactProxyUrl(proxyUrl) });
  } catch (error) {
    log.error("Failed to initialize global proxy", {
      proxy: redactProxyUrl(proxyUrl),
      error: String(error),
    });
  }
}

/**
 * Get or create a proxy agent for a specific account.
 */
function getAccountProxy(accountId: string, proxyUrl: string): ProxyAgent {
  const existing = accountProxyAgents.get(accountId);
  if (existing && existing.url === proxyUrl) {
    return existing.agent;
  }

  const nextAgent = new ProxyAgent(proxyUrl);
  if (existing) {
    existing.agent.close();
  }

  accountProxyAgents.set(accountId, {
    url: proxyUrl,
    agent: nextAgent,
  });

  log.info("Account proxy initialized", {
    account: redactAccountId(accountId),
    proxy: redactProxyUrl(proxyUrl),
  });

  return nextAgent;
}

/**
 * Get the proxy dispatcher to use for a request.
 * Priority: account proxy > global proxy > undefined (direct)
 */
export function getProxyDispatcher(accountProxy?: string, accountId?: string): Dispatcher | undefined {
  if (accountProxy && accountId) {
    try {
      return getAccountProxy(accountId, accountProxy);
    } catch (error) {
      log.error("Failed to initialize account proxy", {
        account: redactAccountId(accountId),
        proxy: redactProxyUrl(accountProxy),
        error: String(error),
      });
    }
  }

  return globalProxyAgent ?? undefined;
}

/**
 * Fetch wrapper that injects proxy dispatcher.
 * Drop-in replacement for global fetch() with proxy support.
 */
export async function proxyFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const dispatcher = init?.dispatcher ?? (isGoogleApisRequest(input) ? globalProxyAgent ?? undefined : undefined);
  if (!dispatcher) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    dispatcher,
  });
}

/**
 * Cleanup proxy agents on shutdown.
 */
export function destroyProxies(): void {
  if (globalProxyAgent) {
    globalProxyAgent.close();
    globalProxyAgent = null;
  }

  for (const entry of accountProxyAgents.values()) {
    entry.agent.close();
  }

  accountProxyAgents.clear();
}

function isGoogleApisRequest(input: string | URL | Request): boolean {
  const url = toUrl(input);
  if (!url) {
    return false;
  }

  return isGoogleApisHostname(url.hostname);
}

function isGoogleApisHostname(hostname: string): boolean {
  return hostname === "googleapis.com" || hostname.endsWith(".googleapis.com");
}

function toUrl(input: string | URL | Request): URL | null {
  try {
    if (typeof input === "string") {
      return new URL(input);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(input.url);
  } catch {
    return null;
  }
}

/**
 * Redact credentials from proxy URL for logging.
 */
function redactProxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

function redactAccountId(accountId: string): string {
  if (!accountId) {
    return "[unknown]";
  }
  if (accountId.length <= 8) {
    return accountId;
  }
  return `${accountId.slice(0, 8)}...`;
}
