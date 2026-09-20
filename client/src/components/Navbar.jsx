import React, { useState, useEffect } from 'react';
import { Activity, Clock, RefreshCw, Bell } from 'lucide-react';
import { API_BASE } from '../config';

export default function Navbar({ onRefreshAll, isRefreshing, notificationCount, onToggleNotifications }) {
  const [health, setHealth] = useState(null);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) {
      setHealth(null);
    }
  };

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header-glass">
      <div className="nav-content">
        <div className="brand-logo">
          <div style={{
            background: '#18181b',
            border: '1px solid #27272a',
            padding: '0.55rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Activity size={20} color="#fafafa" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fafafa' }}>
                INE Store
              </span>
              <span style={{ fontSize: '1.25rem', fontWeight: 300, color: '#a1a1aa' }}>
                Price Pulse
              </span>
              <span className="brand-badge">2-HR CRON</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              1,000 Live Catalog Products · Automated Scraper & Reliability Monitor
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Keep-Warm Health Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.85rem',
            borderRadius: '9999px',
            background: '#141417',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)'
          }}>
            <span>{health ? 'Backend Live' : 'Connecting...'}</span>
          </div>

          {/* Schedule Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <Clock size={15} />
            <span>0 */2 * * *</span>
          </div>

          {/* Notifications Alert Bell */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onToggleNotifications}
            title="View Price and Stock Alerts"
            style={{ position: 'relative', padding: '0.55rem 0.85rem' }}
          >
            <Bell size={16} color="#fafafa" />
            {notificationCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#ffffff',
                color: '#000000',
                fontSize: '0.68rem',
                fontWeight: 800,
                borderRadius: '9999px',
                padding: '0.1rem 0.35rem',
                lineHeight: 1
              }}>
                {notificationCount}
              </span>
            )}
          </button>

          {/* Sync Button */}
          <button
            type="button"
            className="btn btn-secondary btn-sync"
            onClick={onRefreshAll}
            title="Sync live dashboard data with backend and store"
            style={{ cursor: isRefreshing ? 'wait' : 'pointer' }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} color="#fafafa" />
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
