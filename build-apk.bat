@echo off
setlocal enabledelayedexpansion
title Build Jarvis AI Offline APK (Cross-Platform / Node-based)
echo ========================================================
echo   JARVIS AI - CROSS-PLATFORM BUILD SCRIPT (NODE + GRADLE)
echo ========================================================
echo.

:: 1. Chay script tang version va dong bo assets tu dong
echo [1/3] Dang chay node bump-version.js va dong bo assets...
node bump-version.js

:: Copy assets sang Android bang script dung chung (scripts/sync-web-assets.js)
:: => chi mot danh sach file duy nhat, khong lech giua web root va assets
node scripts\sync-web-assets.js
if !ERRORLEVEL! NEQ 0 (
    echo [LOI] Dong bo assets that bai.
    pause
    exit /b 1
)

echo [2/3] Cau hinh moi truong Java / Android SDK...
if exist "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
) else if exist "C:\Program Files\Eclipse Adoptium\jdk-17" (
    set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17"
) else if exist "C:\Program Files\Android\Android Studio\jbr" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)

if exist "%LOCALAPPDATA%\Android\Sdk" (
    set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
) else if exist "C:\Users\Admin\AppData\Local\Android\Sdk" (
    set "ANDROID_HOME=C:\Users\Admin\AppData\Local\Android\Sdk"
) else if exist "C:\Users\huank\AppData\Local\Android\Sdk" (
    set "ANDROID_HOME=C:\Users\huank\AppData\Local\Android\Sdk"
)

set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0android"

echo [3/3] Dang bien dich APK Release qua Gradle...
call gradlew.bat assembleRelease
if !ERRORLEVEL! EQU 0 (
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI.apk" >nul
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI_Offline.apk" >nul
    echo.
    echo ========================================================
    echo   BUILD THANH CONG!
    echo   File APK da san sang tai goc du an:
    echo   %~dp0JarvisAI.apk
    echo   %~dp0JarvisAI_Offline.apk
    echo ========================================================
) else (
    echo.
    echo [LOI] Bien dich that bai. Vui long kiem tra lai thong bao tren.
)
cd /d "%~dp0"
pause
