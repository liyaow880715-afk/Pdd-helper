#!/bin/bash
CP="bin:../pop-sdk/jar/pop-sdk-1.24.60-all.jar:../pdd-proxy/lib/gson-2.10.1.jar"
java -cp "$CP" PddProxyServer
