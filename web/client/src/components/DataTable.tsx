import { Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> { key: keyof T; label: string; render?: (val: unknown, row: T) => React.ReactNode; }

interface Props<T extends { id: number }> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  loading?: boolean;
}

export default function DataTable<T extends { id: number }>({
  columns, data, total, page, pageSize, onPageChange, onEdit, onDelete, loading,
}: Props<T>) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0f1117' }}>
              {columns.map(c => (
                <th key={String(c.key)} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e2a3a', whiteSpace: 'nowrap' }}>
                  {c.label}
                </th>
              ))}
              {(onEdit || onDelete) && <th style={{ padding: '10px 14px', borderBottom: '1px solid #1e2a3a', width: 80 }} />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} style={{ padding: 32, textAlign: 'center', color: '#475569' }}>Loading…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={columns.length + 1} style={{ padding: 32, textAlign: 'center', color: '#475569' }}>No data found</td></tr>
            ) : data.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #1a2232', background: i % 2 === 0 ? 'transparent' : '#0f1420' }}>
                {columns.map(c => (
                  <td key={String(c.key)} style={{ padding: '9px 14px', color: '#cbd5e1', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '—')}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {onEdit && (
                        <button onClick={() => onEdit(row)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                          <Pencil size={14} />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(row)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
        <span>{total} total rows</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
            style={{ background: 'none', border: '1px solid #1e2a3a', borderRadius: 6, color: page === 1 ? '#2d3748' : '#94a3b8', cursor: page === 1 ? 'not-allowed' : 'pointer', padding: '4px 8px' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ color: '#94a3b8' }}>Page {page} of {totalPages || 1}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            style={{ background: 'none', border: '1px solid #1e2a3a', borderRadius: 6, color: page >= totalPages ? '#2d3748' : '#94a3b8', cursor: page >= totalPages ? 'not-allowed' : 'pointer', padding: '4px 8px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
