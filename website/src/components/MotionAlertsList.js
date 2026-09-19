import React from 'react';

function MotionAlertsList({ alerts }) {
  if (alerts.length === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <p>No motion alerts</p>
        <span>Motion detection alerts will appear here</span>
      </div>
    );
  }

  return (
    <div className="alerts-list scrollbar-thin">
      {alerts.map(alert => (
        <div key={alert.id} className="alert-card">
          <div className="alert-image-container">
            {alert.imageBase64 ? (
              <img 
                src={`data:image/jpeg;base64,${alert.imageBase64}`}
                alt={`Motion detected at ${new Date(alert.timestamp).toLocaleTimeString()}`}
                className="alert-image"
              />
            ) : (
              <div className="alert-image-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
            )}
            <span className="alert-badge">MOTION</span>
          </div>
          <div className="alert-info">
            <div className="alert-header">
              <span className="alert-camera">Camera: {alert.cameraId.slice(-8)}</span>
              <span className="alert-time">{formatDateTime(alert.timestamp)}</span>
            </div>
            <div className="alert-meta">
              {alert.imageUrl && (
                <a href={alert.imageUrl} target="_blank" rel="noopener noreferrer">
                  View Full Image
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export default MotionAlertsList;