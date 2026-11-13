@echo off
title Cai dat Jarvis AI qua Wifi Debugging (Khong can cap)
echo ===================================================================
echo     CAI DAT JARVIS AI TRUC TIEP LEN DIEN THOAI QUA WI-FI DEBUGGING
echo ===================================================================
echo.

set "ADB_BIN=adb"
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

echo [HUONG DAN TREN DIEN THOAI]:
echo 1. Ket noi dien thoai va may tinh vao CUNG MANG WI-FI.
echo 2. Vao Cai dat (Settings) -^> Tuy chon nha phat trien (Developer Options).
echo 3. Bat "Go loi qua Wi-Fi" (Wireless debugging).
echo.
echo -------------------------------------------------------------------
echo Chon thao tac:
echo [1] Da tung ghep noi voi may tinh nay -^> Chi can Ket noi (Connect)
echo [2] Ghep noi lan dau tien -^> Can Ma ghep noi 6 so (Pairing Code)
echo -------------------------------------------------------------------
set /p choice="Nhap lua chon cua ban (1 hoac 2): "

if "%choice%"=="2" goto DO_PAIR
goto DO_CONNECT

:DO_PAIR
echo.
echo ===================================================================
echo BUOC 1: GHEP NOI (PAIRING)
echo ===================================================================
echo Bam vao dong "Ghep noi thiet bi bang ma ghep noi" tren dien thoai.
echo Man hinh se hien: Dia chi IP, Cong (Port) va Ma 6 so.
echo.
set /p pair_ip="Nhap IP va Cong ghep noi (Vi du 192.168.1.15:37123): "
set /p pair_code="Nhap Ma ghep noi 6 so (Vi du 123456): "
echo.
echo Dang thuc hien ghep noi...
"%ADB_BIN%" pair %pair_ip% %pair_code%
echo.
echo Ghep noi hoan tat! Bay gio quay lai man hinh chinh cua Go loi qua Wi-Fi.
echo.

:DO_CONNECT
echo ===================================================================
echo BUOC 2: KET NOI VA CAI DAT (CONNECT ^& INSTALL)
echo ===================================================================
echo Xem dong "Dia chi IP va cong" tai man hinh chinh Go loi qua Wi-Fi.
echo (Luu y: Cong Port nay thuong KHAC voi cong luc ghep noi).
echo.
set /p connect_target="Nhap IP va Cong ket noi (Vi du 192.168.1.15:42145): "

echo.
echo Dang ket noi toi %connect_target%...
"%ADB_BIN%" connect %connect_target%

echo.
echo Kiem tra danh sach thiet bi ket noi:
"%ADB_BIN%" devices

echo.
echo Dang cai dat de file JarvisAI.apk len dien thoai...
"%ADB_BIN%" install -r -d "%~dp0JarvisAI.apk"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================================
    echo   CAI DAT THANH CONG 100%!
    echo   Dang tu dong khoi dong Jarvis AI tren dien thoai...
    echo ===================================================================
    "%ADB_BIN%" shell am force-stop com.kevinkieu.jarvisai
    "%ADB_BIN%" shell am start -n com.kevinkieu.jarvisai/.MainActivity
) else (
    echo.
    echo [LOI] Khong the cai dat. Vui long kiem tra lai IP/Port va bam Cho phep tren dien thoai.
)

echo.
pause
