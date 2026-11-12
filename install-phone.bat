@echo off
title Cai dat Jarvis AI truc tiep len dien thoai qua USB
echo ========================================================
echo   DANG CAI DAT TRUC TIEP FILE APK LEN DIEN THOAI VIA ADB
echo ========================================================
echo.

adb devices
echo.
echo Dang cai dat JarvisAI.apk...
adb install -r -d "%~dp0JarvisAI.apk"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Cai dat thanh cong! Dang khoi dong ung dung...
    adb shell am force-stop com.kevinkieu.jarvisai
    adb shell am start -n com.kevinkieu.jarvisai/.MainActivity
    echo.
    echo ========================================================
    echo   HOAN TAT! App da san sang tren dien thoai cua ban.
    echo ========================================================
) else (
    echo.
    echo [LOI] Khong the cai dat. Vui long kiem tra ket noi USB va cap quyen USB Debugging.
)
pause
