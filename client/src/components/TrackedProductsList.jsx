import React, { useState, useEffect } from 'react';
import { Trash2, TrendingUp, RefreshCw, ExternalLink, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

export default function TrackedProductsList({
  products,
  selectedProductId,
  onSelectProduct,
  onDeleteProduct,
  onManualScrape,
  scrapingIds
}) {
  const [page, setPage] = useState(1);
  const pageSize = 9; // Show top 9 per page as requested
  const totalPages = Math.ceil((products?.length || 0) / pageSize) || 1;

  // Auto-clamp page if items are removed
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  if (!products || products.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '0.5rem' }}>No products currently tracked in your portfolio.</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Use the search box above to find and track your first item from INE's mock storefront.</p>
      </div>
    );
  }

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Pending initial scrape';
    const ms = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(ms / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
  };

  const isStale = (isoString) => {
    if (!isoString) return false;
    const ms = Date.now() - new Date(isoString).getTime();
    return ms > 135 * 60 * 1000; // > 2h15m (135 min)
  };

  const startIndex = (page - 1) * pageSize;
  const visibleProducts = products.slice(startIndex, startIndex + pageSize);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fafafa' }}>
          <TrendingUp size={18} color="#fafafa" />
          Tracked Products Portfolio ({products.length})
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Click any product to view its price history chart and scrape logs
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '1.25rem'
      }}>
        {visibleProducts.map(product => {
          const isSelected = selectedProductId === product.id;
          const isScraping = scrapingIds.has(product.id);
          const stale = isStale(product.last_success_at);

          return (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product.id)}
              className="glass-panel"
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                borderColor: isSelected ? '#ffffff' : 'var(--border-subtle)',
                boxShadow: isSelected ? '0 0 20px rgba(255, 255, 255, 0.1)' : 'var(--shadow-card)',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: isSelected ? '#121216' : '#0d0d10'
              }}
            >
              <div>
                {/* Header badges */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      color: 'var(--text-muted)'
                    }}>
                      #{product.external_id}
                    </span>
                    <span className={`badge ${stale ? 'badge-stale' : 'badge-fresh'}`}>
                      {stale ? 'STALE (>2h15m)' : 'FRESH'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManualScrape(product.id);
                      }}
                      className="btn-ghost"
                      style={{ padding: '0.25rem', borderRadius: '6px', cursor: isScraping ? 'wait' : 'pointer', border: 'none' }}
                      title="Scrape and update live price immediately"
                    >
                      <RefreshCw size={15} className={isScraping ? 'animate-spin' : ''} color="#fafafa" />
                    </button>
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'var(--text-muted)', padding: '0.25rem' }}
                      title="Open store page"
                    >
                      <ExternalLink size={15} />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Remove ${product.name} from your tracked portfolio?`)) {
                          onDeleteProduct(product.id);
                        }
                      }}
                      className="btn-ghost"
                      style={{ padding: '0.25rem', borderRadius: '6px', cursor: 'pointer', border: 'none' }}
                      title="Remove product from portfolio"
                    >
                      <Trash2 size={15} color="var(--accent-rose)" />
                    </button>
                  </div>
                </div>

                {/* Product Title */}
                <h3 style={{ fontSize: '1.05rem', marginBottom: '0.25rem', lineHeight: '1.3', color: '#fafafa' }}>
                  {product.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  {product.brand} · {product.category}
                </p>

                {/* Live Price & Stock Display */}
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: '10px',
                  background: '#09090b',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '0.75rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Current Price</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fafafa' }}>
                        {product.latest_price ? `₹${product.latest_price.toLocaleString('en-IN')}` : 'Analyzing…'}
                      </span>
                      {product.latest_mrp && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                          ₹{product.latest_mrp.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Stock Status</span>
                    {product.in_stock !== null ? (
                      <span className={`badge ${product.in_stock ? 'badge-success' : 'badge-failed'}`} style={{ marginTop: '0.2rem' }}>
                        {product.in_stock ? (product.stock_count ? `${product.stock_count} IN STOCK` : 'IN STOCK') : 'OUT OF STOCK'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pending</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Timestamp */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                paddingTop: '0.5rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={13} />
                  {formatRelativeTime(product.last_scraped_at || product.last_success_at)}
                </span>
                <span style={{ color: isSelected ? '#ffffff' : 'inherit', fontWeight: isSelected ? 600 : 400 }}>
                  {isSelected ? '● Active in Chart' : 'Click to View'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls for Tracked Products (Top 9 per page) */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Page <strong style={{ color: '#fafafa' }}>{page}</strong> of <strong style={{ color: '#fafafa' }}>{totalPages}</strong>
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
