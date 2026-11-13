@echo off
chcp 65001 >nul
title Cai dat Jarvis AI qua Wifi Debugging (Khong can cap)
echo ===================================================================
echo     CÀI ĐẶT JARVIS AI TRỰC TIẾP LÊN ĐIỆN THOẠI QUA WI-FI DEBUGGING
echo ===================================================================
echo.

:: 1. Tự động tìm đường dẫn adb
set "ADB_BIN=adb"
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\Admin\AppData\Local\Android\Sdk\platform-tools\adb.exe"
) else if exist "C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_BIN=C:\Users\huank\AppData\Local\Android\Sdk\platform-tools\adb.exe"
)

echo [HƯỚNG DẪN TRÊN ĐIỆN THOẠI]:
echo 1. Kết nối điện thoại và máy tính vào CÙNG MẠNG WI-FI.
echo 2. Vào Cài đặt (Settings) -> Tuỳ chọn nhà phát triển (Developer Options).
echo 3. Bật "Gỡ lỗi qua Wi-Fi" (Wireless debugging).
echo.
echo -------------------------------------------------------------------
echo Chọn thao tác:
echo [1] Đã từng ghép nối với máy tính này -> Chỉ cần Kết nối (Connect)
echo [2] Ghép nối lần đầu tiên -> Cần Mã ghép nối 6 số (Pairing Code)
echo -------------------------------------------------------------------
set /p choice="Nhập lựa chọn của bạn (1 hoặc 2): "

if "%choice%"=="2" (
    echo.
    echo --- BƯỚC GHÉP NỐI (PAIRING) ---
    echo Bấm vào dòng "Ghép nối thiết bị bằng mã ghép nối" trên điện thoại.
    echo Màn hình sẽ hiện: Địa chỉ IP, Cổng (Port) và Mã ghép nối (6 số).
    echo.
    set /p pair_ip="Nhập Địa chỉ IP & Cổng ghép nối (Ví dụ 192.168.1.15:37123): "
    set /p pair_code="Nhập Mã ghép nối Wi-Fi 6 số (Ví dụ 123456): "
    echo.
    echo Đang thực hiện ghép nối...
    "%ADB_BIN%" pair %pair_ip% %pair_code%
    echo.
    echo Ghép nối hoàn tất! Bây giờ quay lại màn hình chính của "Gỡ lỗi qua Wi-Fi".
)

echo.
echo --- BƯỚC KẾT NỐI (CONNECT) ---
echo Xem dòng "Địa chỉ IP và cổng" tại màn hình chính Gỡ lỗi qua Wi-Fi.
echo (Lưu ý: Cổng Port này thường khác với cổng lúc ghép nối).
echo.
set /p connect_target="Nhập IP và Cổng kết nối (Ví dụ 192.168.1.15:42145): "

echo.
echo Đang kết nối tới %connect_target%...
"%ADB_BIN%" connect %connect_target%

echo.
echo Kiểm tra danh sách thiết bị:
"%ADB_BIN%" devices

echo.
echo Đang cài đặt đè JarvisAI.apk lên điện thoại...
"%ADB_BIN%" install -r -d "%~dp0JarvisAI.apk"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================================
    echo   CÀI ĐẶT THÀNH CÔNG 100%!
    echo   Đang tự động khởi động Jarvis AI trên điện thoại...
    echo ===================================================================
    "%ADB_BIN%" shell am force-stop com.kevinkieu.jarvisai
    "%ADB_BIN%" shell am start -n com.kevinkieu.jarvisai/.MainActivity
) else (
    echo.
    echo [LỖI] Không thể cài đặt. Vui lòng kiểm tra lại địa chỉ IP/Cổng và xác nhận Cho phép gỡ lỗi trên màn hình điện thoại.
)

echo.
pause
