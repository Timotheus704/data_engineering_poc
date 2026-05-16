interface Props { label: string; value: string | number; sub?: string; color?: string; }

export default function StatCard({ label, value, sub, color = '#3b82f6' }: Props) {
  return (
    <div style={{
      background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12,
      padding: '20px 24px', minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
