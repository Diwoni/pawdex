import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AttentionEvent, PawdexEvent, PawdexSession, SessionStatus } from "@pawdex/protocol";
import {
  connectEvents,
  createSession,
  enablePush,
  forkSession,
  getConfig,
  getToken,
  interruptSession,
  listSessions,
  saveToken,
  sendMessage,
  type PublicConfig,
} from "./api.js";

const statusCopy: Record<SessionStatus, { cat: string; label: string; hint: string }> = {
  starting: { cat: "🐱", label: "기지개 켜는 중", hint: "Codex를 깨우고 있어요" },
  idle: { cat: "😺", label: "할 일 기다리는 중", hint: "새 일을 맡겨 주세요" },
  running: { cat: "🐈‍⬛", label: "열심히 코딩 중", hint: "키보드를 사냥하고 있어요" },
  needs_input: { cat: "🐾", label: "집사 필요", hint: "확인이나 답변이 필요해요" },
  completed: { cat: "😽", label: "다 했어요", hint: "다음 일을 받을 수 있어요" },
  failed: { cat: "🙀", label: "곤란해요", hint: "오류를 확인해 주세요" },
  stopped: { cat: "😴", label: "쉬는 중", hint: "새 일을 주면 다시 일어나요" },
};

export function App() {
  const [sessions, setSessions] = useState<PawdexSession[]>([]);
  const [config, setConfig] = useState<PublicConfig>();
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState(getToken());
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem("pawdex-sound") === "on");
  const [selectedId, setSelectedId] = useState("");
  const soundRef = useRef(soundEnabled);
  const sessionsRef = useRef(sessions);

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => {
    void getConfig().then(setConfig).catch(showError);
    void listSessions().then(setSessions).catch(showError);
    return connectEvents(handleEvent, setOnline);
  }, [token]);

  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].id);
  }, [selectedId, sessions]);

  const counts = useMemo(() => ({
    running: sessions.filter((session) => session.status === "running").length,
    attention: sessions.filter((session) => session.status === "needs_input" || session.status === "failed").length,
    ready: sessions.filter((session) => session.status === "completed").length,
  }), [sessions]);

  function handleEvent(event: PawdexEvent): void {
    if (event.type === "snapshot") {
      setSessions(event.sessions);
      return;
    }
    upsert(event.session);
    if (event.type === "attention" && soundRef.current) announce(event);
  }

  function upsert(session: PawdexSession): void {
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
  }

  function showError(cause: unknown): void {
    setError(cause instanceof Error ? cause.message : String(cause));
  }

  function persistToken(event: FormEvent): void {
    event.preventDefault();
    saveToken(token.trim());
    location.reload();
  }

  function toggleSound(): void {
    const enabled = !soundEnabled;
    setSoundEnabled(enabled);
    localStorage.setItem("pawdex-sound", enabled ? "on" : "off");
    if (enabled) playMeow();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/pawdex.svg" alt="" />
          <div>
            <h1>Pawdex</h1>
            <p>여러 Codex 고양이를 한 번에 돌봐요.</p>
          </div>
        </div>
        <div className={`connection ${online ? "online" : "offline"}`}>
          <span /> {online ? "연결됨" : "재연결 중"}
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">LOCAL-FIRST CODEX HARNESS</span>
          <h2>일은 고양이들에게.<br />완료 소식은 침대까지.</h2>
          <p>세션을 병렬로 실행하고, 도움이 필요하거나 끝났을 때 냐옹 알림을 받아보세요.</p>
        </div>
        <div className="hero-cat" aria-hidden="true">{counts.attention ? "🐾" : counts.running ? "🐈‍⬛" : "😺"}</div>
      </section>

      <section className="metrics" aria-label="세션 요약">
        <Metric value={counts.running} label="코딩 중" color="mint" />
        <Metric value={counts.attention} label="집사 필요" color="coral" />
        <Metric value={counts.ready} label="완료" color="gold" />
        <Metric value={sessions.length} label="전체 고양이" color="cream" />
      </section>

      {error && <div className="error-banner"><span>🙀 {error}</span><button onClick={() => setError("")}>닫기</button></div>}

      {config?.authRequired && !getToken() && (
        <form className="token-panel" onSubmit={persistToken}>
          <div><strong>연결 암호가 필요해요</strong><small>Mac daemon의 PAWDEX_AUTH_TOKEN을 입력하세요.</small></div>
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="긴 인증 토큰" />
          <button type="submit">연결</button>
        </form>
      )}

      <section className="toolbar">
        <VoiceControl sessions={sessions} selectedId={selectedId} setSelectedId={setSelectedId} onSent={upsert} onError={showError} />
        <div className="toolbar-actions">
          <button className="soft-button" onClick={toggleSound}>{soundEnabled ? "🔊 냐옹 켜짐" : "🔇 냐옹 켜기"}</button>
          <button
            className="soft-button"
            disabled={!config?.vapidPublicKey}
            onClick={() => config?.vapidPublicKey && void enablePush(config.vapidPublicKey).catch(showError)}
            title={config?.vapidPublicKey ? "이 기기에 푸시 알림을 등록합니다" : "VAPID 설정이 필요합니다"}
          >🔔 푸시 등록</button>
        </div>
      </section>

      <NewSession onCreated={upsert} onError={showError} />

      <section className="session-section">
        <div className="section-title"><h3>우리 집 고양이들</h3><span>{sessions.length} sessions</span></div>
        {sessions.length === 0 ? (
          <div className="empty-state"><div>🐈</div><h3>아직 고양이가 없어요</h3><p>첫 Codex 세션을 만들어 일을 맡겨보세요.</p></div>
        ) : (
          <div className="session-grid">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} onChange={upsert} onSelect={setSelectedId} onError={showError} />
            ))}
          </div>
        )}
      </section>
      <footer>Open source · Local first · No raw shell over the wire 🐾</footer>
    </main>
  );
}

function Metric({ value, label, color }: { value: number; label: string; color: string }) {
  return <div className={`metric ${color}`}><strong>{value}</strong><span>{label}</span></div>;
}

function NewSession({ onCreated, onError }: { onCreated: (session: PawdexSession) => void; onError: (error: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", cwd: "", prompt: "", model: "" });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const session = await createSession({
        cwd: form.cwd,
        ...(form.name ? { name: form.name } : {}),
        ...(form.prompt ? { prompt: form.prompt } : {}),
        ...(form.model ? { model: form.model } : {}),
      });
      onCreated(session);
      setForm({ name: "", cwd: "", prompt: "", model: "" });
      setOpen(false);
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return <button className="new-session" onClick={() => setOpen(true)}><span>＋</span> 새 고양이에게 일 맡기기</button>;
  return (
    <form className="create-panel" onSubmit={(event) => void submit(event)}>
      <div className="panel-heading"><div><strong>새 Codex 고양이</strong><small>각 고양이는 독립된 thread로 동시에 일합니다.</small></div><button type="button" onClick={() => setOpen(false)}>✕</button></div>
      <div className="form-row">
        <label>이름<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="자동: 치즈, 보리…" /></label>
        <label>작업 폴더<input required value={form.cwd} onChange={(event) => setForm({ ...form, cwd: event.target.value })} placeholder="/Users/me/project" /></label>
        <label>모델 (선택)<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="Codex 기본값 사용" /></label>
      </div>
      <label>첫 번째 일<textarea value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} placeholder="테스트를 실행하고 실패 원인을 고쳐줘" rows={3} /></label>
      <button className="primary-button" disabled={submitting}>{submitting ? "깨우는 중…" : "일 맡기기 🐾"}</button>
    </form>
  );
}

function SessionCard({
  session,
  onChange,
  onSelect,
  onError,
}: {
  session: PawdexSession;
  onChange: (session: PawdexSession) => void;
  onSelect: (id: string) => void;
  onError: (error: unknown) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const status = statusCopy[session.status];

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      onChange(await sendMessage(session.id, message));
      setMessage("");
      onSelect(session.id);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`session-card status-${session.status}`} onClick={() => onSelect(session.id)}>
      <div className="card-head">
        <div className="cat-avatar">{status.cat}<i /></div>
        <div className="cat-title"><h4>{session.name}</h4><span>{status.label}</span></div>
        <span className="sequence">#{session.sequence}</span>
      </div>
      <p className="status-hint">{status.hint}</p>
      <div className="path" title={session.cwd}>{session.cwd}</div>
      {session.model && <div className="model">{session.model}</div>}
      {session.lastMessage && <p className="last-message">{session.lastMessage.slice(-500)}</p>}
      {session.error && <p className="session-error">{session.error}</p>}
      {session.pendingRequest && (
        <div className="approval" onClick={(event) => event.stopPropagation()}>
          <strong>{session.pendingRequest.title}</strong>
          {session.pendingRequest.detail && <code>{session.pendingRequest.detail}</code>}
          <small>기술 스파이크에서는 승인 응답이 비활성화되어 있습니다. 현재 로컬 Codex UI에서 답해주세요.</small>
        </div>
      )}
      <form className="message-box" onSubmit={(event) => void send(event)} onClick={(event) => event.stopPropagation()}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={session.status === "running" ? "진행 중 추가 지시…" : "다음 일 시키기…"} />
        <button disabled={busy || !message.trim()}>↗</button>
      </form>
      <div className="card-actions" onClick={(event) => event.stopPropagation()}>
        <button onClick={() => void forkSession(session.id).then(onChange).catch(onError)}>분신 만들기</button>
        {session.status === "running" && <button onClick={() => void interruptSession(session.id).catch(onError)}>멈추기</button>}
      </div>
    </article>
  );
}

function VoiceControl({
  sessions,
  selectedId,
  setSelectedId,
  onSent,
  onError,
}: {
  sessions: PawdexSession[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  onSent: (session: PawdexSession) => void;
  onError: (error: unknown) => void;
}) {
  const [listening, setListening] = useState(false);

  function listen(): void {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) {
      onError(new Error("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Safari에서 시도해 주세요."));
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      const target = sessions.find((session) => transcript.includes(session.name))
        ?? sessions.find((session) => session.id === selectedId);
      if (!target) {
        onError(new Error("먼저 지시를 보낼 고양이를 선택해 주세요."));
        return;
      }
      void sendMessage(target.id, transcript).then(onSent).catch(onError);
    };
    recognition.onerror = () => { setListening(false); onError(new Error("음성을 알아듣지 못했어요.")); };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  return (
    <div className="voice-control">
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="음성 명령 대상">
        <option value="">고양이 선택</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {statusCopy[session.status].label}</option>)}
      </select>
      <button className={listening ? "listening" : ""} onClick={listen} disabled={listening || sessions.length === 0}>{listening ? "듣는 중…" : "🎙 말해서 바로 시키기"}</button>
    </div>
  );
}

function announce(event: AttentionEvent): void {
  playMeow();
  if (!("speechSynthesis" in window)) return;
  const verb = event.kind === "completed" ? "작업을 마쳤어요" : event.kind === "needs_input" ? "집사의 도움이 필요해요" : "문제가 생겼어요";
  const utterance = new SpeechSynthesisUtterance(`${event.session.name}가 ${verb}. 야옹!`);
  utterance.lang = "ko-KR";
  utterance.rate = 1.08;
  window.speechSynthesis.speak(utterance);
}

function playMeow(): void {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(620, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(930, context.currentTime + 0.12);
  oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.42);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.46);
  oscillator.addEventListener("ended", () => void context.close());
}
