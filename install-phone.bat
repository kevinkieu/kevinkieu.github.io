@echo off
title Cai dat Jarvis AI truc tiep len dien thoai qua USB
echo ========================================================
echo   DANG CAI DAT TRUC TIEP FILE APK LEN DIEN THOAI VIA ADB
echo ========================================================
echo.

set "ADB_BIN=adb"
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

"%ADB_BIN%" devices
echo.
echo Dang cai dat JarvisAI.apk...
"%ADB_BIN%" install -r -d "%~dp0JarvisAI.apk"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Cai dat thanh cong! Dang khoi dong ung dung...
    "%ADB_BIN%" shell am force-stop com.kevinkieu.jarvisai
    "%ADB_BIN%" shell am start -n com.kevinkieu.jarvisai/.MainActivity
    echo.
    echo ========================================================
    echo   HOAN TAT! App da san sang tren dien thoai cua ban.
    echo ========================================================
) else (
    echo.
    echo [LOI] Khong the cai dat. Vui long kiem tra ket noi USB va cap quyen USB Debugging.
)
pause
