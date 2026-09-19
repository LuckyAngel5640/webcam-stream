# WebCam Stream - Android App + WebRTC Streaming Platform

A complete solution for streaming camera and audio from Android devices to a custom domain with motion detection and real-time alerts.

## Features

- **Android App**: Camera2 API + WebRTC for low-latency streaming
- **Real-time Streaming**: WebRTC peer-to-peer with STUN/TURN support
- **Motion Detection**: On-device ML Kit object detection
- **Motion Alerts**: Captures and sends motion images to web dashboard
- **Multi-camera Support**: View and manage multiple active cameras
- **Web Dashboard**: React-based viewer with camera grid, live viewer, alerts
- **Signaling Server**: Node.js + Socket.IO for WebRTC negotiation
- **Custom Domain**: Configured for `dreamcast.cam/admin`

## Architecture

```
┌─────────────────┐     WebRTC      ┌──────────────────┐
│  Android App    │◄───────────────►│  Web Browser     │
│  (Camera + Mic) │   (Media Flow)  │  (Viewer)        │
└────────┬────────┘                 └────────┬─────────┘
         │                                   │
         │ Signaling (WebSocket)             │
         ▼                                   ▼
┌─────────────────────────────────────────────────────┐
│           Signaling Server (Node.js)                │
│  - Camera registration & discovery                  │
│  - WebRTC offer/answer/ICE exchange                 │
│  - Motion alert broadcasting                        │
│  - REST API for camera list & alerts                │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
WebCamApp/
├── app/                    # Android app (Kotlin)
│   ├── src/main/
│   │   ├── java/com/example/webcamapp/
│   │   │   ├── camera/     # Camera2 + CameraX management
│   │   │   ├── webrtc/     # WebRTC peer connection
│   │   │   ├── motion/     # ML Kit motion detection
│   │   │   ├── network/    # Signaling client
│   │   │   ├── service/    # Foreground streaming service
│   │   │   └── ui/         # MainActivity + views
│   │   └── res/            # Layouts, drawables, values
│   └── build.gradle.kts
├── signaling-server/       # Node.js WebSocket server
│   ├── server.js
│   └── package.json
├── website/                # React dashboard
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   └── App.js
│   └── package.json
├── build.sh               # Linux/macOS build script
├── build.bat              # Windows build script
└── settings.gradle.kts
```

## Prerequisites

- **Android**: JDK 17+, Android SDK 34, Gradle 8.5+
- **Signaling Server**: Node.js 18+, npm
- **Website**: Node.js 18+, npm
- **Domain**: `dreamcast.cam` with SSL certificate

## Quick Start

### 1. Build Everything

**Windows:**
```cmd
cd WebCamApp
build.bat
```

**Linux/macOS:**
```bash
cd WebCamApp
chmod +x build.sh
./build.sh
```

### 2. Install Android APK

```bash
adb install WebCamApp-debug.apk
```

### 3. Start Signaling Server

```bash
cd WebCamApp/signaling-server
npm start
```
Server runs on port 3000 (WebSocket: `ws://localhost:3000/signaling`)

### 4. Deploy Website

```bash
cd WebCamApp/website
npm run build
# Deploy ./build folder to dreamcast.cam/admin
```

## Configuration

### Android App Configuration

The app connects to `wss://dreamcast.cam/signaling` by default. To change:

1. Modify `StreamConfig` in `MainActivity.kt`
2. Or use Settings dialog in the app

Required permissions (auto-requested):
- CAMERA
- RECORD_AUDIO
- INTERNET
- FOREGROUND_SERVICE (camera/microphone)
- WAKE_LOCK

### Signaling Server Configuration

Edit `signaling-server/server.js`:

```javascript
const PORT = process.env.PORT || 3000;

// For production, add TURN servers:
const turnServers = [
  {
    urls: ['turn:your-turn-server.com:3478'],
    username: 'user',
    credential: 'pass'
  }
];
```

### Website Configuration

Set environment variable for signaling URL:

```bash
# .env.production
REACT_APP_SIGNALING_URL=wss://dreamcast.cam/signaling
```

## Domain Setup (dreamcast.cam)

### 1. DNS Records
```
A     @           YOUR_SERVER_IP
A     admin       YOUR_SERVER_IP
CNAME www         @
```

### 2. SSL Certificate (Let's Encrypt)
```bash
sudo certbot --nginx -d dreamcast.cam -d admin.dreamcast.cam
```

### 3. Nginx Configuration
```nginx
# Signaling WebSocket
location /signaling {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}

# Website
location /admin {
    root /var/www/webcam-website/build;
    try_files $uri $uri/ /index.html;
}

# REST API
location /api {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
}
```

### 4. Run as Service (systemd)
```ini
# /etc/systemd/system/webcam-signaling.service
[Unit]
Description=WebCam Signaling Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/webcam/signaling-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable webcam-signaling
sudo systemctl start webcam-signaling
```

## Usage

### Android App
1. Open app → grants camera/microphone permissions
2. Tap "Start Streaming" → connects to signaling server
3. App shows "Connected" status
4. Use "Switch Camera" to toggle front/back
5. Tap "Active Cameras" to see all online cameras
6. Motion detection runs automatically → alerts sent to dashboard

### Web Dashboard
1. Open `https://dreamcast.cam/admin`
2. Sidebar shows:
   - **Cameras tab**: All registered cameras with status
   - **Alerts tab**: Motion detection alerts with images
3. Click any camera → opens live WebRTC viewer
4. Viewer shows: live video, connection stats, snapshot/fullscreen controls

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cameras` | List all cameras |
| GET | `/api/cameras/:id` | Get camera details |
| GET | `/api/motion-alerts` | List recent alerts (limit=50) |
| GET | `/api/motion-alerts/:cameraId` | Alerts for specific camera |
| POST | `/api/motion-alerts` | Create alert (from app) |

## Motion Detection

- Uses **ML Kit Object Detection** (on-device)
- Runs on every 500ms (configurable)
- Detects: people, vehicles, animals, objects
- On detection: captures JPEG frame → base64 → sends via signaling
- Alerts appear in web dashboard with thumbnail

## Troubleshooting

### Camera not starting
- Check permissions in Android Settings
- Ensure no other app uses camera
- Check logcat: `adb logcat | grep WebCamApp`

### WebRTC connection fails
- Verify STUN/TURN servers accessible
- Check firewall allows UDP 10000-20000
- Try different network (WiFi vs mobile)

### Motion alerts not appearing
- Check ML Kit model downloaded (first run needs internet)
- Verify signaling server receives `motion_alert` events
- Check browser console for WebSocket errors

### Website not loading streams
- Ensure HTTPS for WebRTC (required)
- Check signaling URL matches server
- Verify CORS headers on signaling server

## Building Release APK

```bash
cd WebCamApp
./gradlew assembleRelease
# APK at: app/build/outputs/apk/release/app-release.apk
```

Sign with your keystore:
```bash
./gradlew assembleRelease -Pandroid.injected.signing.store.file=keystore.jks \
  -Pandroid.injected.signing.store.password=STORE_PASS \
  -Pandroid.injected.signing.key.alias=KEY_ALIAS \
  -Pandroid.injected.signing.key.password=KEY_PASS
```

## License

MIT License - Feel free to use and modify.

## Support

For issues, check:
1. Android logcat: `adb logcat -s WebCamApp:V WebRTC:V`
2. Signaling server logs: `journalctl -u webcam-signaling -f`
3. Browser DevTools: Console + Network (WebSocket tab)