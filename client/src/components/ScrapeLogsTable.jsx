import React from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Clock, Hash } from 'lucide-react';

export default function ScrapeLogsTable({ product, logs }) {
  if (!product) return null;

  const renderOutcomeBadge = (outcome) => {
    switch (outcome) {
      case 'success':
        return (
          <span className="badge badge-success">
            <CheckCircle2 size={12} />
            Success (1st Try)
          </span>
        );
      case 'retried':
        return (
          <span className="badge badge-retried">
            <AlertTriangle size={12} />
            Retried (Resolved)
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="badge badge-failed">
            <XCircle size={12} />
            Failed
          </span>
        );
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fafafa' }}>
            <ShieldAlert size={18} color="#fafafa" />
            Scrape Execution Audit Log — {product.name}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Honest per-attempt log recording all runs, durations, network statuses, and failure diagnostics.
          </p>
        </div>

        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Total Logged Runs: {logs?.length || 0}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 1rem' }}>Outcome</th>
              <th style={{ padding: '0.75rem 1rem' }}>Attempts</th>
              <th style={{ padding: '0.75rem 1rem' }}>Duration</th>
              <th style={{ padding: '0.75rem 1rem' }}>HTTP Status</th>
              <th style={{ padding: '0.75rem 1rem' }}>Diagnostic Notes / Error Details</th>
            </tr>
          </thead>
          <tbody>
            {logs && logs.length > 0 ? (
              logs.map((log) => {
                const date = new Date(log.started_at);
                const dateFormatted = `${date.toLocaleDateString('en-IN')} ${date.toLocaleTimeString('en-IN')}`;

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {dateFormatted}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {renderOutcomeBadge(log.outcome)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        color: log.attempts > 1 ? 'var(--accent-amber)' : 'inherit'
                      }}>
                        {log.attempts} / 3
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {log.duration_ms !== null ? `${log.duration_ms.toLocaleString()} ms` : 'In-flight'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{
                        color: log.http_status === 200 ? 'var(--accent-emerald)' : (log.http_status ? 'var(--accent-rose)' : 'var(--text-muted)')
                      }}>
                        {log.http_status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: log.error_message ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                      {log.error_message ? (
                        <span style={{ wordBreak: 'break-word' }}>{log.error_message}</span>
                      ) : (
                        <span style={{ color: 'var(--accent-emerald)' }}>✓ Scraped and verified cleanly without error</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No execution logs recorded yet for this product.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
