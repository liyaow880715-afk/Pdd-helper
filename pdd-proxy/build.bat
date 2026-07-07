@echo off
setlocal

set JAVA_HOME=C:\Users\ausde\project\jdk\jdk-17.0.9+9
set PATH=%JAVA_HOME%\bin;%PATH%

set CP=..\pop-sdk\jar\pop-sdk-1.24.60-all.jar;..\pdd-proxy\lib\gson-2.10.1.jar
set SRC=src\PddProxyServer.java
set OUT=bin

echo [PDD-Proxy] Compiling...
if not exist %OUT% mkdir %OUT%
javac -encoding UTF-8 -cp "%CP%" -d %OUT% %SRC%

if %ERRORLEVEL% == 0 (
    echo [PDD-Proxy] Build success.
) else (
    echo [PDD-Proxy] Build failed.
    exit /b 1
)
endlocal
