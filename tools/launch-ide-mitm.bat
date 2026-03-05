@echo off
REM ============================================================
REM Launch Antigravity IDE with MITM proxy for traffic capture
REM 
REM This sets environment variables so the Go language server
REM binary routes HTTPS through our mitmproxy and trusts its CA.
REM ============================================================

REM Combined CA bundle: system CAs + mitmproxy CA (Go's crypto/x509 uses this)
set SSL_CERT_FILE=%USERPROFILE%\.mitmproxy\combined-ca-bundle.pem

REM Route all HTTPS through our local mitmproxy
set HTTPS_PROXY=http://127.0.0.1:8080
set HTTP_PROXY=http://127.0.0.1:8080

REM Also set for Node.js (Electron main process)
set NODE_EXTRA_CA_CERTS=%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.pem
set NODE_TLS_REJECT_UNAUTHORIZED=0

echo ============================================================
echo  Antigravity IDE MITM Launcher
echo ============================================================
echo  Proxy:     http://127.0.0.1:8080
echo  CA Cert:   %SSL_CERT_FILE%
echo  Node CA:   %NODE_EXTRA_CA_CERTS%
echo ============================================================
echo.
echo  IMPORTANT: Start mitmdump FIRST in another terminal:
echo    mitmdump -s tools\mitm-capture.py -p 8080 --ssl-insecure
echo.
echo  Then press any key to launch the IDE...
echo ============================================================
pause

REM Launch Antigravity IDE
start "" "E:\Antigravity\Antigravity.exe"

echo.
echo IDE launched. Use it normally to generate API traffic.
echo Check the mitmdump terminal for captured requests.
echo.
pause
