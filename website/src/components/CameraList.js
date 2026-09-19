import React from 'react';

function CameraList({ cameras, onWatch }) {
  if (cameras.length === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <p>No cameras connected</p>
        <span>Waiting for cameras to come online...</span>
      </div>
    );
  }

  return (
    <div className="camera-list scrollbar-thin">
      {cameras.map(camera => (
        <div 
          key={camera.id}
          className="camera-card"
          onClick={() => onWatch(camera)}
        >
          <div className="camera-preview">
            <div className={`status-dot ${camera.status}`}></div>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </div>
          <div className="camera-info">
            <h3>{camera.name}</h3>
            <div className="camera-meta">
              <span className={`status-badge ${camera.status}`}>
                {camera.status.charAt(0).toUpperCase() + camera.status.slice(1)}
              </span>
              <span>{camera.resolution || '1280x720'}</span>
              {camera.viewerCount !== undefined && (
                <span className="viewer-count">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  {camera.viewerCount}
                </span>
              )}
            </div>
            <div className="camera-meta">
              <span>Last seen: {formatTime(camera.lastSeen)}</span>
            </div>
          </div>
          <svg className="watch-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
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

export default CameraList;