import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import CameraGrid from './components/CameraGrid';
import MotionAlerts from './components/MotionAlerts';
import CameraViewer from './components/CameraViewer';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { useSignaling } from './hooks/useSignaling';

const SIGNALING_URL = process.env.REACT_APP_SIGNALING_URL || 'wss://ubuntu-production-8e92.up.railway.app/signaling';

function App() {
  const [cameras, setCameras] = useState([]);
  const [motionAlerts, setMotionAlerts] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const { socket, sendMessage } = useSignaling(SIGNALING_URL, {
    onCameraList: (list) => setCameras(list),
    onMotionAlert: (alert) => setMotionAlerts(prev => [alert, ...prev].slice(0, 100)),
    onConnect: () => setConnectionStatus('connected'),
    onDisconnect: () => setConnectionStatus('disconnected'),
    onError: (err) => console.error('Signaling error:', err)
  });

  // Fetch initial camera list
  useEffect(() => {
    fetch('/api/cameras')
      .then(res => res.json())
      .then(data => setCameras(data))
      .catch(err => console.error('Failed to fetch cameras:', err));

    // Fetch motion alerts
    fetch('/api/motion-alerts')
      .then(res => res.json())
      .then(data => setMotionAlerts(data))
      .catch(err => console.error('Failed to fetch alerts:', err));
  }, []);

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
      <Header 
        connectionStatus={connectionStatus}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />
      
      <div className="main-container">
        <Sidebar 
          isOpen={sidebarOpen}
          cameras={cameras}
          motionAlerts={motionAlerts}
          onWatchCamera={handleWatchCamera}
          onRefresh={handleRefreshCameras}
        />
        
        <main className="main-content">
          {selectedCamera ? (
            <CameraViewer 
              camera={selectedCamera}
              signalingUrl={SIGNALING_URL}
              onClose={handleCloseViewer}
            />
          ) : (
            <CameraGrid 
              cameras={cameras}
              onWatchCamera={handleWatchCamera}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;