import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || 'wss://ubuntu-production-8e92.up.railway.app/signaling';

function App() {
  const [cameras, setCameras] = useState([]);
  const [motionAlerts, setMotionAlerts] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [isSharing, setIsSharing] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [error, setError] = useState(null);
  
  const localVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize signaling connection
  useEffect(() => {
    const socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      setConnectionStatus('connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError('Server connection failed');
    });

    socket.on('camera_list', (list) => {
      setCameras(list);
    });

    socket.on('motion_alert', (alert) => {
      setMotionAlerts(prev => [alert, ...prev].slice(0, 100));
    });

    socket.on('camera_disconnected', (data) => {
      setCameras(prev => prev.filter(c => c.id !== data.cameraId));
    });

    // Handle WebRTC signaling
    socket.on('offer', async ({ sdp, cameraId }) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('answer', { cameraId, sdp: peerConnectionRef.current.localDescription });
      } catch (e) {
        console.error('Error handling offer:', e);
      }
    });

    socket.on('candidate', async ({ candidate, cameraId }) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetch('/api/cameras')
      .then(res => res.json())
      .then(data => setCameras(data))
      .catch(err => console.error('Failed to fetch cameras:', err));

    fetch('/api/motion-alerts')
      .then(res => res.json())
      .then(data => setMotionAlerts(data))
      .catch(err => console.error('Failed to fetch alerts:', err));
  }, []);

  // Start sharing camera
  const startSharing = async () => {
    try {
      setError(null);
      
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Add tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('candidate', { 
            cameraId: stream.id, 
            candidate: event.candidate 
          });
        }
      };

      // Register as camera
      const cameraId = `mobile_${Date.now()}`;
      socketRef.current?.emit('register', { 
        cameraId, 
        name: 'Mobile Camera', 
        facing: 0, 
        resolution: '1280x720' 
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { cameraId, sdp: offer });

      setIsSharing(true);
    } catch (err) {
      console.error('Error starting share:', err);
      setError('Camera access denied or not available');
    }
  };

  // Stop sharing
  const stopSharing = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    socketRef.current?.emit('register', { cameraId: '', name: '' }); // Unregister
    setIsSharing(false);
  };

  const handleWatchCamera = useCallback((camera) => {
    setSelectedCamera(camera);
    setSidebarOpen(false);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setSelectedCamera(null);
    setSidebarOpen(true);
  }, []);

  const handleRefreshCameras = useCallback(() => {
    fetch('/api/cameras')
      .then(res => res.json())
      .then(data => setCameras(data))
      .catch(err => console.error('Failed to fetch cameras:', err));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>📷 WebCam CCTV</h1>
        <div className="header-right">
          <span className={`status ${connectionStatus}`}>
            {connectionStatus === 'connected' ? '🟢 Live' : '🔴 Offline'}
          </span>
          <button 
            className={`btn ${isSharing ? 'btn-stop' : 'btn-start'}`}
            onClick={isSharing ? stopSharing : startSharing}
            disabled={connectionStatus !== 'connected'}
          >
            {isSharing ? '🛑 Stop Sharing' : '📹 Share Camera'}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {/* Local preview when sharing */}
      {isSharing && localStream && (
        <div className="local-preview">
          <h3>Your Camera (Live)</h3>
          <video ref={localVideoRef} autoPlay playsInline muted />
        </div>
      )}

      <div className="main-container">
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'} Cameras
          </button>
          
          <div className="sidebar-content">
            <div className="section">
              <h4>📷 Active Cameras ({cameras.length})</h4>
              {cameras.length === 0 ? (
                <p className="empty">No cameras online</p>
              ) : (
                <ul className="camera-list">
                  {cameras.map(cam => (
                    <li key={cam.id} className="camera-item" onClick={() => handleWatchCamera(cam)}>
                      <span className="camera-name">{cam.name}</span>
                      <span className={`camera-status ${cam.status.toLowerCase()}`}>
                        {cam.status}
                      </span>
                      <span className="viewers">👁 {cam.viewerCount || 0}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn-refresh" onClick={handleRefreshCameras}>
                🔄 Refresh
              </button>
            </div>

            <div className="section">
              <h4>⚠️ Motion Alerts ({motionAlerts.length})</h4>
              {motionAlerts.length === 0 ? (
                <p className="empty">No alerts</p>
              ) : (
                <ul className="alert-list">
                  {motionAlerts.slice(0, 10).map(alert => (
                    <li key={alert.id} className="alert-item">
                      <span>{alert.cameraId}</span>
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <main className="main-content">
          {selectedCamera ? (
            <div className="viewer">
              <div className="viewer-header">
                <h3>{selectedCamera.name}</h3>
                <button className="btn-close" onClick={handleCloseViewer}>✕ Close</button>
              </div>
              <div className="video-container">
                <CameraViewer 
                  camera={selectedCamera}
                  signalingUrl={SIGNALING_URL}
                  onClose={handleCloseViewer}
                />
              </div>
            </div>
          ) : (
            <div className="grid">
              {cameras.map(cam => (
                <div key={cam.id} className="camera-card" onClick={() => handleWatchCamera(cam)}>
                  <div className="card-thumb">
                    <span className="status-dot {cam.status.toLowerCase()}"></span>
                    {cam.status === 'ONLINE' ? '🔴 LIVE' : '⚫ OFFLINE'}
                  </div>
                  <div className="card-info">
                    <h4>{cam.name}</h4>
                    <small>{cam.viewerCount || 0} viewers</small>
                  </div>
                </div>
              ))}
              {cameras.length === 0 && (
                <div className="empty-state">
                  <h3>📭 No cameras online</h3>
                  <p>Tap "Share Camera" above to start broadcasting</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// CameraViewer component for watching streams
function CameraViewer({ camera, signalingUrl, onClose }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('candidate', { cameraId: camera.id, candidate: event.candidate });
      }
    };

    const socket = io(signalingUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.emit('watch', { cameraId: camera.id });

    socket.on('offer', async ({ sdp }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { cameraId: camera.id, sdp: pc.localDescription });
      } catch (e) {
        console.error('Viewer offer error:', e);
      }
    });

    socket.on('candidate', async ({ candidate }) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Viewer ICE error:', e);
      }
    });

    return () => {
      pc.close();
      socket.disconnect();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [camera, signalingUrl]);

  return (
    <video ref={videoRef} autoPlay playsInline className="viewer-video" />
  );
}

export default App;