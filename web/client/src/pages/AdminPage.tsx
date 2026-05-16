import { useEffect, useState } from 'react';
import { adminApi, TableInfo } from '../lib/api';
import { Database, Play, ChevronRight } from 'lucide-react';

export default function AdminPage() {
  const [tables, setTables]       = useState<TableInfo[]>([]);
  const [dbInfo, setDbInfo]       = useState<{ pg_version: string; db_size: string; schemas: string[] } | null>(null);
  const [sql, setSql]             = useState('SELECT * FROM analytics.titanic_survival_summary;');
  const [results, setResults]     = useState<Record<string, unknown>[] | null>(null);
  const [queryError, setQueryError] = useState('');
  const [running, setRunning]     = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [columns, setColumns]     = useState<Record<string, string>[]>([]);

  useEffect(() => {
    Promise.all([adminApi.tables(), adminApi.dbInfo()])
      .then(([t, d]) => { setTables(t.data); setDbInfo(d); })
      .catch(console.error);
  }, []);

  const runQuery = async () => {
    setRunning(true); setQueryError(''); setResults(null);
    try {
      const res = await adminApi.runQuery(sql);
      setResults(res.data);
    } catch (e: any) { setQueryError(e.message); }
    finally { setRunning(false); }
  };

  const selectTable = async (t: TableInfo) => {
    setSelectedTable(t);
    setSql(`SELECT * FROM ${t.schema_name}.${t.table_name} LIMIT 20;`);
    try {
      const res = await adminApi.columns(t.schema_name, t.table_name);
      setColumns(res.data);
    } catch { setColumns([]); }
  };

  const resultCols = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Admin Panel</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {dbInfo && `PostgreSQL ${dbInfo.pg_version} · ${dbInfo.db_size} · schemas: ${dbInfo.schemas.join(', ')}`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Table browser */}
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={14} color="#3b82f6" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Tables &amp; Views</span>
          </div>
          {tables.map(t => (
            <div key={`${t.schema_name}.${t.table_name}`}
              onClick={() => selectTable(t)}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #1a2232',
                background: selectedTable?.table_name === t.table_name ? '#1e3a5f' : 'transparent',
                transition: 'background 0.1s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 1 }}>{t.schema_name}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>{t.table_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{Number(t.row_count).toLocaleString()} rows</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>{t.total_size}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Column inspector */}
          {selectedTable && columns.length > 0 && (
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChevronRight size={13} color="#64748b" />
                <span style={{ fontSize: 12, color: '#64748b' }}>{selectedTable.schema_name}.{selectedTable.table_name} — columns</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 14 }}>
                {columns.map((c: any) => (
                  <div key={c.column_name} style={{ background: '#0f1117', border: '1px solid #1e2a3a', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>{c.column_name}</span>
                    <span style={{ color: '#475569', marginLeft: 6 }}>{c.data_type}</span>
                    {c.is_nullable === 'YES' && <span style={{ color: '#374151', marginLeft: 6 }}>nullable</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SQL Runner */}
          <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>SQL Runner <span style={{ fontWeight: 400, color: '#475569', fontSize: 12 }}>(SELECT only)</span></span>
              <button onClick={runQuery} disabled={running}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1d4ed8', color: '#e2e8f0', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}>
                <Play size={13} /> {running ? 'Running…' : 'Run'}
              </button>
            </div>
            <textarea value={sql} onChange={e => setSql(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
              style={{ width: '100%', background: '#0f1117', border: 'none', borderBottom: '1px solid #1e2a3a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, padding: '14px 16px', resize: 'vertical', minHeight: 120, outline: 'none' }} />

            {queryError && (
              <div style={{ padding: '10px 16px', background: '#1c1012', borderBottom: '1px solid #7f1d1d', color: '#fca5a5', fontSize: 12, fontFamily: 'monospace' }}>{queryError}</div>
            )}

            {results && (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e2a3a', fontSize: 11, color: '#64748b' }}>{results.length} row{results.length !== 1 ? 's' : ''} · ⌘↵ to run</div>
                {results.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0f1117' }}>
                        {resultCols.map(c => (
                          <th key={c} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #1e2a3a', whiteSpace: 'nowrap' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1a2232', background: i % 2 === 0 ? 'transparent' : '#0f1420' }}>
                          {resultCols.map(c => (
                            <td key={c} style={{ padding: '7px 12px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{String(row[c] ?? '∅')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ padding: '20px 16px', color: '#475569', fontSize: 13 }}>No rows returned.</div>}
              </div>
            )}

            {!results && !queryError && (
              <div style={{ padding: '12px 16px', fontSize: 12, color: '#475569' }}>Click a table to pre-fill a query, then press Run or ⌘↵</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
