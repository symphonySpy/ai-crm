'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError, formatDateTime, formatTHB } from '@/lib/api';
import type { Activity, AiSuggestion, Lead, Message, User } from '@/lib/types';
import { StageBadge, TriageBadge } from '@/components/StageBadge';
import { TopBar } from '@/components/TopBar';

const STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'] as const;

const ACTIVITY_LABEL: Record<string, string> = {
  lead_created: 'สร้าง lead',
  stage_changed: 'เปลี่ยนขั้น',
  owner_changed: 'เปลี่ยนเจ้าของ',
  note_added: 'เพิ่มบันทึก',
  message_received: 'ได้รับข้อความ',
  message_sent: 'ส่งข้อความ',
  ai_suggestion_requested: 'ขอคำแนะนำจาก AI',
  ai_suggestion_approved: 'อนุมัติคำแนะนำ',
  ai_suggestion_rejected: 'ปฏิเสธคำแนะนำ',
  contact_updated: 'แก้ไขผู้ติดต่อ',
};

const CRITERION_LABEL: Record<string, string> = {
  recency: 'ความสดของการติดต่อ',
  engagement: 'การตอบโต้',
  budget_signal: 'สัญญาณงบประมาณ',
  stage_progress: 'ความคืบหน้า',
  deal_value: 'มูลค่าดีล',
};

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [replySuggestionId, setReplySuggestionId] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.needsLogin) {
        router.replace('/login');
        return;
      }
      setNotice(null);
      setError(err instanceof ApiError ? err.message : 'ทำรายการไม่สำเร็จ');
    },
    [router],
  );

  const load = useCallback(async () => {
    try {
      const d = await api.lead(leadId);
      setLead(d.lead);
      setActivities(d.activities);
      setMessages(d.messages);
      setSuggestions(d.aiSuggestions);
      setError(null);
    } catch (err) {
      handleError(err);
    }
  }, [leadId, handleError]);

  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(handleError);
    load();
  }, [load, handleError]);

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    try {
      const message = await fn();
      await load();
      if (message) setNotice(message);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  }

  if (!lead) {
    return (
      <div className="shell">
        <TopBar user={user} />
        <main className="page">
          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted">กำลังโหลด…</p>
          )}
        </main>
      </div>
    );
  }

  const latest = suggestions[0];
  const canMessage = Boolean(lead.contact?.line_user_id);
  const isOwner = user?.role === 'manager' || lead.owner?.id === user?.id;

  return (
    <div className="shell">
      <TopBar user={user} />

      <main className="page stack" style={{ gap: 16 }}>
        <div>
          <Link href="/leads" className="small">
            ← กลับไปรายการ
          </Link>
        </div>

        {error && (
          <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        {notice && (
          <p className="notice small" role="status" style={{ margin: 0 }}>
            {notice}
          </p>
        )}

        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h1>{lead.title}</h1>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                {lead.contact?.name ?? 'ไม่ทราบผู้ติดต่อ'}
                {lead.company ? ` · ${lead.company.name}` : ''}
                {lead.source === 'line' ? ' · มาจาก LINE' : ''}
              </p>
            </div>
            <div className="row">
              <StageBadge stage={lead.stage} />
              {lead.needs_triage && <TriageBadge />}
            </div>
          </div>

          <div className="row" style={{ gap: 24 }}>
            <span className="small">
              <span className="muted">มูลค่า</span>{' '}
              <strong className="mono">{formatTHB(lead.value_thb)} บาท</strong>
            </span>
            <span className="small">
              <span className="muted">เจ้าของ</span> {lead.owner?.name ?? 'ยังไม่มี'}
            </span>
            <span className="small">
              <span className="muted">ติดต่อล่าสุด</span> {formatDateTime(lead.last_contact_at)}
            </span>
          </div>

          <div className="row">
            <label className="row small" style={{ gap: 6 }}>
              เปลี่ยนขั้น
              <select
                value={lead.stage}
                disabled={busy === 'stage'}
                onChange={(e) =>
                  run('stage', async () => {
                    await api.changeStage(lead.id, e.target.value);
                    return `เปลี่ยนขั้นเป็น ${e.target.value} แล้ว`;
                  })
                }
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            {lead.needs_triage && (
              <button
                className="btn-sm"
                disabled={busy === 'claim'}
                onClick={() =>
                  run('claim', async () => {
                    await api.assignOwner(lead.id, user!.id);
                    return 'รับ lead นี้เป็นของคุณแล้ว';
                  })
                }
              >
                รับ lead นี้
              </button>
            )}
          </div>
        </div>

        <div className="grid-2">
          {/* ---------------- conversation + AI ---------------- */}
          <div className="stack">
            <section className="card stack">
              <h2>บทสนทนา</h2>

              {messages.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  ยังไม่มีข้อความ
                </p>
              ) : (
                <div className="thread">
                  {messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.direction}`}>
                      {m.body ?? <em className="muted">[{m.content_type}]</em>}
                      <div className="meta">
                        {formatDateTime(m.createdAt)}
                        {m.direction === 'outbound' && ` · ${m.send_status}`}
                        {m.send_status === 'failed' && m.error_detail && (
                          <span className="notice-error"> · {m.error_detail.slice(0, 60)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canMessage ? (
                <div className="stack" style={{ gap: 6 }}>
                  <textarea
                    value={reply}
                    placeholder="พิมพ์ข้อความตอบกลับ หรือกดใช้ร่างจาก AI ด้านล่าง"
                    onChange={(e) => {
                      setReply(e.target.value);
                      // Once the text is edited by hand it is no longer the model's
                      // draft, so approving it must not close that suggestion.
                      setReplySuggestionId(null);
                    }}
                  />
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted small">
                      {replySuggestionId
                        ? 'การส่งจะนับเป็นการอนุมัติร่างของ AI'
                        : 'ข้อความนี้เขียนเอง'}
                    </span>
                    <button
                      className="btn-primary"
                      disabled={!reply.trim() || busy === 'send' || !isOwner}
                      title={isOwner ? undefined : 'ส่งได้เฉพาะเจ้าของ lead'}
                      onClick={() =>
                        run('send', async () => {
                          const text = reply.trim();
                          await api.sendMessage(lead.id, text, replySuggestionId ?? undefined);
                          setReply('');
                          setReplySuggestionId(null);
                          return 'ส่งข้อความแล้ว';
                        })
                      }
                    >
                      {busy === 'send' ? 'กำลังส่ง…' : 'อนุมัติและส่ง'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  lead นี้ยังไม่มีผู้ติดต่อทาง LINE จึงตอบกลับไม่ได้
                </p>
              )}
            </section>

            <section className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>ผู้ช่วย AI</h2>
                <button
                  className="btn-sm"
                  disabled={busy === 'ai'}
                  onClick={() =>
                    run('ai', async () => {
                      const d = await api.generateSuggestion(lead.id);
                      return d.suggestion.degraded
                        ? 'สร้างในโหมดสำรอง — ไม่มีร่างข้อความ'
                        : 'ได้คำแนะนำใหม่แล้ว';
                    })
                  }
                >
                  {busy === 'ai' ? 'กำลังคิด…' : 'ขอคำแนะนำ'}
                </button>
              </div>

              {!latest ? (
                <p className="muted small" style={{ margin: 0 }}>
                  ยังไม่เคยขอคำแนะนำสำหรับ lead นี้
                </p>
              ) : (
                <div className="stack">
                  {latest.degraded && (
                    <p className="notice notice-warn small" style={{ margin: 0 }}>
                      โหมดสำรอง — ไม่ได้ใช้โมเดลภาษา คะแนนคำนวณจากกฎในระบบ และไม่มีร่างข้อความให้
                    </p>
                  )}

                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small muted">คะแนนคุณภาพ</span>
                      <strong className="mono">{latest.payload.score}/100</strong>
                    </div>
                    <div className="score-bar">
                      <span style={{ width: `${latest.payload.score}%` }} />
                    </div>
                  </div>

                  <ul className="stack small" style={{ gap: 4, margin: 0, paddingLeft: 18 }}>
                    {latest.payload.score_reasons.map((r) => (
                      <li key={r.criterion}>
                        <strong>{CRITERION_LABEL[r.criterion] ?? r.criterion}</strong>{' '}
                        <span className="mono">{r.points}/20</span>
                        <span className="muted"> — {r.note}</span>
                      </li>
                    ))}
                  </ul>

                  <div>
                    <h3>สรุป</h3>
                    <p className="small" style={{ margin: '2px 0 0' }}>
                      {latest.payload.summary}
                    </p>
                  </div>

                  <div>
                    <h3>ควรทำต่อ</h3>
                    <p className="small" style={{ margin: '2px 0 0' }}>
                      {latest.payload.next_best_action}
                    </p>
                  </div>

                  {latest.payload.draft_line_reply && (
                    <div className="stack" style={{ gap: 6 }}>
                      <h3>ร่างข้อความ</h3>
                      <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {latest.payload.draft_line_reply}
                      </p>

                      {latest.status === 'proposed' ? (
                        <div className="row">
                          <button
                            className="btn-sm"
                            disabled={!canMessage}
                            onClick={() => {
                              setReply(latest.payload.draft_line_reply ?? '');
                              setReplySuggestionId(latest.id);
                              setNotice('ใส่ร่างในช่องข้อความแล้ว ตรวจก่อนกดส่ง');
                            }}
                          >
                            ใช้ร่างนี้
                          </button>
                          <button
                            className="btn-sm btn-danger"
                            disabled={busy === 'reject'}
                            onClick={() =>
                              run('reject', async () => {
                                await api.rejectSuggestion(latest.id);
                                return 'ปฏิเสธร่างแล้ว ไม่มีข้อความถูกส่ง';
                              })
                            }
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      ) : (
                        <p className="muted small" style={{ margin: 0 }}>
                          ร่างนี้ถูก{latest.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}แล้วเมื่อ{' '}
                          {formatDateTime(latest.decided_at)}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="muted small" style={{ margin: 0 }}>
                    สร้างเมื่อ {formatDateTime(latest.createdAt)}
                    {latest.model ? ` · ${latest.model}` : ''} · สถานะ {latest.status}
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* ---------------- timeline ---------------- */}
          <section className="card stack">
            <h2>Timeline</h2>

            <div className="stack" style={{ gap: 6 }}>
              <textarea
                value={note}
                placeholder="บันทึกภายใน เช่น สรุปที่คุยทางโทรศัพท์"
                style={{ minHeight: 64 }}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn-sm"
                style={{ alignSelf: 'flex-end' }}
                disabled={!note.trim() || busy === 'note'}
                onClick={() =>
                  run('note', async () => {
                    await api.addNote(lead.id, note.trim());
                    setNote('');
                    return 'เพิ่มบันทึกแล้ว';
                  })
                }
              >
                เพิ่มบันทึก
              </button>
            </div>

            <ul className="timeline">
              {activities.map((a) => (
                <li key={a.id}>
                  <span className={`dot ${a.actor ? '' : 'system'}`} />
                  <div>
                    <div className="small">
                      <strong>{ACTIVITY_LABEL[a.type] ?? a.type}</strong>
                      {a.from_stage && a.to_stage && (
                        <span className="muted">
                          {' '}
                          {a.from_stage} → {a.to_stage}
                        </span>
                      )}
                    </div>
                    {a.note && (
                      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                        {a.note}
                      </div>
                    )}
                    <div className="muted small">
                      {formatDateTime(a.occurred_at)} · {a.actor?.name ?? 'ระบบ'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
