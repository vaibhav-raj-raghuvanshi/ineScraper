import React, { useState } from 'react';
import { Database, Check, AlertCircle, X, ExternalLink, Key, Link as LinkIcon, Loader2 } from 'lucide-react';

export default function SupabaseModal({ isOpen, onClose, onSaveSuccess }) {
  if (!isOpen) return null;

  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [isError, setIsError] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!url.trim() || !key.trim()) {
      setIsError(true);
      setStatusMsg('Please enter both Supabase Project URL and Key');
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/config/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, key })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save credentials');

      setIsError(false);
      setStatusMsg('✓ Supabase credentials saved to server/.env! Restarting or reconnecting backend...');
      if (onSaveSuccess) onSaveSuccess();
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setIsError(true);
      setStatusMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '560px',
        width: '100%',
        padding: '2rem',
        position: 'relative',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            padding: '0.6rem',
            borderRadius: '10px',
            color: 'var(--accent-emerald)'
          }}>
            <Database size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Configure Supabase Database</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Connect your live PostgreSQL instance on Supabase
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Supabase Project URL
            </label>
            <div style={{ position: 'relative' }}>
              <LinkIcon size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={e => setUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem 0.65rem 2.5rem',
                  borderRadius: '10px',
                  background: 'rgba(9, 13, 22, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Supabase Service Role or Anon Key
            </label>
            <div style={{ position: 'relative' }}>
              <Key size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={key}
                onChange={e => setKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem 0.65rem 2.5rem',
                  borderRadius: '10px',
                  background: 'rgba(9, 13, 22, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Found in your Supabase project dashboard under <strong>Project Settings → API</strong>.
            </p>
          </div>

          {statusMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: isError ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: isError ? '#fb7185' : '#34d399',
              border: `1px solid ${isError ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
            }}>
              {isError ? <AlertCircle size={16} /> : <Check size={16} />}
              <span>{statusMsg}</span>
            </div>
          )}

          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '0.85rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            lineHeight: '1.4'
          }}>
            <strong>Important</strong>: Ensure you have executed the schema migration script in your Supabase SQL Editor:
            <code style={{ display: 'block', marginTop: '0.35rem', color: 'var(--accent-cyan)' }}>
              server/src/db/schema.sql
            </code>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>Save & Connect</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
