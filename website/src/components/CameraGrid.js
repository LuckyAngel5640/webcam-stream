import React from 'react';

function CameraGrid({ cameras, onWatchCamera }) {
  if (cameras.length === 0) {
    return (
      <div className="grid-empty">
        <svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <h2>No Cameras Online</h2>
        <p>Start the Android app to begin streaming</p>
        <div className="connection-info">
          <p>Signaling Server: <code>wss://dreamcast.cam/signaling</code></p>
          <p>Camera ID format: <code>camera_<device_serial></code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-grid">
      {cameras.map(camera => (
        <div 
          key={camera.id}
          className="grid-camera-card"
          onClick={() => onWatchCamera(camera)}
        >
          <div className="grid-camera-preview">
            <div className={`status-ring ${camera.status}`}></div>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </div>
          <div className="grid-camera-info">
            <h3>{camera.name}</h3>
            <div className="grid-camera-meta">
              <span className={`status-badge ${camera.status}`}>
                {camera.status.charAt(0).toUpperCase() + camera.status.slice(1)}
              </span>
              <span>{camera.resolution || '1280x720'}</span>
            </div>
            <div className="grid-camera-meta">
              <span>Last seen: {formatTime(camera.lastSeen)}</span>
              {camera.viewerCount !== undefined && (
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                  </svg>
                  {camera.viewerCount} viewer{camera.viewerCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="watch-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Watch Live</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

export default CameraGrid;