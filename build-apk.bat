@echo off
title Build Jarvis AI Offline APK
echo ========================================================
echo   DANG DONG GOI TAI NGUYEN VA BUILD JARVIS AI OFFLINE APK
echo ========================================================
echo.

:: 1. Thiet lap moi truong Java tu dong (Uu tien JDK 17 tuong thich Gradle 8.2)
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

cd /d "%~dp0"

:: 2. Tu dong dong bo code Web moi nhat (HTML/JS/CSS/Icons) vao thu muc Android Assets
echo [1/3] Dang dong bo code moi nhat vao Android Assets...
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"
copy /y "index.html" "android\app\src\main\assets\" >nul
copy /y "manifest.json" "android\app\src\main\assets\" >nul
copy /y "sw.js" "android\app\src\main\assets\" >nul
copy /y "icon*.png" "android\app\src\main\assets\" >nul
xcopy /s /e /y "js" "android\app\src\main\assets\js\" >nul
xcopy /s /e /y "css" "android\app\src\main\assets\css\" >nul

cd "android"

:: 3. Tu dong tang Version Code de cai de len ban cu khong can go app
echo [2/3] Dang cap nhat so phien ban Version Code...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='app/build.gradle'; $c=[IO.File]::ReadAllText($f); if($c -match 'versionCode\s+(\d+)'){ $old=[int]$matches[1]; $new=$old+1; $c=$c -replace 'versionCode\s+\d+', \"versionCode $new\"; $c=$c -replace 'versionName\s+\"[^\"]+\"', \"versionName `\"1.1.$new`\"\"; [IO.File]::WriteAllText($f,$c); Write-Host \"[TANG PHIEN BAN] versionCode: $old -^> $new (versionName: 1.1.$new)\" -ForegroundColor Cyan }"

:: 4. Bien dich file APK Release
echo [3/3] Dang bien dich APK Release...
call gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI_Offline.apk" >nul
    copy /y "app\build\outputs\apk\release\app-release.apk" "%~dp0JarvisAI.apk" >nul
    echo.
    echo ========================================================
    echo   BUILD THANH CONG!
    echo   File APK da san sang cai de len dien thoai:
    echo   %~dp0JarvisAI_Offline.apk va JarvisAI.apk
    echo ========================================================
) else (
    echo.
    echo [LOI] Bien dich that bai. Vui long kiem tra lai thong bao tren.
)
