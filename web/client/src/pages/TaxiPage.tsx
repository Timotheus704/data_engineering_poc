import { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { taxiApi, TaxiRow } from '../lib/api';

const PAGE_SIZE = 20;

const emptyForm = (): Partial<TaxiRow> => ({
  vendor_id: 1, passenger_count: 1, trip_distance: 0,
  fare_amount: 0, tip_amount: 0, total_amount: 0, payment_type: 1,
});

const fmt = (v: unknown, prefix = '') => v != null ? `${prefix}${Number(v).toFixed(2)}` : '—';
const fmtDt = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '—';

export default function TaxiPage() {
  const [data, setData]         = useState<TaxiRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<TaxiRow | null>(null);
  const [form, setForm]         = useState<Partial<TaxiRow>>(emptyForm());
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await taxiApi.list({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
      setData(res.data); setTotal(res.total);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(page); }, [page]);

  const openCreate = () => { setForm(emptyForm()); setError(''); setModal('create'); };
  const openEdit   = (row: TaxiRow) => { setSelected(row); setForm({ ...row }); setError(''); setModal('edit'); };
  const openDelete = (row: TaxiRow) => { setSelected(row); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setError(''); };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (modal === 'create') await taxiApi.create(form);
      else if (modal === 'edit' && selected) await taxiApi.update(selected.id, form);
      closeModal(); load(page);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try { await taxiApi.delete(selected.id); closeModal(); load(page); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const numField = (k: keyof TaxiRow, label: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>{label}</label>
      <input type="number" step="0.01" value={String(form[k] ?? '')}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value === '' ? undefined : Number(e.target.value) }))}
        style={{ width: '100%', background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 6, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
    </div>
  );

  const dtField = (k: keyof TaxiRow, label: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>{label}</label>
      <input type="datetime-local" value={form[k] ? String(form[k]).slice(0, 16) : ''}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value || undefined }))}
        style={{ width: '100%', background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 6, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
    </div>
  );

  const columns = [
    { key: 'id' as const,              label: 'ID' },
    { key: 'pickup_datetime' as const, label: 'Pickup',    render: fmtDt },
    { key: 'passenger_count' as const, label: 'Pax' },
    { key: 'trip_distance' as const,   label: 'Distance',  render: (v: unknown) => fmt(v, '') + ' mi' },
    { key: 'fare_amount' as const,     label: 'Fare',      render: (v: unknown) => fmt(v, '$') },
    { key: 'tip_amount' as const,      label: 'Tip',       render: (v: unknown) => fmt(v, '$') },
    { key: 'total_amount' as const,    label: 'Total',     render: (v: unknown) => <strong style={{ color: '#a78bfa' }}>{fmt(v, '$')}</strong> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>NYC Taxi Trips</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>staging.nyc_taxi · {total.toLocaleString()} rows</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => load(page)} style={btnStyle('#1e2a3a', '#94a3b8')}><RefreshCw size={14} /> Refresh</button>
          <button onClick={openCreate} style={btnStyle('#1d4ed8', '#e2e8f0')}><Plus size={14} /> Add Trip</button>
        </div>
      </div>

      {error && !modal && <div style={{ background: '#1c1012', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <DataTable columns={columns} data={data} total={total} page={page} pageSize={PAGE_SIZE}
        onPageChange={setPage} onEdit={openEdit} onDelete={openDelete} loading={loading} />

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Add Trip' : `Edit Trip #${selected?.id}`} onClose={closeModal}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {dtField('pickup_datetime', 'Pickup DateTime')}
            {dtField('dropoff_datetime', 'Dropoff DateTime')}
            {numField('passenger_count', 'Passenger Count')}
            {numField('vendor_id', 'Vendor ID')}
            {numField('trip_distance', 'Trip Distance (mi)')}
            {numField('fare_amount', 'Fare ($)')}
            {numField('tip_amount', 'Tip ($)')}
            {numField('total_amount', 'Total ($)')}
            {numField('payment_type', 'Payment Type (1=card, 2=cash)')}
          </div>
          {error && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={closeModal} style={btnStyle('#1e2a3a', '#94a3b8')}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('#1d4ed8', '#e2e8f0')}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal title="Delete Trip" onClose={closeModal} width={400}>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
            Delete trip <strong style={{ color: '#e2e8f0' }}>#{selected.id}</strong> (${Number(selected.total_amount ?? 0).toFixed(2)})? This cannot be undone.
          </p>
          {error && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={closeModal} style={btnStyle('#1e2a3a', '#94a3b8')}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={btnStyle('#7f1d1d', '#fca5a5')}>{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const btnStyle = (bg: string, color: string) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  background: bg, color, border: 'none', borderRadius: 8,
  padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
} as React.CSSProperties);
