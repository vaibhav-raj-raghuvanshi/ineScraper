import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import ProductSearch from './components/ProductSearch';
import TrackedProductsList from './components/TrackedProductsList';
import PriceChart from './components/PriceChart';
import ScrapeLogsTable from './components/ScrapeLogsTable';
import NotificationToast from './components/NotificationToast';

export default function App() {
  // 1. Initialize persistent state from localStorage so page refresh never loses data
  const [trackedProducts, setTrackedProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('ine_tracked_products');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const [selectedProductId, setSelectedProductId] = useState(() => {
    try {
      return localStorage.getItem('ine_selected_product_id') || null;
    } catch (_) {
      return null;
    }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('ine_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrapingIds, setScrapingIds] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState(null);

  // In-memory cache for instant response when switching products
  const detailsCache = useRef(new Map());
  const prevProductsRef = useRef(new Map());

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('ine_tracked_products', JSON.stringify(trackedProducts));
    } catch (_) {}
  }, [trackedProducts]);

  useEffect(() => {
    try {
      if (selectedProductId) {
        localStorage.setItem('ine_selected_product_id', selectedProductId);
      }
    } catch (_) {}
  }, [selectedProductId]);

  useEffect(() => {
    try {
      localStorage.setItem('ine_notifications', JSON.stringify(notifications));
    } catch (_) {}
  }, [notifications]);

  // Helper to add a notification
  const addNotification = (item) => {
    setNotifications(prev => [item, ...prev.slice(0, 49)]); // keep up to 50 alerts
  };

  const handleDismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
  };

  // 1. Fetch tracked products with change detection for price & stock
  const fetchTracked = async () => {
    try {
      const res = await fetch('/api/tracked');
      if (res.ok) {
        const data = await res.json();

        // Check for price or stock changes against previous snapshot
        if (prevProductsRef.current.size > 0) {
          for (const curr of data) {
            const prev = prevProductsRef.current.get(curr.id);
            if (!prev) continue;

            const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            // Price Change Alert
            if (prev.latest_price && curr.latest_price && prev.latest_price !== curr.latest_price) {
              if (curr.latest_price < prev.latest_price) {
                const diff = prev.latest_price - curr.latest_price;
                addNotification({
                  id: `price_drop_${curr.id}_${Date.now()}`,
                  type: 'price_drop',
                  title: 'Price Drop Alert',
                  message: `${curr.name} price dropped by ₹${diff.toLocaleString('en-IN')}! Now ₹${curr.latest_price.toLocaleString('en-IN')} (was ₹${prev.latest_price.toLocaleString('en-IN')})`,
                  productName: curr.name,
                  timestamp: timeStr
                });
              } else {
                const diff = curr.latest_price - prev.latest_price;
                addNotification({
                  id: `price_rise_${curr.id}_${Date.now()}`,
                  type: 'price_rise',
                  title: 'Price Increase Alert',
                  message: `${curr.name} price increased by ₹${diff.toLocaleString('en-IN')} to ₹${curr.latest_price.toLocaleString('en-IN')}`,
                  productName: curr.name,
                  timestamp: timeStr
                });
              }
            }

            // Stock Status Change Alert
            if (prev.in_stock !== null && curr.in_stock !== null && prev.in_stock !== curr.in_stock) {
              addNotification({
                id: `stock_${curr.id}_${Date.now()}`,
                type: curr.in_stock ? 'stock_back' : 'stock_out',
                title: curr.in_stock ? 'Back in Stock Alert' : 'Out of Stock Alert',
                message: curr.in_stock
                  ? `${curr.name} is now available in stock! (${curr.stock_count || 'Limited'} units available)`
                  : `${curr.name} has gone out of stock.`,
                productName: curr.name,
                timestamp: timeStr
              });
            } else if (prev.stock_count !== null && curr.stock_count !== null && prev.stock_count !== curr.stock_count && curr.in_stock) {
              // Stock quantity fluctuation
              addNotification({
                id: `stock_qty_${curr.id}_${Date.now()}`,
                type: 'stock_back',
                title: 'Stock Quantity Update',
                message: `${curr.name} stock level updated: ${curr.stock_count} units remaining (was ${prev.stock_count}).`,
                productName: curr.name,
                timestamp: timeStr
              });
            }
          }
        }

        // Update previous products map
        const newMap = new Map();
        for (const item of data) {
          newMap.set(item.id, { ...item });
        }
        prevProductsRef.current = newMap;

        setTrackedProducts(data);
        if (!selectedProductId && data.length > 0) {
          setSelectedProductId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tracked products:', err);
    }
  };

  // 2. Fetch history and logs with instant caching
  const fetchProductDetails = async (productId, forceFresh = false) => {
    if (!productId) {
      setHistory([]);
      setLogs([]);
      return;
    }

    // Instant cache check (0ms response if cached within last 20 seconds)
    const cached = detailsCache.current.get(productId);
    const now = Date.now();
    if (!forceFresh && cached && (now - cached.timestamp < 20000)) {
      setHistory(cached.history);
      setLogs(cached.logs);
      return;
    }

    try {
      const [histRes, logsRes] = await Promise.all([
        fetch(`/api/tracked/${productId}/history`),
        fetch(`/api/tracked/${productId}/logs`)
      ]);

      const histData = histRes.ok ? await histRes.json() : [];
      const logsData = logsRes.ok ? await logsRes.json() : [];

      setHistory(histData);
      setLogs(logsData);

      // Save to cache
      detailsCache.current.set(productId, {
        history: histData,
        logs: logsData,
        timestamp: now
      });
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

  // Periodic poll every 15s to keep UI fresh and detect changes
  useEffect(() => {
    const timer = setInterval(() => {
      fetchTracked();
      if (selectedProductId) {
        fetchProductDetails(selectedProductId);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedProductId]);

  // Global Sync handler
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      await Promise.allSettled([
        fetchTracked(),
        selectedProductId ? fetchProductDetails(selectedProductId, true) : Promise.resolve()
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
      detailsCache.current.delete(id);
      prevProductsRef.current.delete(id);
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
          await fetchProductDetails(id, true);
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
        notificationCount={notifications.length}
        onToggleNotifications={() => setIsNotifOpen(prev => !prev)}
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

      {/* Real-Time Price & Stock Alert Notifications */}
      <NotificationToast
        notifications={notifications}
        onDismiss={handleDismissNotification}
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onClearAll={handleClearAllNotifications}
      />

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.5rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        background: '#09090b'
      }}>
        <p>INE Software Engineer Intern Assignment — Product Price Tracker</p>
        <p style={{ marginTop: '0.25rem' }}>
          Mock Store: <a href="https://demo.inelabteamdev.com" target="_blank" rel="noreferrer" style={{ color: '#e4e4e7', textDecoration: 'underline' }}>demo.inelabteamdev.com</a> · Cron Schedule: <code>0 */2 * * *</code>
        </p>
      </footer>
    </div>
  );
}

