import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { TrendingDown, TrendingUp, DollarSign, Calendar, AlertCircle } from 'lucide-react';

export default function PriceChart({ product, history }) {
  if (!product) {
    return (
      <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Select a tracked product to visualize its price and stock trends.</p>
      </div>
    );
  }

  // Format data for Recharts
  const chartData = (history || []).map(item => {
    const d = new Date(item.scraped_at);
    return {
      timestamp: item.scraped_at,
      dateLabel: `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      price: Number(item.price),
      mrp: item.mrp ? Number(item.mrp) : null,
      inStock: item.in_stock,
      stockCount: item.stock_count,
      seller: item.seller
    };
  });

  // Calculate statistics
  const prices = chartData.map(d => d.price).filter(p => Number.isFinite(p) && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : null;

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'rgba(9, 13, 22, 0.95)',
          border: '1px solid var(--border-glow)',
          borderRadius: '10px',
          padding: '0.85rem 1rem',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(10px)'
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            {data.dateLabel}
          </p>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.25rem' }}>
            ₹{data.price.toLocaleString('en-IN')}
          </div>
          {data.mrp && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
              MRP: ₹{data.mrp.toLocaleString('en-IN')}
            </p>
          )}
          <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span className={`badge ${data.inStock ? 'badge-success' : 'badge-failed'}`} style={{ fontSize: '0.7rem' }}>
              {data.inStock ? (data.stockCount ? `${data.stockCount} In Stock` : 'In Stock') : 'Out of Stock'}
            </span>
            {data.seller && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                via {data.seller}
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
      {/* Header & Stats Strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h2 style={{ fontSize: '1.3rem' }}>{product.name}</h2>
            <span className="brand-badge">ID: {product.external_id}</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Historical price and inventory fluctuations across unattended 2-hour scrape cycles
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '0.5rem 1rem',
            textAlign: 'right'
          }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lowest Recorded</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
              {minPrice ? `₹${minPrice.toLocaleString('en-IN')}` : '—'}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '0.5rem 1rem',
            textAlign: 'right'
          }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Highest Recorded</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
              {maxPrice ? `₹${maxPrice.toLocaleString('en-IN')}` : '—'}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '0.5rem 1rem',
            textAlign: 'right'
          }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Valid Snapshots</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {chartData.length}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 340, marginTop: '1rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`}
                domain={['dataMin - 1000', 'dataMax + 1000']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#06b6d4"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#priceGradient)"
                dot={{ stroke: '#38bdf8', strokeWidth: 2, r: 4, fill: '#090d16' }}
                activeDot={{ stroke: '#fff', strokeWidth: 2, r: 6, fill: '#06b6d4' }}
                connectNulls={false} // Leave honest gaps on missing data!
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{
          height: 240,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(9, 13, 22, 0.4)',
          borderRadius: '12px',
          border: '1px dashed var(--border-subtle)',
          color: 'var(--text-muted)'
        }}>
          <AlertCircle size={24} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
          <p style={{ fontSize: '0.9rem' }}>Awaiting initial verified scrape for this product.</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Click the sync/refresh icon on the product card to trigger an immediate scrape.
          </p>
        </div>
      )}
    </div>
  );
}
