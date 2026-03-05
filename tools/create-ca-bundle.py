"""
Create a combined CA bundle: Windows system CAs + mitmproxy CA.
This allows Go binaries to trust mitmproxy via SSL_CERT_FILE.
"""

import ssl
import os
import sys

MITMPROXY_CA = os.path.join(
    os.environ["USERPROFILE"], ".mitmproxy", "mitmproxy-ca-cert.pem"
)
OUTPUT = os.path.join(os.environ["USERPROFILE"], ".mitmproxy", "combined-ca-bundle.pem")

# Get Windows system CA certificates
ctx = ssl.create_default_context()
certs = ctx.get_ca_certs(binary_form=True)

print(f"Found {len(certs)} system CA certificates")

import base64

with open(OUTPUT, "w", encoding="ascii") as f:
    # Write system CAs
    for cert_der in certs:
        b64 = base64.encodebytes(cert_der).decode("ascii").strip()
        f.write("-----BEGIN CERTIFICATE-----\n")
        f.write(b64 + "\n")
        f.write("-----END CERTIFICATE-----\n\n")

    # Append mitmproxy CA
    with open(MITMPROXY_CA, "r") as mitm:
        f.write("# mitmproxy CA\n")
        f.write(mitm.read())

print(f"Combined CA bundle written to: {OUTPUT}")
print(f"System CAs: {len(certs)}, mitmproxy CA: 1")
