import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard';
import { titanicApi, taxiApi, adminApi } from '../lib/api';

export default function Dashboard() {
  const [titanicStats, setTitanicStats] = useState<Record<string, string> | null>(null);
  const [taxiStats, setTaxiStats] = useState<Record<string, string> | null>(null);
  const [titanicSummary, setTitanicSummary] = useState<Record<string, unknown>[]>([]);
  const [taxiHourly, setTaxiHourly] = useState<Record<string, unknown>[]>([]);
  const [dbInfo, setDbInfo] = useState<{ pg_version: string; db_size: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      titanicApi.stats(),
      taxiApi.stats(),
      titanicApi.summary(),
      taxiApi.hourly(),
      adminApi.dbInfo(),
    ]).then(([ts, taxi, summary, hourly, db]) => {
      setTitanicStats(ts.totals);
      setTaxiStats(taxi.data);
      setTitanicSummary(summary.data);
      setTaxiHourly(hourly.data.slice(0, 24));
      setDbInfo(db);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>Loading dashboard…</div>;

  const chartData = titanicSummary.map((r: any) => ({
    name: `Class ${r.pclass} ${r.sex}`,
    rate: Number(r.survival_rate_pct),
  }));

  const taxiData = taxiHourly.map((r: any) => ({
    hour: new Date(r.hour).toISOString().slice(11, 13) + 'h',
    trips: Number(r.total_trips),
    fare: Number(r.avg_fare_usd),
  }));

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          PostgreSQL {dbInfo?.pg_version} · DB size: {dbInfo?.db_size}
        </p>
      </div>

      {/* Titanic stats */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', marginBottom: 12, fontWeight: 600 }}>Titanic Dataset</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <StatCard label="Total Passengers" value={titanicStats?.total ?? '—'} />
          <StatCard label="Survivors" value={titanicStats?.survivors ?? '—'} color="#22c55e" />
          <StatCard label="Survival Rate" value={`${titanicStats?.survival_rate ?? '—'}%`} color="#f59e0b" sub="across all classes" />
        </div>
      </div>

      {/* Taxi stats */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', marginBottom: 12, fontWeight: 600 }}>NYC Taxi Dataset</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          <StatCard label="Total Trips" value={Number(taxiStats?.total_trips ?? 0).toLocaleString()} />
          <StatCard label="Avg Fare" value={`$${taxiStats?.avg_fare ?? '—'}`} color="#a78bfa" />
          <StatCard label="Avg Tip" value={`$${taxiStats?.avg_tip ?? '—'}`} color="#34d399" />
          <StatCard label="Total Revenue" value={`$${Number(taxiStats?.total_revenue ?? 0).toLocaleString()}`} color="#f87171" sub="all trips combined" />
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>Titanic — Survival Rate by Class &amp; Sex</div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="rate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: '#475569', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>No data — load Titanic pipeline first</div>}
        </div>

        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>NYC Taxi — Hourly Trips</div>
          {taxiData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={taxiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="trips" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div style={{ color: '#475569', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>No data — load NYC Taxi pipeline first</div>}
        </div>
      </div>
    </div>
  );
}
