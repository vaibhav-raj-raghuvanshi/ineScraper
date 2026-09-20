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

  // Custom Dot to highlight MIN and MAX price points on the line
  const CustomizedDot = (props) => {
    const { cx, cy, payload, index } = props;
    if (!cx || !cy || !payload) return null;

    const hasVariance = minPrice !== null && maxPrice !== null && minPrice !== maxPrice;
    const isMin = hasVariance && payload.price === minPrice;
    const isMax = hasVariance && payload.price === maxPrice;
    const isLast = index === chartData.length - 1;

    if (isMin) {
      return (
        <g key={`dot-min-${index}`}>
          <circle cx={cx} cy={cy} r={9} fill="rgba(34, 197, 94, 0.25)" />
          <circle cx={cx} cy={cy} r={5} fill="#22c55e" stroke="#000000" strokeWidth={2} />
          <g transform={`translate(${cx}, ${cy + 18})`}>
            <rect x={-28} y={-10} width={56} height={18} rx={4} fill="#052e16" stroke="#22c55e" strokeWidth={1} />
            <text x={0} y={2} fill="#86efac" fontSize={9} fontWeight="700" textAnchor="middle" dominantBaseline="middle">
              MIN ₹{payload.price.toLocaleString('en-IN')}
            </text>
          </g>
        </g>
      );
    }

    if (isMax) {
      return (
        <g key={`dot-max-${index}`}>
          <circle cx={cx} cy={cy} r={9} fill="rgba(245, 158, 11, 0.25)" />
          <circle cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#000000" strokeWidth={2} />
          <g transform={`translate(${cx}, ${cy - 18})`}>
            <rect x={-28} y={-10} width={56} height={18} rx={4} fill="#451a03" stroke="#f59e0b" strokeWidth={1} />
            <text x={0} y={2} fill="#fde68a" fontSize={9} fontWeight="700" textAnchor="middle" dominantBaseline="middle">
              MAX ₹{payload.price.toLocaleString('en-IN')}
            </text>
          </g>
        </g>
      );
    }

    if (isLast) {
      return (
        <g key={`dot-last-${index}`}>
          <circle cx={cx} cy={cy} r={6} fill="rgba(255, 255, 255, 0.25)" />
          <circle cx={cx} cy={cy} r={3.5} fill="#ffffff" stroke="#000000" strokeWidth={1.5} />
        </g>
      );
    }

    return (
      <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill="#000000" stroke="#71717a" strokeWidth={1.5} />
    );
  };

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const hasVariance = minPrice !== null && maxPrice !== null && minPrice !== maxPrice;
      const isMin = hasVariance && data.price === minPrice;
      const isMax = hasVariance && data.price === maxPrice;

      return (
        <div style={{
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '10px',
          padding: '0.85rem 1rem',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {data.dateLabel}
            </p>
            {isMin && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                LOWEST RECORDED
              </span>
            )}
            {isMax && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                HIGHEST RECORDED
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fafafa', marginBottom: '0.25rem' }}>
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
            <h2 style={{ fontSize: '1.3rem', color: '#fafafa' }}>{product.name}</h2>
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
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fafafa' }}>
              {chartData.length}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 340, marginTop: '1rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 25, right: 35, left: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="#71717a"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
              />
              <YAxis
                stroke="#71717a"
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
                stroke="#ffffff"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#priceGradient)"
                dot={<CustomizedDot />}
                activeDot={{ stroke: '#ffffff', strokeWidth: 2, r: 6, fill: '#ffffff' }}
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
          background: '#0d0d10',
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
