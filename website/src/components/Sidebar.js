import React, { useState } from 'react';
import CameraList from './CameraList';
import MotionAlertsList from './MotionAlertsList';

function Sidebar({ isOpen, cameras, motionAlerts, onWatchCamera, onRefresh }) {
  const [activeTab, setActiveTab] = useState('cameras');

  if (!isOpen) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Cameras & Alerts</h2>
        <button className="refresh-btn" onClick={onRefresh} title="Refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>

      <div className="sidebar-tabs">
        <button 
          className={activeTab === 'cameras' ? 'active' : ''}
          onClick={() => setActiveTab('cameras')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          Cameras ({cameras.length})
        </button>
        <button 
          className={activeTab === 'alerts' ? 'active' : ''}
          onClick={() => setActiveTab('alerts')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          Alerts ({motionAlerts.length})
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'cameras' && (
          <CameraList cameras={cameras} onWatch={onWatchCamera} />
        )}
        {activeTab === 'alerts' && (
          <MotionAlertsList alerts={motionAlerts} />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;