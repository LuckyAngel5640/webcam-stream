@echo off
REM Build script for WebCamApp - builds Android APK, signaling server, and website

echo ==========================================
echo WebCamApp Build Script (Windows)
echo ==========================================

set PROJECT_ROOT=%CD%
set ANDROID_DIR=%PROJECT_ROOT%
set SIGNALING_DIR=%PROJECT_ROOT%\signaling-server
set WEBSITE_DIR=%PROJECT_ROOT%\website

echo Project root: %PROJECT_ROOT%

REM Check prerequisites
echo.
echo Checking prerequisites...
where java >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Java not found. Please install JDK 17+.
    goto :error
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js not found. Please install Node.js 18+.
    goto :error
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm not found.
    goto :error
)

echo Prerequisites OK.

REM Build Android App
echo.
echo ==========================================
echo Building Android App
echo ==========================================

cd /d "%ANDROID_DIR%"

REM Download Gradle wrapper if needed
if not exist "gradle\wrapper\gradle-wrapper.jar" (
    echo Downloading Gradle wrapper...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/gradle/gradle/raw/v8.7.0/gradlew' -OutFile 'gradlew'"
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/gradle/gradle/raw/v8.7.0/gradlew.bat' -OutFile 'gradlew.bat'"
    if not exist "gradle\wrapper" mkdir gradle\wrapper
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/gradle/gradle/raw/v8.7.0/gradle/wrapper/gradle-wrapper.jar' -OutFile 'gradle\wrapper\gradle-wrapper.jar'"
)

echo Running Gradle build...
gradlew.bat clean assembleDebug --no-daemon
if %errorlevel% neq 0 (
    echo Gradle build failed!
    goto :error
)

REM Find the generated APK
set APK_PATH=
for /r "app\build\outputs\apk\debug" %%f in (*.apk) do (
    if not defined APK_PATH set APK_PATH=%%f
)

if defined APK_PATH (
    echo Android APK built successfully!
    echo APK location: %APK_PATH%
    
    REM Copy to project root for easy access
    copy "%APK_PATH%" "%PROJECT_ROOT%\WebCamApp-debug.apk" >nul
    echo APK copied to: %PROJECT_ROOT%\WebCamApp-debug.apk
) else (
    echo Error: APK not found after build
    goto :error
)

REM Build Signaling Server
echo.
echo ==========================================
echo Building Signaling Server
echo ==========================================

cd /d "%SIGNALING_DIR%"

if exist package.json (
    echo Installing signaling server dependencies...
    npm install --production
    if %errorlevel% neq 0 (
        echo npm install failed for signaling server
        goto :error
    )
    
    echo Signaling server ready!
    echo To start: cd %SIGNALING_DIR% && npm start
) else (
    echo No package.json found in signaling-server
)

REM Build Website
echo.
echo ==========================================
echo Building Website (React)
echo ==========================================

cd /d "%WEBSITE_DIR%"

if exist package.json (
    echo Installing website dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo npm install failed for website
        goto :error
    )
    
    echo Building production bundle...
    npm run build
    if %errorlevel% neq 0 (
        echo npm run build failed for website
        goto :error
    )
    
    echo Website built successfully!
    echo Build output: %WEBSITE_DIR%\build
) else (
    echo No package.json found in website
)

echo.
echo ==========================================
echo Build Complete!
echo ==========================================
echo.
echo Summary:
echo   - Android APK: %PROJECT_ROOT%\WebCamApp-debug.apk
echo   - Signaling Server: %SIGNALING_DIR% (run: npm start)
echo   - Website: %WEBSITE_DIR%\build (serve with any static server)
echo.
echo Next steps:
echo   1. Install APK on Android device: adb install %PROJECT_ROOT%\WebCamApp-debug.apk
echo   2. Start signaling server: cd %SIGNALING_DIR% && npm start
echo   3. Deploy website to dreamcast.cam/admin
echo   4. Configure DNS/SSL for wss://dreamcast.cam/signaling
echo.

REM Show APK info if aapt is available
where aapt >nul 2>nul
if %errorlevel% equ 0 (
    echo APK Info:
    aapt dump badging "%PROJECT_ROOT%\WebCamApp-debug.apk" | findstr /R "package application-label versionCode versionName sdkVersion uses-permission"
)

echo.
echo Press any key to exit...
pause
goto :eof

:error
echo.
echo BUILD FAILED - Press any key to exit...
pause
exit /b 1