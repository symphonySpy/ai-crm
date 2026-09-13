'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError, aiService, leadService, messageService } from '@/services';
import { formatDateTime, formatTHB } from '@/lib/format';
import {
  ACTIVITY_LABELS,
  CRITERION_LABELS,
  LEAD_DETAIL_POLL_MS,
  LEAD_STAGES,
  SYSTEM_ACTOR_LABEL,
} from '@/constants';
import { useAuth } from '@/contexts/auth';
import { usePolling } from '@/hooks/usePolling';
import type { Activity, AiSuggestion, Lead, Message } from '@/lib/types';
import { StageBadge, TriageBadge } from '@/components/StageBadge';

/**
 * Combine what the screen already has with a newly fetched window, by id.
 *
 * By id so that a refresh updates a message in place — an outbound message moving from
 * pending to sent — rather than showing it twice. Ordered by (createdAt, id), the same
 * total order the API pages by, so a burst of messages in one millisecond cannot swap
 * places between refreshes.
 */
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
  );
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const leadId = params.id;

  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pagedBack = useRef(false);

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

  // Every load takes a number; only the newest one may write. Without this, a poll that
  // left before the user pressed "send" and came back after it would replace the fresh
  // conversation with the one from before the message went out — the sent message
  // would vanish for up to one interval and look like it had failed.
  const latestRequest = useRef(0);

  const load = useCallback(
    async ({ background = false } = {}) => {
      const requestId = ++latestRequest.current;
      try {
        const d = await leadService.detail(leadId);
        if (requestId !== latestRequest.current) return;
        setLead(d.lead);
        setActivities(d.activities);
        // Merged, not replaced: the response is only the newest window, and replacing
        // would throw away every older page the user has scrolled back to read.
        setMessages((prev) => mergeMessages(prev, d.messages));
        // Once the user has paged back, "is there anything older?" is answered by the
        // oldest page they fetched. The latest window would say "yes" forever.
        if (!pagedBack.current) setHasOlder(d.hasOlderMessages);
        setSuggestions(d.aiSuggestions);
        // A background refresh leaves the banner alone. Clearing it would erase the
        // answer to something the user just did — "you can only send on leads you
        // own" — ten seconds later, before they have finished reading it.
        if (!background) setError(null);
      } catch (err) {
        if (requestId !== latestRequest.current) return;
        // A dropped poll on a flaky connection is not worth a red banner; the next one
        // will try again. A 401 still matters, so that path is kept.
        if (background && !(err instanceof ApiError && err.needsLogin)) return;
        handleError(err);
      }
    },
    [leadId, handleError],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Paused while an action is running: that action reloads on its own when it finishes.
  usePolling(() => load({ background: true }), LEAD_DETAIL_POLL_MS, busy === null);

  const threadRef = useRef<HTMLDivElement>(null);
  // Whether the reader is at the bottom of the thread. A new message scrolls into view
  // only then — pulling someone down while they are reading something older is the
  // quickest way to make a chat screen feel broken.
  const pinnedToBottom = useRef(true);
  // Distance from the bottom of the thread, recorded just before older messages go in.
  // Anchoring to the bottom rather than to the old total height is what keeps it exact:
  // everything that changes size on a prepend — the inserted messages, and the "load
  // older" button flipping back from its loading label — sits above the message being
  // read, so the distance from that message to the bottom does not change.
  const distanceFromBottom = useRef<number | null>(null);

  const rememberScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // A different lead is a different conversation. The App Router can keep this
  // component mounted between /leads/a and /leads/b, so nothing carries over by accident.
  useEffect(() => {
    setMessages([]);
    setHasOlder(false);
    pagedBack.current = false;
    pinnedToBottom.current = true;
  }, [leadId]);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    if (distanceFromBottom.current !== null) {
      // Older messages went in above: keep the message the reader was looking at under
      // their eyes.
      el.scrollTop = el.scrollHeight - distanceFromBottom.current;
      distanceFromBottom.current = null;
    } else if (pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const d = await messageService.older(leadId, oldest.id);
      pagedBack.current = true;
      const el = threadRef.current;
      distanceFromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
      setMessages((prev) => mergeMessages(prev, d.rows));
      setHasOlder(d.hasOlder);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingOlder(false);
    }
  };

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
      <main className="page">
        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">กำลังโหลด…</p>
        )}
      </main>
    );
  }

  const latest = suggestions[0];
  const canMessage = Boolean(lead.contact?.line_user_id);
  const isOwner = user?.role === 'manager' || lead.owner?.id === user?.id;

  return (
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
                onChange={(e) => {
                  // Read now, not after the await. The select is controlled by
                  // lead.stage, so by the time the request returns React has reset
                  // it to the old stage, and the notice would announce the stage
                  // the lead just left.
                  const toStage = e.target.value;
                  run('stage', async () => {
                    await leadService.changeStage(lead.id, toStage);
                    return `เปลี่ยนขั้นเป็น ${toStage} แล้ว`;
                  });
                }}
              >
                {LEAD_STAGES.map((s) => (
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
                    await leadService.assignOwner(lead.id, user!.id);
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
                <div className="thread" ref={threadRef} onScroll={rememberScroll}>
                  {hasOlder && (
                    <button
                      className="btn-sm"
                      style={{ alignSelf: 'center' }}
                      disabled={loadingOlder}
                      onClick={loadOlder}
                    >
                      {loadingOlder ? 'กำลังโหลด…' : 'โหลดข้อความก่อนหน้า'}
                    </button>
                  )}
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
                          await messageService.send(lead.id, text, replySuggestionId ?? undefined);
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
                      const d = await aiService.generate(lead.id);
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
                        <strong>{CRITERION_LABELS[r.criterion] ?? r.criterion}</strong>{' '}
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
                                await aiService.reject(latest.id);
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
                    await leadService.addNote(lead.id, note.trim());
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
                      <strong>{ACTIVITY_LABELS[a.type] ?? a.type}</strong>
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
                      {formatDateTime(a.occurred_at)} · {a.actor?.name ?? SYSTEM_ACTOR_LABEL}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
    </main>
  );
}
