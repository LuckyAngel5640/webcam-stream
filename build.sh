#!/bin/bash
# Build script for WebCamApp - builds Android APK, signaling server, and website

set -e

echo "=========================================="
echo "WebCamApp Build Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/WebCamApp"
SIGNALING_DIR="$PROJECT_ROOT/WebCamApp/signaling-server"
WEBSITE_DIR="$PROJECT_ROOT/WebCamApp/website"

echo -e "${YELLOW}Project root: $PROJECT_ROOT${NC}"

# Function to check command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 not found. Please install it.${NC}"
        exit 1
    fi
}

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"
check_command java
check_command node
check_command npm

# Check Android SDK
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo -e "${YELLOW}Warning: ANDROID_HOME not set. Using local SDK if available.${NC}"
fi

# Build Android App
echo -e "\n${GREEN}=========================================="
echo "Building Android App"
echo "==========================================${NC}"

cd "$ANDROID_DIR"

# Download Gradle wrapper if needed
if [ ! -f "gradle/wrapper/gradle-wrapper.jar" ]; then
    echo "Downloading Gradle wrapper..."
    mkdir -p gradle/wrapper
    curl -L -o gradle/wrapper/gradle-wrapper.jar "https://repo.gradle.org/gradle/wrapper/gradle-wrapper-8.5.jar"
    curl -L -o gradlew "https://github.com/gradle/gradle/raw/v8.5.0/gradlew"
    curl -L -o gradlew.bat "https://github.com/gradle/gradle/raw/v8.5.0/gradlew.bat"
    chmod +x gradlew
fi

# Make gradlew executable
chmod +x gradlew

# Clean and build debug APK
echo "Running Gradle build..."
./gradlew clean assembleDebug --no-daemon

# Find the generated APK
APK_PATH=$(find . -name "*.apk" -path "*/outputs/apk/debug/*" | head -1)
if [ -n "$APK_PATH" ]; then
    echo -e "${GREEN}Android APK built successfully!${NC}"
    echo "APK location: $ANDROID_DIR/$APK_PATH"
    
    # Copy to project root for easy access
    cp "$APK_PATH" "$PROJECT_ROOT/WebCamApp-debug.apk"
    echo "APK copied to: $PROJECT_ROOT/WebCamApp-debug.apk"
else
    echo -e "${RED}Error: APK not found after build${NC}"
    exit 1
fi

# Build Signaling Server
echo -e "\n${GREEN}=========================================="
echo "Building Signaling Server"
echo "==========================================${NC}"

cd "$SIGNALING_DIR"

if [ -f "package.json" ]; then
    echo "Installing signaling server dependencies..."
    npm install --production
    
    echo -e "${GREEN}Signaling server ready!${NC}"
    echo "To start: cd $SIGNALING_DIR && npm start"
else
    echo -e "${YELLOW}No package.json found in signaling-server${NC}"
fi

# Build Website
echo -e "\n${GREEN}=========================================="
echo "Building Website (React)"
echo "==========================================${NC}"

cd "$WEBSITE_DIR"

if [ -f "package.json" ]; then
    echo "Installing website dependencies..."
    npm install
    
    echo "Building production bundle..."
    npm run build
    
    echo -e "${GREEN}Website built successfully!${NC}"
    echo "Build output: $WEBSITE_DIR/build"
else
    echo -e "${YELLOW}No package.json found in website${NC}"
fi

echo -e "\n${GREEN}=========================================="
echo "Build Complete!"
echo "==========================================${NC}"
echo ""
echo "Summary:"
echo "  - Android APK: $PROJECT_ROOT/WebCamApp-debug.apk"
echo "  - Signaling Server: $SIGNALING_DIR (run: npm start)"
echo "  - Website: $WEBSITE_DIR/build (serve with any static server)"
echo ""
echo "Next steps:"
echo "  1. Install APK on Android device: adb install $PROJECT_ROOT/WebCamApp-debug.apk"
echo "  2. Start signaling server: cd $SIGNALING_DIR && npm start"
echo "  3. Deploy website to dreamcast.cam/admin"
echo "  4. Configure DNS/SSL for wss://dreamcast.cam/signaling"
echo ""

# Show APK info
if command -v aapt &> /dev/null; then
    echo "APK Info:"
    aapt dump badging "$PROJECT_ROOT/WebCamApp-debug.apk" | grep -E "package|application-label|versionCode|versionName|sdkVersion|uses-permission"
fi