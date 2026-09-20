import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Check, ExternalLink, Loader2, Sparkles, ChevronLeft, ChevronRight, Layers, Filter } from 'lucide-react';

export default function ProductSearch({ trackedExternalIds, onTrackProduct }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(1000);
  const [totalPages, setTotalPages] = useState(42);
  const [catalogTotal, setCatalogTotal] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [trackingIds, setTrackingIds] = useState(new Set());
  const debounceRef = useRef(null);

  const fetchProducts = async (searchQuery, category, pageNum, size) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        category: category !== 'all' ? category : '',
        page: pageNum.toString(),
        pageSize: size.toString()
      });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items || []);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setCatalogTotal(data.catalogTotal || 1000);
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        }
      }
    } catch (err) {
      console.error('Failed to load catalog products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search query or category change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setPage(1); // Reset to page 1 on filter/search change
      fetchProducts(query, selectedCategory, 1, pageSize);
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query, selectedCategory, pageSize]);

  // Page navigation
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchProducts(query, selectedCategory, newPage, pageSize);
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
    <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      {/* Search Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Sparkles size={20} color="var(--accent-cyan)" />
            <h2 style={{ fontSize: '1.35rem' }}>Catalog Explorer & Product Tracker</h2>
            <span className="brand-badge">{catalogTotal.toLocaleString()} STORE ITEMS</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Browse and search all {catalogTotal.toLocaleString()} real products from INE's mock storefront. Select any item to scrape and track its live price.
          </p>
        </div>

        {/* Search Input Box */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
          <Search size={17} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search all 1,000 items by name, brand, SKU..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.75rem',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(9, 13, 22, 0.75)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.2s ease'
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent-cyan)'}
            onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
          />
          {isLoading && (
            <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-cyan)' }} />
          )}
        </div>
      </div>

      {/* Category Pills Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        overflowX: 'auto',
        paddingBottom: '0.75rem',
        marginBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid',
            borderColor: selectedCategory === 'all' ? 'var(--accent-cyan)' : 'var(--border-subtle)',
            background: selectedCategory === 'all' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            color: selectedCategory === 'all' ? '#38bdf8' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
        >
          All Items ({catalogTotal})
        </button>

        {categories.map(cat => {
          const isCatSelected = selectedCategory === cat.toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat.toLowerCase())}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: isCatSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                background: isCatSelected ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: isCatSelected ? '#38bdf8' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Pagination Bar Top */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div>
          Showing <strong>{results.length > 0 ? (page - 1) * pageSize + 1 : 0} – {Math.min(page * pageSize, total)}</strong> of <strong>{total}</strong> products
          {query && <span> matching <em>"{query}"</em></span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            style={{
              background: 'rgba(9, 13, 22, 0.8)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          >
            <option value={12}>12 per page</option>
            <option value={24}>24 per page</option>
            <option value={48}>48 per page</option>
            <option value={96}>96 per page</option>
          </select>

          <button
            className="btn btn-secondary"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            style={{ padding: '0.35rem 0.65rem' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', padding: '0 0.5rem' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            style={{ padding: '0.35rem 0.65rem' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Products Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem'
      }}>
        {results.map(product => {
          const isTracked = trackedExternalIds.includes(product.id);
          const isTracking = trackingIds.has(product.id);

          return (
            <div
              key={product.id}
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)'
                    }}>
                      #{product.id}
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
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: '0.35rem', lineHeight: '1.3' }}>
                  {product.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                  {product.brand} · SKU {product.sku}
                </p>
                <p style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  marginBottom: '1rem',
                  lineHeight: '1.4'
                }}>
                  {product.description}
                </p>
              </div>

              <button
                type="button"
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

      {/* Pagination Bar Bottom */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <button
            className="btn btn-secondary"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
