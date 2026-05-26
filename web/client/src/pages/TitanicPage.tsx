import { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { titanicApi, TitanicRow } from '../lib/api';

const PAGE_SIZE = 20;

const emptyForm = (): Partial<TitanicRow> => ({
  survived: 0, pclass: 3, name: '', sex: 'male', age: undefined,
  sib_sp: 0, parch: 0, ticket: '', fare: 0, cabin: '', embarked: 'S',
});

export default function TitanicPage() {
  const [data, setData]         = useState<TitanicRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<TitanicRow | null>(null);
  const [form, setForm]         = useState<Partial<TitanicRow>>(emptyForm());
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await titanicApi.list({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
      setData(res.data); setTotal(res.total);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(page); }, [page]);

  const openCreate = () => { setForm(emptyForm()); setError(''); setModal('create'); };
  const openEdit   = (row: TitanicRow) => { setSelected(row); setForm({ ...row }); setError(''); setModal('edit'); };
  const openDelete = (row: TitanicRow) => { setSelected(row); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setError(''); };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (modal === 'create') await titanicApi.create(form);
      else if (modal === 'edit' && selected) await titanicApi.update(selected.id, form);
      closeModal(); load(page);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try { await titanicApi.delete(selected.id); closeModal(); load(page); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const field = (k: keyof TitanicRow, label: string, type = 'text', opts?: string[]) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>{label}</label>
      {opts ? (
        <select value={String(form[k] ?? '')} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          style={{ width: '100%', background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 6, padding: '8px 10px', color: '#e2e8f0', fontSize: 13 }}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(form[k] ?? '')}
          onChange={e => setForm(f => ({ ...f, [k]: type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value }))}
          style={{ width: '100%', background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 6, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
      )}
    </div>
  );

  const columns = [
    { key: 'id' as const,        label: 'ID' },
    { key: 'survived' as const,  label: 'Survived', render: (v: unknown) => <span style={{ color: v ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{v ? '✓ Yes' : '✗ No'}</span> },
    { key: 'pclass' as const,    label: 'Class', render: (v: unknown) => `Class ${v}` },
    { key: 'name' as const,      label: 'Name' },
    { key: 'sex' as const,       label: 'Sex' },
    { key: 'age' as const,       label: 'Age', render: (v: unknown) => v != null ? String(v) : '—' },
    { key: 'fare' as const,      label: 'Fare', render: (v: unknown) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
    { key: 'embarked' as const,  label: 'Port', render: (v: unknown) => ({ C: 'Cherbourg', Q: 'Queenstown', S: 'Southampton' }[String(v ?? '')] ?? String(v ?? '—')) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Titanic Passengers</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>staging.titanic · {total.toLocaleString()} rows</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => load(page)} style={btnStyle('#1e2a3a', '#94a3b8')}><RefreshCw size={14} /> Refresh</button>
          <button onClick={openCreate} style={btnStyle('#1d4ed8', '#e2e8f0')}><Plus size={14} /> Add Passenger</button>
        </div>
      </div>

      {error && !modal && <div style={{ background: '#1c1012', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <DataTable columns={columns} data={data} total={total} page={page} pageSize={PAGE_SIZE}
        onPageChange={setPage} onEdit={openEdit} onDelete={openDelete} loading={loading} />

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Add Passenger' : `Edit Passenger #${selected?.id}`} onClose={closeModal}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>{field('name', 'Full Name')}</div>
            {field('survived', 'Survived', 'text', ['0', '1'])}
            {field('pclass', 'Passenger Class', 'text', ['1', '2', '3'])}
            {field('sex', 'Sex', 'text', ['male', 'female'])}
            {field('age', 'Age', 'number')}
            {field('fare', 'Fare (£)', 'number')}
            {field('sib_sp', 'Siblings/Spouses', 'number')}
            {field('parch', 'Parents/Children', 'number')}
            {field('ticket', 'Ticket Number')}
            {field('cabin', 'Cabin')}
            {field('embarked', 'Embarked Port', 'text', ['S', 'C', 'Q'])}
          </div>
          {error && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={closeModal} style={btnStyle('#1e2a3a', '#94a3b8')}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('#1d4ed8', '#e2e8f0')}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && selected && (
        <Modal title="Delete Passenger" onClose={closeModal} width={400}>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: '#e2e8f0' }}>{selected.name}</strong> (ID {selected.id})? This cannot be undone.
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
