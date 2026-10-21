@echo off
title Build Jarvis AI APK
set "JAVA_HOME=C:\Users\huank\.bubblewrap\jdk\jdk-17.0.11+9"
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0android"
echo ========================================================
echo   DANG BIEN DICH JARVIS AI ANDROID APK (RELEASE)
echo ========================================================
echo.
call gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI.apk"
    echo.
    echo ========================================================
    echo   BUILD THANH CONG!
    echo   File APK da san sang tai thu muc goc:
    echo   %~dp0JarvisAI.apk
    echo ========================================================
) else (
    echo.
    echo [LOI] Bien dich that bai. Vui long kiem tra lai thong bao loi o tren.
)
pause
