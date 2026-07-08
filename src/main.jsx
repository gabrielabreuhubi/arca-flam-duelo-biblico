import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import flamLogo from "./assets/flam-logo.png";
import flamLogoWhite from "./assets/flam-logo-white.png";
import "./styles.css";

const BASE = import.meta.env.BASE_URL;

function stripBase(pathname) {
  if (BASE !== "/" && pathname.startsWith(BASE)) {
    return "/" + pathname.slice(BASE.length);
  }
  return pathname;
}

function App() {
  const [path, setPath] = useState(stripBase(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(stripBase(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (nextPath) => {
    const fullPath = BASE.replace(/\/$/, "") + nextPath;
    window.history.pushState({}, "", fullPath);
    setPath(nextPath);
  };

  return (
    <Shell path={path} navigate={navigate}>
      <Route path={path} navigate={navigate} />
    </Shell>
  );
}

function Route({ path, navigate }) {
  if (path === "/" || path === "/cadastro") return <ParticipantRegistration />;
  if (path === "/operador") return <Protected><OperatorPanel navigate={navigate} /></Protected>;
  if (path.startsWith("/duelo/")) return <Protected><DuelScreen duelId={path.split("/")[2]} navigate={navigate} /></Protected>;
  if (path.startsWith("/resultado/")) return <Protected><ResultScreen duelId={path.split("/")[2]} navigate={navigate} /></Protected>;
  if (path === "/publico") return <PublicPanel />;
  if (path === "/admin/identidade") return <Protected><BrandingAdmin navigate={navigate} /></Protected>;
  if (path === "/admin/formulario") return <Protected><FormAdmin navigate={navigate} /></Protected>;
  if (path === "/admin/perguntas") return <Protected><QuestionsAdmin navigate={navigate} /></Protected>;
  if (path === "/admin/leads") return <Protected><LeadsAdmin navigate={navigate} /></Protected>;
  return <NotFound navigate={navigate} />;
}

function Shell({ children, path, navigate }) {
  const staff = path.startsWith("/operador") || path.startsWith("/duelo") || path.startsWith("/resultado") || path.startsWith("/admin");
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <img className="brand-mark" src={flamLogo} alt="FLAM" />
          <span>
            <strong>FLAM</strong>
            <small>Duelo biblico</small>
          </span>
        </span>
        {staff && (
          <nav className="nav">
            <button className={path === "/operador" ? "active" : ""} onClick={() => navigate("/operador")}>Operador</button>
            <button className={path === "/publico" ? "active" : ""} onClick={() => navigate("/publico")}>Publico</button>
            <button className={staff && !path.startsWith("/operador") && !path.startsWith("/publico") ? "active" : ""} onClick={() => navigate("/admin/identidade")}>Admin</button>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

function Protected({ children }) {
  const [pin, setPin] = useState(localStorage.getItem("staffPin") || "");
  const [draft, setDraft] = useState(pin);

  if (pin) return children;

  return (
    <main className="center-page">
      <section className="panel auth-panel">
        <span className="icon-xl">PIN</span>
        <h1>Acesso da equipe</h1>
        <p>Use o PIN do estande para acessar operador e administracao.</p>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="PIN" type="password" />
        <button className="primary" onClick={() => {
          localStorage.setItem("staffPin", draft);
          setPin(draft);
        }}>Entrar</button>
        <small>PIN inicial da v1: 2468</small>
      </section>
    </main>
  );
}

function ParticipantRegistration() {
  const [event, setEvent] = useState(null);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({ full_name: "", phone: "" });
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api("/api/event").then((data) => {
      setEvent(data.event);
      setFields(data.fields);
    });
  }, []);

  const customFields = fields.filter((field) => !["full_name", "phone"].includes(field.field_key));

  const submit = async (eventSubmit) => {
    eventSubmit.preventDefault();
    setStatus("loading");
    try {
      const custom_answers = {};
      for (const field of customFields) custom_answers[field.field_key] = values[field.field_key] || "";
      await api("/api/participants", {
        method: "POST",
        body: { full_name: values.full_name, phone: values.phone, custom_answers }
      });
      setStatus("success");
      setValues({ full_name: "", phone: "" });
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <main className="registration-page">
      <section className="registration-hero">
        <div className="mini-brand">
          <img className="brand-mark small" src={flamLogo} alt="FLAM" />
          <span>FLAM</span>
        </div>
        <h1>Duelo biblico</h1>
        <p>{event?.welcome_text || "Entre na fila do duelo biblico."}</p>
        <div className="registration-stats">
          <span>Entre na fila do estande</span>
        </div>
      </section>

      <form className="registration-card" onSubmit={submit}>
        <div className="form-heading">
          <h2>Cadastro do participante</h2>
          <p>Preencha seus dados para entrar na lista de espera.</p>
        </div>
        <Field label="Nome completo" value={values.full_name} onChange={(value) => setValues({ ...values, full_name: value })} required />
        <Field label="Telefone" value={values.phone} onChange={(value) => setValues({ ...values, phone: value })} required type="tel" />
        {customFields.map((field) => (
          <Field
            key={field.field_key}
            label={field.label}
            value={values[field.field_key] || ""}
            onChange={(value) => setValues({ ...values, [field.field_key]: value })}
            required={field.required}
            type={field.field_type}
          />
        ))}
        <button className="primary full" type="submit">Entrar na fila</button>
        {status === "success" && <div className="success">Cadastro recebido. Aguarde ser chamado no estande.</div>}
        {status && !["success", "loading"].includes(status) && <div className="error">{status}</div>}
      </form>
    </main>
  );
}

function OperatorPanel({ navigate }) {
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");

  const load = () => api("/api/operator/queue").then((data) => setQueue(data.queue)).catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const selectedEntries = selected.map((id) => queue.find((entry) => entry.queue_entry_id === id)).filter(Boolean);

  const toggle = (entry) => {
    if (selected.includes(entry.queue_entry_id)) {
      setSelected(selected.filter((id) => id !== entry.queue_entry_id));
    } else if (selected.length < 2) {
      setSelected([...selected, entry.queue_entry_id]);
    }
  };

  const start = async () => {
    setError("");
    try {
      const data = await api("/api/operator/duels", {
        method: "POST",
        body: { queue_entry_a_id: selected[0], queue_entry_b_id: selected[1] }
      });
      navigate(`/duelo/${data.duel.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="wide-page">
      <section className="page-heading">
        <div>
          <h1>Painel do operador</h1>
          <p>Selecione duas pessoas manualmente. A ordem da fila e apenas referencia visual.</p>
        </div>
        <button className="secondary" onClick={load}><span className="icon">R</span>Atualizar</button>
      </section>

      <section className="queue-grid">
        <div className="panel queue-column">
          <h2>Fila · {queue.length} esperando</h2>
          <div className="queue-list">
            {queue.map((entry) => (
              <button
                key={entry.queue_entry_id}
                className={selected.includes(entry.queue_entry_id) ? "queue-item selected" : "queue-item"}
                onClick={() => toggle(entry)}
              >
                <span>
                  <strong>{entry.name}</strong>
                  {entry.lonely_warning && <small className="warning"><span className="icon">!</span> esperando sozinho</small>}
                </span>
                <small>{entry.waiting_minutes} min</small>
              </button>
            ))}
            {!queue.length && <div className="empty">Sem participantes na fila.</div>}
          </div>
        </div>
      </section>

      <section className="duel-dock">
        <div>
          {selectedEntries.length ? selectedEntries.map((entry) => (
            <span className="selected-pill" key={entry.queue_entry_id}>{entry.name}</span>
          )) : <span>Selecione duas pessoas para iniciar.</span>}
        </div>
        <button className="primary" disabled={selected.length !== 2} onClick={start}>Iniciar duelo</button>
      </section>
      {error && <div className="error">{error}</div>}
    </main>
  );
}

function DuelScreen({ duelId, navigate }) {
  const [duel, setDuel] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [error, setError] = useState("");

  const load = () => api(`/api/operator/duels/${duelId}`).then((data) => {
    setDuel(data.duel);
    setRounds(data.rounds);
  }).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, [duelId]);

  const judge = async (winnerId) => {
    setError("");
    try {
      const data = await api(`/api/operator/duels/${duelId}/judge`, {
        method: "POST",
        body: { winner_participant_id: winnerId }
      });
      if (data.is_complete) {
        navigate(`/resultado/${duelId}`);
      } else {
        setDuel(data.duel);
        load();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (!duel) return <Loading />;
  const options = duel.current_question.options?.length ? duel.current_question.options : [duel.current_question.answer];

  return (
    <main className="center-page">
      <section className="duel-card">
        <div className="scoreboard">
          <Score name={duel.participant_a.name} score={duel.score_a} />
          <div className="round-label">pergunta {Math.min(duel.current_round, 3)} de 3</div>
          <Score name={duel.participant_b.name} score={duel.score_b} />
        </div>
        <div className="question-box">
          <h1>{duel.current_question.prompt}</h1>
          <small>Resposta: {duel.current_question.answer}</small>
        </div>
        <div className="answers">
          {options.map((option, index) => (
            <div className={option === duel.current_question.answer ? "answer correct" : "answer"} key={`${option}-${index}`}>
              {option}
            </div>
          ))}
        </div>
        <div className="judge-grid">
          <button className="primary" onClick={() => judge(duel.participant_a.id)}>{duel.participant_a.name} acertou</button>
          <button className="dark" onClick={() => judge(duel.participant_b.id)}>{duel.participant_b.name} acertou</button>
        </div>
        <button className="ghost full" onClick={() => judge(null)}>Ninguem acertou - proxima pergunta</button>
        {rounds.length > 0 && <small className="muted">{rounds.length} rodada(s) julgada(s)</small>}
        {error && <div className="error">{error}</div>}
      </section>
    </main>
  );
}

function ResultScreen({ duelId, navigate }) {
  const [duel, setDuel] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/operator/duels/${duelId}`).then((data) => setDuel(data.duel)).catch((err) => setError(err.message));
  }, [duelId]);

  const finish = async () => {
    try {
      const data = await api(`/api/operator/duels/${duelId}/finish`, { method: "POST" });
      setDuel(data.duel);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!duel) return <Loading />;
  const winner = duel.score_a === duel.score_b ? null : duel.score_a > duel.score_b ? duel.participant_a : duel.participant_b;

  return (
    <main className="center-page">
      <section className="panel result-panel">
        <span className="icon-xl">1</span>
        <h1>{winner ? `${winner.name} venceu` : "Empate"}</h1>
        <div className="result-score">{duel.score_a} · {duel.score_b}</div>
        <p>{duel.participant_a.name} vs {duel.participant_b.name}</p>
        {duel.status !== "completed" ? (
          <button className="primary" onClick={finish}>Finalizar e remover da fila</button>
        ) : (
          <button className="secondary" onClick={() => navigate("/operador")}><span className="icon">B</span>Voltar para fila</button>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </main>
  );
}

function PublicPanel() {
  const [status, setStatus] = useState(null);

  const load = () => api("/api/public/status").then(setStatus);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const duel = status?.current_duel;
  return (
    <main className="public-screen">
      <section className="public-inner">
        <div className="public-brand">
          <img className="brand-mark" src={flamLogoWhite} alt="FLAM" />
          <strong>Duelo biblico · FLAM</strong>
        </div>
        <div className="public-duel">
          <small>Duelo agora</small>
          {duel ? (
            <h1>{duel.participant_a_name} <span>vs</span> {duel.participant_b_name}</h1>
          ) : (
            <>
              <h1>Aguardando proximo duelo</h1>
              <p>escaneie o QR code no estande para entrar</p>
            </>
          )}
        </div>
        <div className="public-counts">
          <div>
            <strong>{status?.waiting_count || 0}</strong>
            <span>aguardando</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandingAdmin({ navigate }) {
  const [branding, setBranding] = useState({ logo_url: "", accent_color: "#E2712A", welcome_text: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/api/admin/branding").then((data) => setBranding(data.branding));
  }, []);

  const save = async () => {
    const data = await api("/api/admin/branding", { method: "PUT", body: branding });
    setBranding(data.branding);
    setSaved(true);
  };

  return (
    <AdminLayout active="identidade" navigate={navigate}>
      <section className="panel">
        <StepLabel step="1 de 3" title="Identidade visual" />
        <div className="two-col">
          <label className="upload-box">
            <span className="icon-xl">Logo</span>
            <span>URL do logo PNG ou SVG</span>
            <input value={branding.logo_url || ""} onChange={(event) => setBranding({ ...branding, logo_url: event.target.value })} placeholder="https://..." />
          </label>
          <div>
            <label>Cor de destaque</label>
            <input type="color" value={branding.accent_color || "#E2712A"} onChange={(event) => setBranding({ ...branding, accent_color: event.target.value })} />
          </div>
        </div>
        <label>Texto de boas-vindas</label>
        <textarea value={branding.welcome_text || ""} onChange={(event) => setBranding({ ...branding, welcome_text: event.target.value })} />
        <button className="primary" onClick={save}><span className="icon">OK</span>Salvar</button>
        {saved && <div className="success">Identidade atualizada.</div>}
      </section>
    </AdminLayout>
  );
}

function FormAdmin({ navigate }) {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    api("/api/admin/registration-fields").then((data) => setFields(data.fields));
  }, []);

  const update = (id, patch) => setFields(fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  const add = () => setFields([...fields, {
    id: `local_${Date.now()}`,
    field_key: `campo_${fields.length + 1}`,
    label: "Novo campo",
    field_type: "text",
    required: false,
    enabled: true,
    sort_order: (fields.length + 1) * 10
  }]);
  const save = async () => {
    const data = await api("/api/admin/registration-fields", { method: "PUT", body: { fields } });
    setFields(data.fields);
  };

  return (
    <AdminLayout active="formulario" navigate={navigate}>
      <section className="panel">
        <StepLabel step="2 de 3" title="Formulario de cadastro" />
        <div className="field-list">
          {fields.map((field) => (
            <div className="field-row" key={field.id}>
              <input value={field.label} onChange={(event) => update(field.id, { label: event.target.value })} />
              <select value={field.field_type} onChange={(event) => update(field.id, { field_type: event.target.value })}>
                <option value="text">Texto</option>
                <option value="tel">Telefone</option>
                <option value="email">Email</option>
              </select>
              <label className="checkline"><input type="checkbox" checked={field.required} onChange={(event) => update(field.id, { required: event.target.checked })} /> Obrigatorio</label>
              <label className="checkline"><input type="checkbox" checked={field.enabled} onChange={(event) => update(field.id, { enabled: event.target.checked })} /> Ativo</label>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="secondary" onClick={add}><span className="icon">+</span>Adicionar campo</button>
          <button className="primary" onClick={save}><span className="icon">OK</span>Salvar formulario</button>
        </div>
      </section>
    </AdminLayout>
  );
}

function QuestionsAdmin({ navigate }) {
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState({ prompt: "", answer: "", options: "" });
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const load = () => api("/api/admin/questions").then((data) => setQuestions(data.questions));
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const registrationUrl = `${window.location.origin}${BASE}cadastro`;
    QRCode.toDataURL(registrationUrl, { width: 320, margin: 1 }).then(setQrDataUrl);
  }, []);

  const create = async () => {
    await api("/api/admin/questions", {
      method: "POST",
      body: { prompt: form.prompt, answer: form.answer, options: form.options }
    });
    setForm({ prompt: "", answer: "", options: "" });
    load();
  };

  const importNow = async () => {
    const data = await api("/api/admin/questions/import", { method: "POST", rawBody: importText, contentType: "text/plain" });
    setMessage(`${data.imported} pergunta(s) importada(s), ${data.skipped} ignorada(s).`);
    setImportText("");
    load();
  };

  return (
    <AdminLayout active="perguntas" navigate={navigate}>
      <section className="panel">
        <StepLabel step="3 de 3" title="Perguntas, formato e QR code" />
        <div className="format-grid">
          <Metric label="com alternativa" value="2" />
          <Metric label="sem alternativa" value="1" />
          <Metric label="pontos p/ vencer" value="2" />
        </div>
        <div className="question-form">
          <input placeholder="Pergunta" value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} />
          <input placeholder="Resposta correta" value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} />
          <input placeholder="Alternativas separadas por ; ou |" value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} />
          <button className="primary" onClick={create}><span className="icon">+</span>Adicionar pergunta</button>
        </div>
        <div className="question-list">
          {questions.map((question) => (
            <div className={question.used_count >= 20 ? "question-row hot" : "question-row"} key={question.id}>
              <span>
                {question.difficulty === "hard" && <small className="error"> dificil </small>}
                {question.prompt}
              </span>
              <small>usada {question.used_count}x</small>
            </div>
          ))}
          {!questions.length && <div className="empty">Espaco reservado para as perguntas.</div>}
        </div>
        <textarea className="import-box" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='Cole CSV ou JSON depois. Ex.: prompt,answer,options' />
        <button className="secondary" onClick={importNow}><span className="icon">UP</span>Importar CSV/JSON</button>
        {message && <div className="success">{message}</div>}
        <div className="qr-panel">
          {qrDataUrl ? <img className="qr-mark" src={qrDataUrl} alt="QR code do cadastro" /> : <div className="qr-mark">QR</div>}
          <div>
            <h3>QR code do evento</h3>
            <p>Fixo para todo o Pomar 2026. Aponte para a tela de cadastro.</p>
            {qrDataUrl && (
              <a className="dark" href={qrDataUrl} download="qr-cadastro-flam.png">
                <span className="icon">DL</span>Baixar para impressao
              </a>
            )}
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}

function AdminLayout({ active, navigate, children }) {
  return (
    <main className="wide-page">
      <section className="admin-tabs">
        <a className={active === "identidade" ? "active" : ""} onClick={() => navigate("/admin/identidade")}>Identidade</a>
        <a className={active === "formulario" ? "active" : ""} onClick={() => navigate("/admin/formulario")}>Formulario</a>
        <a className={active === "perguntas" ? "active" : ""} onClick={() => navigate("/admin/perguntas")}>Perguntas + QR</a>
        <a className={active === "leads" ? "active" : ""} onClick={() => navigate("/admin/leads")}>Leads</a>
      </section>
      {children}
    </main>
  );
}

function LeadsAdmin({ navigate }) {
  const [leads, setLeads] = useState([]);
  const [fields, setFields] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/leads")
      .then((data) => {
        setLeads(data.leads);
        setFields(data.fields || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  const customFields = fields.filter((field) => !["full_name", "phone"].includes(field.field_key));

  const downloadCsv = () => {
    const columns = [
      { label: "Nome completo", get: (lead) => lead.full_name },
      { label: "Telefone", get: (lead) => lead.phone },
      ...customFields.map((field) => ({ label: field.label, get: (lead) => lead.custom_answers?.[field.field_key] || "" })),
      { label: "Cadastrado em", get: (lead) => lead.created_at },
      { label: "Resultado", get: (lead) => lead.result },
      { label: "Vitorias", get: (lead) => lead.wins },
      { label: "Derrotas", get: (lead) => lead.losses }
    ];

    const escape = (value) => {
      const text = String(value ?? "");
      return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const rows = [columns.map((col) => col.label), ...leads.map((lead) => columns.map((col) => escape(col.get(lead))))];
    const csv = "﻿" + rows.map((row) => row.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads-flam.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout active="leads" navigate={navigate}>
      <section className="panel">
        <div className="page-heading">
          <div>
            <StepLabel step="leads" title="Participantes e resultados" />
          </div>
          <button className="secondary" onClick={downloadCsv} disabled={!leads.length}>
            <span className="icon">DL</span>Baixar Excel (CSV)
          </button>
        </div>
        <div className="question-list">
          {leads.map((lead) => (
            <div className="question-row" key={lead.id}>
              <span>
                <strong>{lead.full_name}</strong> · {lead.phone}
                <small className="muted"> · cadastrado em {lead.created_at}</small>
              </span>
              <small className={lead.result === "Venceu" ? "success" : lead.result === "Perdeu" ? "error" : ""}>{lead.result}</small>
            </div>
          ))}
          {!leads.length && <div className="empty">Nenhum participante cadastrado ainda.</div>}
        </div>
        {error && <div className="error">{error}</div>}
      </section>
    </AdminLayout>
  );
}

function Field({ label, value, onChange, required, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} type={type} />
    </label>
  );
}

function StepLabel({ step, title }) {
  return (
    <>
      <small className="step">Configuracao · passo {step}</small>
      <h1>{title}</h1>
    </>
  );
}

function Score({ name, score }) {
  return (
    <div className="score">
      <small>{name}</small>
      <strong>{score}</strong>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Loading() {
  return <main className="center-page"><div className="panel">Carregando...</div></main>;
}

function NotFound({ navigate }) {
  return (
    <main className="center-page">
      <section className="panel">
        <span className="icon-xl">404</span>
        <h1>Tela nao encontrada</h1>
        <button className="primary" onClick={() => navigate("/cadastro")}>Ir para cadastro</button>
      </section>
    </main>
  );
}

async function api(path, options = {}) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const headers = {};
  const pin = localStorage.getItem("staffPin");
  if (pin) headers["x-staff-pin"] = pin;
  if (options.rawBody === undefined) headers["content-type"] = options.contentType || "application/json";
  else if (options.contentType) headers["content-type"] = options.contentType;

  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.rawBody ?? (options.body ? JSON.stringify(options.body) : undefined)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na API");
  return data;
}

createRoot(document.getElementById("root")).render(<App />);
