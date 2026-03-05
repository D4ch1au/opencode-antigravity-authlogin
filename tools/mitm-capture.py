"""
mitmproxy addon to capture Antigravity IDE's Go language server traffic.
Usage: mitmdump -s mitm-capture.py -p 8080 --set flow_detail=0

Captures all requests to googleapis.com endpoints and logs:
- Full request headers
- Request URL and method
- Request body (truncated)
- Response status and headers
"""

import json
import os
import time
from datetime import datetime
from mitmproxy import http, ctx

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mitm-captures")
os.makedirs(OUTPUT_DIR, exist_ok=True)

CAPTURE_DOMAINS = [
    "googleapis.com",
    "cloudcode-pa.googleapis.com",
    "daily-cloudcode-pa.googleapis.com",
    "autopush-cloudcode-pa.sandbox.googleapis.com",
    "generativelanguage.googleapis.com",
]

API_PATHS = [
    "generateContent",
    "streamGenerateContent",
    "countTokens",
    "loadCodeAssist",
    "onboardUser",
    "retrieveUserQuota",
    "recordCodeAssistMetrics",
    "fetchModels",
    "models",
]

capture_count = 0
session_file = os.path.join(
    OUTPUT_DIR, f"capture-{datetime.now().strftime('%Y%m%d-%H%M%S')}.jsonl"
)


def is_target_request(flow: http.HTTPFlow) -> bool:
    """Check if this request is to a googleapis.com endpoint we care about."""
    host = flow.request.pretty_host
    for domain in CAPTURE_DOMAINS:
        if host.endswith(domain):
            return True
    return False


def is_api_request(flow: http.HTTPFlow) -> bool:
    """Check if this is an actual API call (not just DNS/OCSP etc.)."""
    path = flow.request.path
    for api_path in API_PATHS:
        if api_path in path:
            return True
    # Also capture any POST to googleapis.com
    if flow.request.method == "POST":
        return True
    return False


class AntigravityCapture:
    def request(self, flow: http.HTTPFlow):
        if not is_target_request(flow):
            return

        global capture_count
        capture_count += 1

        # Log to console with highlighting
        ctx.log.info(f"\n{'=' * 80}")
        ctx.log.info(
            f"[#{capture_count}] {flow.request.method} {flow.request.pretty_url}"
        )
        ctx.log.info(f"{'=' * 80}")

        # Log all request headers
        ctx.log.info("REQUEST HEADERS:")
        for name, value in flow.request.headers.items():
            # Highlight key headers
            marker = ""
            if name.lower() in (
                "user-agent",
                "x-goog-api-client",
                "content-type",
                "client-metadata",
                "x-goog-api-key",
                "authorization",
            ):
                marker = " ★★★"
            # Redact auth tokens
            display_value = value
            if name.lower() == "authorization":
                display_value = (
                    value[:20] + "...[REDACTED]" if len(value) > 20 else value
                )
            if name.lower() == "x-goog-api-key":
                display_value = (
                    value[:10] + "...[REDACTED]" if len(value) > 10 else value
                )
            ctx.log.info(f"  {name}: {display_value}{marker}")

        # Log request body summary
        if flow.request.content:
            body_len = len(flow.request.content)
            ctx.log.info(f"\nREQUEST BODY ({body_len} bytes):")
            try:
                body_json = json.loads(flow.request.content)
                # Show structure without full content
                summary = summarize_json(body_json)
                ctx.log.info(f"  {summary}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                content_type = flow.request.headers.get("content-type", "")
                ctx.log.info(f"  [Binary/non-JSON data, content-type: {content_type}]")

    def response(self, flow: http.HTTPFlow):
        if not is_target_request(flow):
            return

        ctx.log.info(f"\nRESPONSE: {flow.response.status_code}")
        ctx.log.info("RESPONSE HEADERS:")
        for name, value in flow.response.headers.items():
            ctx.log.info(f"  {name}: {value}")

        # Save full capture to JSONL file
        record = {
            "timestamp": datetime.now().isoformat(),
            "request": {
                "method": flow.request.method,
                "url": flow.request.pretty_url,
                "headers": dict(flow.request.headers),
                "body_size": len(flow.request.content) if flow.request.content else 0,
            },
            "response": {
                "status_code": flow.response.status_code,
                "headers": dict(flow.response.headers),
            },
        }

        # Include request body for API calls (redact tokens)
        if flow.request.content and is_api_request(flow):
            try:
                body = json.loads(flow.request.content)
                record["request"]["body"] = body
            except (json.JSONDecodeError, UnicodeDecodeError):
                record["request"]["body_hex_preview"] = flow.request.content[:200].hex()

        # Include response body for non-streaming responses
        if flow.response.content and len(flow.response.content) < 50000:
            try:
                resp_body = json.loads(flow.response.content)
                record["response"]["body"] = resp_body
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        with open(session_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        ctx.log.info(f"\n[Saved to {session_file}]")
        ctx.log.info(f"{'─' * 80}\n")


def summarize_json(obj, depth=0, max_depth=3):
    """Create a structural summary of JSON without full content."""
    if depth >= max_depth:
        return "..."
    if isinstance(obj, dict):
        keys = list(obj.keys())
        parts = []
        for k in keys[:10]:
            v = obj[k]
            if isinstance(v, (dict, list)):
                parts.append(f"{k}: {summarize_json(v, depth + 1)}")
            elif isinstance(v, str) and len(v) > 100:
                parts.append(f'{k}: "{v[:50]}..." ({len(v)} chars)')
            else:
                parts.append(f"{k}: {json.dumps(v, ensure_ascii=False)[:80]}")
        if len(keys) > 10:
            parts.append(f"...+{len(keys) - 10} more keys")
        return "{" + ", ".join(parts) + "}"
    elif isinstance(obj, list):
        if len(obj) == 0:
            return "[]"
        first = summarize_json(obj[0], depth + 1)
        return f"[{first}, ...] ({len(obj)} items)"
    else:
        return json.dumps(obj, ensure_ascii=False)[:80]


addons = [AntigravityCapture()]
