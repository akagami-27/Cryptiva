#!/bin/sh
set -eu

# Fail closed if the malware definitions cannot be initialized.
freshclam --stdout
exec gosu node node /app/server.js
