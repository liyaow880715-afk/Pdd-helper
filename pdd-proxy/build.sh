#!/bin/bash
CP="../pop-sdk/jar/pop-sdk-1.24.60-all.jar:../pdd-proxy/lib/gson-2.10.1.jar"
SRC="src/PddProxyServer.java"
OUT="bin"

echo "[PDD-Proxy] Compiling..."
mkdir -p "$OUT"
javac -encoding UTF-8 -cp "$CP" -d "$OUT" "$SRC"

if [ $? -eq 0 ]; then
    echo "[PDD-Proxy] Build success."
else
    echo "[PDD-Proxy] Build failed."
    exit 1
fi
