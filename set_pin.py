#!/usr/bin/env python3
"""Set the edit-mode PIN. Asks privately and writes only a salted hash into config.js."""
import getpass, hashlib, re, secrets
from pathlib import Path

f = Path(__file__).with_name("config.js")
pin = getpass.getpass("New edit PIN: ")
if pin != getpass.getpass("Repeat PIN: ") or not pin:
    raise SystemExit("PINs do not match")
salt = secrets.token_hex(8)
h = hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()
s = f.read_text()
s = re.sub(r'pinSalt: "[^"]*"', f'pinSalt: "{salt}"', s)
s = re.sub(r'pinHash: "[^"]*"', f'pinHash: "{h}"', s)
f.write_text(s)
print("PIN hash saved to config.js")
