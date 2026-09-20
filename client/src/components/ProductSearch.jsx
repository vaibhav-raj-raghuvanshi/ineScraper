import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check, ExternalLink, Loader2, Sparkles } from 'lucide-react';

export default function ProductSearch({ trackedExternalIds, onTrackProduct }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trackingIds, setTrackingIds] = useState(new Set());
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // Load initial catalog preview
      fetchInitialCatalog();
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&pageSize=12`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.items || []);
        }
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const fetchInitialCatalog = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/search?page=1&pageSize=8');
      if (res.ok) {
        const data = await res.json();
        setResults(data.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrack = async (product) => {
    setTrackingIds(prev => new Set(prev).add(product.id));
    try {
      await onTrackProduct(product);
    } finally {
      setTrackingIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} color="var(--accent-cyan)" />
            Search & Track INE Products
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Find products from INE's mock catalog by full or partial name. Once tracked, prices are scraped every 2 hours.
          </p>
        </div>

        {/* Search Input Box */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
          <Search size={17} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search keyboards, watches, totes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.7rem 1rem 0.7rem 2.6rem',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(9, 13, 22, 0.6)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent-cyan)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
          />
          {isLoading && (
            <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-cyan)' }} />
          )}
        </div>
      </div>

      {/* Results Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem',
        marginTop: '1.25rem'
      }}>
        {results.map(product => {
          const isTracked = trackedExternalIds.includes(product.id);
          const isTracking = trackingIds.has(product.id);

          return (
            <div
              key={product.id}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '1.1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    background: 'rgba(56, 189, 248, 0.1)',
                    color: '#38bdf8',
                    fontWeight: 600
                  }}>
                    {product.category || 'General'}
                  </span>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                    title="View on INE Mock Store"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem', lineHeight: '1.3' }}>
                  {product.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  {product.brand} · SKU {product.sku}
                </p>
                <p style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  marginBottom: '1rem'
                }}>
                  {product.description}
                </p>
              </div>

              <button
                className={`btn ${isTracked ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => handleTrack(product)}
                disabled={isTracked || isTracking}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem', padding: '0.55rem' }}
              >
                {isTracking ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Tracking & Scraping...</span>
                  </>
                ) : isTracked ? (
                  <>
                    <Check size={15} color="var(--accent-emerald)" />
                    <span style={{ color: 'var(--accent-emerald)' }}>Currently Tracked</span>
                  </>
                ) : (
                  <>
                    <Plus size={15} />
                    <span>Track This Product</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
