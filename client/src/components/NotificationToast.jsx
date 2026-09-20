import React from 'react';
import { Bell, TrendingDown, TrendingUp, AlertCircle, CheckCircle, X, ShoppingBag } from 'lucide-react';

export default function NotificationToast({
  notifications,
  onDismiss,
  isOpen,
  onClose,
  onClearAll
}) {
  if (!notifications) return null;

  const activeToasts = notifications.slice(0, 3);

  const getIcon = (type) => {
    switch (type) {
      case 'price_drop':
        return <TrendingDown size={17} color="#34d399" />;
      case 'price_rise':
        return <TrendingUp size={17} color="#fbbf24" />;
      case 'stock_back':
        return <CheckCircle size={17} color="#34d399" />;
      case 'stock_out':
        return <AlertCircle size={17} color="#fb7185" />;
      case 'neutral':
        return <CheckCircle size={17} color="#38bdf8" />;
      default:
        return <Bell size={17} color="#fafafa" />;
    }
  };

  const getBadgeStyle = (type) => {
    switch (type) {
      case 'price_drop':
        return { background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399' };
      case 'price_rise':
        return { background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24' };
      case 'stock_back':
        return { background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399' };
      case 'stock_out':
        return { background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185' };
      case 'neutral':
        return { background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8' };
      default:
        return { background: '#18181b', border: '1px solid #27272a', color: '#fafafa' };
    }
  };

  return (
    <>
      {/* Floating Active Toasts (Bottom Right or Top Right) */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: '380px',
        pointerEvents: 'none'
      }}>
        {activeToasts.map(toast => (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: '#0d0d10',
              border: '1px solid #27272a',
              borderRadius: '12px',
              padding: '1rem',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              animation: 'fadeIn 0.25s ease-out'
            }}
          >
            <div style={{
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...getBadgeStyle(toast.type)
            }}>
              {getIcon(toast.type)}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fafafa' }}>
                  {toast.title}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {toast.timestamp}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35', marginBottom: '0.2rem' }}>
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* History Drawer Modal */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          display: 'flex',
          justifyContent: 'flex-end'
        }} onClick={onClose}>
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              height: '100%',
              background: '#09090b',
              borderLeft: '1px solid #27272a',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.8)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Bell size={18} color="#fafafa" />
                <h3 style={{ fontSize: '1.1rem', color: '#fafafa' }}>Price & Stock Alerts</h3>
                <span className="brand-badge">{notifications.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {notifications.length > 0 && (
                  <button
                    className="btn-ghost"
                    onClick={onClearAll}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', border: 'none', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  className="btn-ghost"
                  onClick={onClose}
                  style={{ border: 'none', cursor: 'pointer', padding: '0.3rem' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Notification Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications.length > 0 ? (
                notifications.map(item => (
                  <div
                    key={item.id}
                    style={{
                      background: '#121215',
                      border: '1px solid #222226',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start'
                    }}
                  >
                    <div style={{
                      padding: '0.4rem',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...getBadgeStyle(item.type)
                    }}>
                      {getIcon(item.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fafafa' }}>{item.title}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.timestamp}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                        {item.message}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <Bell size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>No price or stock fluctuations detected yet.</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Alerts trigger automatically when 2-hour cron cycles or manual scrapes detect changes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
