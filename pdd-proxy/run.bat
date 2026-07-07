@echo off
setlocal

set JAVA_HOME=C:\Users\ausde\project\jdk\jdk-17.0.9+9
set PATH=%JAVA_HOME%\bin;%PATH%

set CP=bin;..\pop-sdk\jar\pop-sdk-1.24.60-all.jar;..\pdd-proxy\lib\gson-2.10.1.jar

java -cp "%CP%" PddProxyServer
endlocal
