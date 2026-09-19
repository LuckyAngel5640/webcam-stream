import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function CameraViewer({ camera, signalingUrl, onClose }) {
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    const socket = io(signalingUrl, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    // Create peer connection
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setConnectionState('connected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      setConnectionState(pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        setError('Connection failed. Retrying...');
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionState('connected');
        // Start stats collection
        statsInterval.current = setInterval(() => getStats(pc), 1000);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState(pc.connectionState);
      }
    };

    // Join as viewer
    socket.emit('watch', { cameraId: camera.id });

    socket.on('offer', async (data) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { cameraId: camera.id, sdp: pc.localDescription });
      } catch (err) {
        console.error('Offer handling error:', err);
        setError('Failed to handle offer');
      }
    });

    socket.on('candidate', async (data) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('ICE candidate error:', err);
      }
    });

    socket.on('camera_disconnected', () => {
      setError('Camera went offline');
      setConnectionState('disconnected');
    });

    return () => {
      if (statsInterval.current) clearInterval(statsInterval.current);
      pc.close();
      socket.disconnect();
    };
  }, [camera.id, signalingUrl]);

  const statsInterval = useRef(null);

  const getStats = async (pc) => {
    try {
      const stats = await pc.getStats();
      let videoBitrate = 0, audioBitrate = 0, framesDecoded = 0, framesDropped = 0;
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          videoBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
          framesDecoded = report.framesDecoded || 0;
          framesDropped = report.framesDropped || 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          audioBitrate = (report.bytesReceived || 0) * 8 / 1000;
        }
      });

      setStats({ videoBitrate: Math.round(videoBitrate), audioBitrate: Math.round(audioBitrate), framesDecoded, framesDropped });
    } catch (e) {
      // Ignore stats errors
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleSnapshot = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
      const link = document.createElement('a');
      link.download = `snapshot-${camera.id}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="camera-viewer">
      <div className="viewer-header">
        <button className="back-btn" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>{camera.name}</span>
        </button>
        <div className="viewer-status">
          <span className={`status-dot ${connectionState}`}></span>
          <span className="status-text">{connectionState.charAt(0).toUpperCase() + connectionState.slice(1)}</span>
        </div>
        <div className="viewer-actions">
          <button onClick={handleSnapshot} title="Snapshot" disabled={connectionState !== 'connected'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </button>
          <button onClick={handleFullscreen} title="Fullscreen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="video-container">
        <video 
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="video-element"
        />
        {connectionState !== 'connected' && (
          <div className="video-overlay">
            <div className="loading-spinner"></div>
            <p>{connectionState === 'connected' ? 'Loading stream...' : `Status: ${connectionState}`}</p>
            {error && <p className="error">{error}</p>}
          </div>
        )}
      </div>

      {connectionState === 'connected' && (
        <div className="stream-stats">
          <div className="stat">
            <span className="stat-label">Video</span>
            <span className="stat-value">{stats.videoBitrate} kbps</span>
          </div>
          <div className="stat">
            <span className="stat-label">Audio</span>
            <span className="stat-value">{stats.audioBitrate} kbps</span>
          </div>
          <div className="stat">
            <span className="stat-label">Frames</span>
            <span className="stat-value">{stats.framesDecoded} decoded</span>
          </div>
          {stats.framesDropped > 0 && (
            <div className="stat warning">
              <span className="stat-label">Dropped</span>
              <span className="stat-value">{stats.framesDropped}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CameraViewer;