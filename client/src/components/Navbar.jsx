import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Clock, RefreshCw, Zap } from 'lucide-react';

export default function Navbar({ onRefreshAll, isRefreshing }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    try {
      const res = await fetch('/health');
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
    const timer = setInterval(checkHealth, 20000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="header-glass">
      <div className="nav-content">
        <div className="brand-logo">
          <div style={{
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            padding: '0.55rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
          }}>
            <Activity size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>INE Store</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 300, color: 'var(--accent-cyan)' }}>Price Pulse</span>
              <span className="brand-badge">2-HR CRON</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automated Scraper & Reliability Monitor</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Keep-Warm Health Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.45rem 0.85rem',
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8rem'
          }}>
            <span className={`pulse-dot ${health?.status === 'healthy' ? 'emerald' : 'amber'}`} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {health ? 'Backend Live (Keep-Warm Active)' : 'Connecting...'}
            </span>
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

          {/* Manual Refresh Button */}
          <button
            className="btn btn-secondary"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            title="Refresh active dashboard data"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>
    </header>
  );
}
