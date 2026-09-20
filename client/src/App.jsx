import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ProductSearch from './components/ProductSearch';
import TrackedProductsList from './components/TrackedProductsList';
import PriceChart from './components/PriceChart';
import ScrapeLogsTable from './components/ScrapeLogsTable';

export default function App() {
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrapingIds, setScrapingIds] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);

  // 1. Fetch tracked products on mount
  const fetchTracked = async () => {
    try {
      const res = await fetch('/api/tracked');
      if (res.ok) {
        const data = await res.json();
        setTrackedProducts(data);
        if (!selectedProductId && data.length > 0) {
          setSelectedProductId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tracked products:', err);
    }
  };

  // 2. Fetch history and logs for active product
  const fetchProductDetails = async (productId) => {
    if (!productId) {
      setHistory([]);
      setLogs([]);
      return;
    }
    try {
      const [histRes, logsRes] = await Promise.all([
        fetch(`/api/tracked/${productId}/history`),
        fetch(`/api/tracked/${productId}/logs`)
      ]);

      if (histRes.ok) setHistory(await histRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (err) {
      console.error('Failed to fetch product details:', err);
    }
  };

  useEffect(() => {
    fetchTracked();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchProductDetails(selectedProductId);
    }
  }, [selectedProductId]);

  // Periodic poll every 15s to keep UI fresh
  useEffect(() => {
    const timer = setInterval(() => {
      fetchTracked();
      if (selectedProductId) {
        fetchProductDetails(selectedProductId);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedProductId]);

  // Global Sync handler (never gets stuck, never shows blocked cursor)
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      await Promise.allSettled([
        fetchTracked(),
        selectedProductId ? fetchProductDetails(selectedProductId) : Promise.resolve()
      ]);
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const handleTrackProduct = async (product) => {
    setErrorMessage(null);
    try {
      const res = await fetch('/api/tracked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: product.id,
          name: product.name,
          url: product.url,
          category: product.category,
          brand: product.brand
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to track product');
      }

      const created = await res.json();
      await fetchTracked();
      setSelectedProductId(created.id);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await fetch(`/api/tracked/${id}`, { method: 'DELETE' });
      const remaining = trackedProducts.filter(p => p.id !== id);
      setTrackedProducts(remaining);
      if (selectedProductId === id) {
        setSelectedProductId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  // Manual scrape handler (forces live scrape without TTL block)
  const handleManualScrape = async (id) => {
    setErrorMessage(null);
    setScrapingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/tracked/${id}/scrape?force=true`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Scrape failed');
      } else {
        await fetchTracked();
        if (selectedProductId === id) {
          await fetchProductDetails(id);
        }
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setScrapingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const selectedProduct = trackedProducts.find(p => p.id === selectedProductId) || null;
  const trackedExternalIds = trackedProducts.map(p => p.external_id);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        onRefreshAll={handleRefreshAll}
        isRefreshing={isRefreshing}
      />

      <main className="app-container" style={{ flex: 1, marginTop: '2rem' }}>
        {/* Global Error Alert */}
        {errorMessage && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '10px',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fb7185',
            fontSize: '0.9rem'
          }}>
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Full 1,000 Catalog Search & Track Section */}
        <ProductSearch
          trackedExternalIds={trackedExternalIds}
          onTrackProduct={handleTrackProduct}
        />

        {/* 2. Tracked Products Grid */}
        <TrackedProductsList
          products={trackedProducts}
          selectedProductId={selectedProductId}
          onSelectProduct={setSelectedProductId}
          onDeleteProduct={handleDeleteProduct}
          onManualScrape={handleManualScrape}
          scrapingIds={scrapingIds}
        />

        {/* 3. Price History Chart for Selected Product */}
        <PriceChart
          product={selectedProduct}
          history={history}
        />

        {/* 4. Honest Audit Logs Table for Selected Product */}
        <ScrapeLogsTable
          product={selectedProduct}
          logs={logs}
        />
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.5rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        background: 'rgba(9, 13, 22, 0.9)'
      }}>
        <p>INE Software Engineer Intern Assignment — Product Price Tracker</p>
        <p style={{ marginTop: '0.25rem' }}>
          Mock Store: <a href="https://demo.inelabteamdev.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>demo.inelabteamdev.com</a> · Cron Schedule: <code>0 */2 * * *</code>
        </p>
      </footer>
    </div>
  );
}
