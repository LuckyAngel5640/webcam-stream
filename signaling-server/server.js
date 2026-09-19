const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../website/build')));

// In-memory storage (replace with Redis/database for production)
const cameras = new Map(); // cameraId -> { socketId, info, viewers }
const viewers = new Map(); // viewerId -> { socketId, cameraId }
const motionAlerts = []; // Recent motion alerts

// Signaling namespace
const signalingNamespace = io.of('/signaling');

signalingNamespace.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Camera registration
    socket.on('register', (data) => {
        const { cameraId, name, facing, resolution } = data;
        console.log(`Camera registered: ${cameraId}`);

        cameras.set(cameraId, {
            socketId: socket.id,
            info: {
                id: cameraId,
                name: name || `Camera ${cameraId.slice(-6)}`,
                status: 'online',
                lastSeen: Date.now(),
                facing: facing || 0,
                resolution: resolution || '1280x720'
            },
            viewers: new Set()
        });

        socket.join(`camera:${cameraId}`);
        socket.cameraId = cameraId;

        // Notify all viewers of camera status
        signalingNamespace.emit('camera_list', getCameraList());
    });

    // WebRTC Offer from camera
    socket.on('offer', (data) => {
        const { cameraId, sdp, targetViewerId } = data;
        const camera = cameras.get(cameraId);

        if (camera) {
            if (targetViewerId) {
                // Send to specific viewer
                signalingNamespace.to(targetViewerId).emit('offer', { cameraId, sdp });
            } else {
                // Broadcast to all viewers of this camera
                camera.viewers.forEach(viewerId => {
                    signalingNamespace.to(viewerId).emit('offer', { cameraId, sdp });
                });
            }
        }
    });

    // WebRTC Answer from viewer
    socket.on('answer', (data) => {
        const { cameraId, sdp } = data;
        const camera = cameras.get(cameraId);

        if (camera) {
            signalingNamespace.to(camera.socketId).emit('answer', { cameraId, sdp });
        }
    });

    // ICE Candidate from camera
    socket.on('candidate', (data) => {
        const { cameraId, candidate, targetViewerId } = data;
        const camera = cameras.get(cameraId);

        if (camera) {
            if (targetViewerId) {
                signalingNamespace.to(targetViewerId).emit('candidate', { cameraId, candidate });
            } else {
                camera.viewers.forEach(viewerId => {
                    signalingNamespace.to(viewerId).emit('candidate', { cameraId, candidate });
                });
            }
        }
    });

    // ICE Candidate from viewer
    socket.on('viewer_candidate', (data) => {
        const { cameraId, candidate } = data;
        const camera = cameras.get(cameraId);

        if (camera) {
            signalingNamespace.to(camera.socketId).emit('viewer_candidate', { cameraId, candidate });
        }
    });

    // Viewer wants to watch a camera
    socket.on('watch', (data) => {
        const { cameraId } = data;
        const camera = cameras.get(cameraId);

        if (camera) {
            const viewerId = socket.id;
            camera.viewers.add(viewerId);
            viewers.set(viewerId, { socketId: socket.id, cameraId });

            socket.join(`camera:${cameraId}`);
            socket.viewerId = viewerId;
            socket.cameraId = cameraId;

            // Request offer from camera
            signalingNamespace.to(camera.socketId).emit('viewer_joined', { cameraId, viewerId });

            console.log(`Viewer ${viewerId} watching camera ${cameraId}`);
        } else {
            socket.emit('error', { message: 'Camera not found' });
        }
    });

    // Motion alert from camera
    socket.on('motion_alert', (data) => {
        const { cameraId, motionAlert } = data;
        console.log(`Motion detected on camera ${cameraId}`);

        // Store alert
        motionAlerts.unshift({
            ...motionAlert,
            cameraId,
            receivedAt: Date.now()
        });

        // Keep only last 100 alerts
        if (motionAlerts.length > 100) {
            motionAlerts.pop();
        }

        // Broadcast to all connected clients (website viewers)
        signalingNamespace.emit('motion_alert', motionAlerts[0]);
    });

    // Heartbeat
    socket.on('heartbeat', (data) => {
        const { cameraId } = data;
        const camera = cameras.get(cameraId);
        if (camera) {
            camera.info.lastSeen = Date.now();
            camera.info.status = 'online';
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        // Handle camera disconnect
        if (socket.cameraId && !socket.viewerId) {
            const camera = cameras.get(socket.cameraId);
            if (camera && camera.socketId === socket.id) {
                camera.info.status = 'offline';
                camera.info.lastSeen = Date.now();

                // Notify viewers
                camera.viewers.forEach(viewerId => {
                    signalingNamespace.to(viewerId).emit('camera_disconnected', { cameraId: socket.cameraId });
                });

                cameras.delete(socket.cameraId);
                signalingNamespace.emit('camera_list', getCameraList());
            }
        }

        // Handle viewer disconnect
        if (socket.viewerId) {
            const viewer = viewers.get(socket.viewerId);
            if (viewer) {
                const camera = cameras.get(viewer.cameraId);
                if (camera) {
                    camera.viewers.delete(socket.viewerId);
                    signalingNamespace.to(camera.socketId).emit('viewer_left', { cameraId: viewer.cameraId, viewerId: socket.viewerId });
                }
                viewers.delete(socket.viewerId);
            }
        }
    });
});

// REST API endpoints
app.get('/api/cameras', (req, res) => {
    res.json(getCameraList());
});

app.get('/api/cameras/:cameraId', (req, res) => {
    const camera = cameras.get(req.params.cameraId);
    if (camera) {
        res.json(camera.info);
    } else {
        res.status(404).json({ error: 'Camera not found' });
    }
});

app.get('/api/motion-alerts', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(motionAlerts.slice(0, limit));
});

app.get('/api/motion-alerts/:cameraId', (req, res) => {
    const alerts = motionAlerts.filter(a => a.cameraId === req.params.cameraId);
    res.json(alerts.slice(0, 50));
});

app.post('/api/motion-alerts', (req, res) => {
    const alert = {
        ...req.body,
        id: uuidv4(),
        receivedAt: Date.now()
    };
    motionAlerts.unshift(alert);
    if (motionAlerts.length > 100) motionAlerts.pop();

    signalingNamespace.emit('motion_alert', alert);
    res.json({ success: true, alert });
});

function getCameraList() {
    const list = [];
    cameras.forEach((camera, id) => {
        list.push({
            ...camera.info,
            viewerCount: camera.viewers.size
        });
    });
    return list;
}

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/build/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}/signaling`);
    console.log(`REST API: http://localhost:${PORT}/api`);
});