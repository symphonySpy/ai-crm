'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, leadService } from '@/services';
import { formatDate, formatTHB } from '@/lib/format';
import { LEAD_STAGES, PAGE_SIZE } from '@/constants';
import { useTableParams } from '@/hooks/useTableParams';
import type { Lead, Pagination, StageSummary } from '@/lib/types';
import { StageBadge, TriageBadge } from '@/components/StageBadge';

export default function LeadsPage() {
  const router = useRouter();
  const params = useTableParams();

  const [stages, setStages] = useState<StageSummary[]>([]);
  const [needsTriageCount, setNeedsTriageCount] = useState(0);

  const [rows, setRows] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  // Separate from `loading`, which flips on every filter change. This one only ever goes
  // true once, and gates the first paint: middleware.ts catches the signed-out case, but
  // a cookie that is present and no longer valid still comes back 401, and without this
  // the empty pipeline would flash before the redirect lands.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.needsLogin) {
        router.replace('/login');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      setReady(true);
    },
    [router],
  );

  useEffect(() => {
    leadService
      .summary()
      .then((d) => {
        setStages(d.stages);
        setNeedsTriageCount(d.needsTriage);
      })
      .catch(handleError);
  }, [handleError]);

  const { query, stage, triageOnly, page } = params;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    leadService
      .list({
        q: query || undefined,
        stage: stage || undefined,
        needsTriage: triageOnly ? 'true' : undefined,
        page,
        limit: PAGE_SIZE,
      })
      .then((d) => {
        if (cancelled) return;
        setRows(d.rows);
        setPagination(d.pagination);
        setError(null);
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) handleError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // A response that arrives after a newer one would otherwise overwrite it with stale
    // rows — the classic out-of-order race on a search box.
    return () => {
      cancelled = true;
    };
  }, [query, stage, triageOnly, page, handleError]);

  const pipelineValue = stages
    .filter((s) => s.stage !== 'Lost')
    .reduce((sum, s) => sum + s.value_thb, 0);

  if (!ready) {
    return (
      <main className="page">
        <p className="muted small">กำลังโหลด…</p>
      </main>
    );
  }

  return (
    <main className="page stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Pipeline</h1>
        <span className="muted small mono">
          มูลค่าที่ยังเปิดอยู่ {formatTHB(pipelineValue)} บาท
        </span>
      </div>

      <div className="summary">
        {stages.map((s) => {
          const active = stage === s.stage;
          return (
            <button
              key={s.stage}
              className="summary-tile"
              aria-pressed={active}
              onClick={() => params.setStage(active ? '' : s.stage)}
            >
              <StageBadge stage={s.stage} />
              <span className="n mono">{s.count}</span>
              <span className="muted small mono">{formatTHB(s.value_thb)} บาท</span>
            </button>
          );
        })}
      </div>

      <div className="card stack">
        <div className="row">
          <input
            type="search"
            placeholder="ค้นหาหัวข้อ ชื่อผู้ติดต่อ หรือบริษัท"
            value={params.search}
            onChange={(e) => params.setSearch(e.target.value)}
            style={{ flex: '1 1 260px' }}
            aria-label="ค้นหา"
          />
          <select
            value={stage}
            onChange={(e) => params.setStage(e.target.value)}
            aria-label="กรองตามขั้น"
          >
            <option value="">ทุกขั้น</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="row small" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={triageOnly}
              onChange={(e) => params.setTriageOnly(e.target.checked)}
            />
            เฉพาะที่รอคัดกรอง ({needsTriageCount})
          </label>
        </div>

        {error && (
          <p className="notice notice-error small" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>หัวข้อ</th>
                <th>ผู้ติดต่อ</th>
                <th>ขั้น</th>
                <th className="num">มูลค่า</th>
                <th>เจ้าของ</th>
                <th>ติดต่อล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/leads/${lead.id}`}>{lead.title}</Link>
                    {lead.source === 'line' && <span className="muted small"> · LINE</span>}
                  </td>
                  <td>
                    {lead.contact?.name ?? '—'}
                    {lead.company && <div className="muted small">{lead.company.name}</div>}
                  </td>
                  <td>
                    <StageBadge stage={lead.stage} />
                    {lead.needs_triage && (
                      <>
                        {' '}
                        <TriageBadge />
                      </>
                    )}
                  </td>
                  <td className="num">{formatTHB(lead.value_thb)}</td>
                  <td>{lead.owner?.name ?? <span className="muted">ยังไม่มี</span>}</td>
                  <td className="small">{formatDate(lead.last_contact_at)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                    ไม่พบ lead ที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small mono">
              หน้า {pagination.page} จาก {pagination.pages} · ทั้งหมด {pagination.total} รายการ
            </span>
            <span className="row" style={{ gap: 6 }}>
              <button
                className="btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => params.setPage((p) => p - 1)}
              >
                ก่อนหน้า
              </button>
              <button
                className="btn-sm"
                disabled={page >= pagination.pages || loading}
                onClick={() => params.setPage((p) => p + 1)}
              >
                ถัดไป
              </button>
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
