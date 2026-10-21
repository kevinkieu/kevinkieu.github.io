@echo off
title Build Jarvis AI APK
set "JAVA_HOME=C:\Users\huank\.bubblewrap\jdk\jdk-17.0.11+9"
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0android"

echo ========================================================
echo   DANG CAP NHAT VERSION CODE VA BIEN DICH APK RELEASE
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='app/build.gradle'; $c=[IO.File]::ReadAllText($f); if($c -match 'versionCode\s+(\d+)'){ $old=[int]$matches[1]; $new=$old+1; $c=$c -replace 'versionCode\s+\d+', \"versionCode $new\"; $c=$c -replace 'versionName\s+\"[^\"]+\"', \"versionName `\"1.1.$new`\"\"; [IO.File]::WriteAllText($f,$c); Write-Host \"[TANG PHIEN BAN] versionCode: $old -^> $new (versionName: 1.1.$new)\" -ForegroundColor Cyan }"

echo.
call gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI.apk"
    echo.
    echo ========================================================
    echo   BUILD THANH CONG!
    echo   File APK da duoc tu dong tang version va san sang cai de:
    echo   %~dp0JarvisAI.apk
    echo ========================================================
) else (
    echo.
    echo [LOI] Bien dich that bai. Vui long kiem tra lai thong bao loi o tren.
)
pause
