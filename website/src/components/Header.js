import React from 'react';

function Header({ connectionStatus, onToggleSidebar, sidebarOpen }) {
  const statusColors = {
    connected: '#4caf50',
    connecting: '#ff9800',
    disconnected: '#cf6679'
  };

  const statusLabels = {
    connected: 'Live',
    connecting: 'Connecting...',
    disconnected: 'Offline'
  };

  return (
    <header className="header">
      <button 
        className="menu-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      
      <div className="header-title">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <h1>WebCam Stream</h1>
      </div>

      <div className="header-status">
        <span 
          className="status-indicator"
          style={{ backgroundColor: statusColors[connectionStatus] }}
        ></span>
        <span className="status-text">{statusLabels[connectionStatus]}</span>
      </div>
    </header>
  );
}

export default Header;