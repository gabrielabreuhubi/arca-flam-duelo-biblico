import {
  isDuelReadyToFinish,
  operatorParticipantName,
  publicParticipantName,
  winnerIdForDuel
} from "./domain.js";

const EVENT_ID = "event_flam_pomar_2026";
const DEFAULT_PIN = "2468";
const LEVEL = "intermediate";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return withCors(await routeApi(request, env, url), request, env);
      } catch (error) {
        console.error(error);
        return withCors(json({ error: error.message || "Erro inesperado" }, error.status || 500), request, env);
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("FLAM Duelo Biblico API", { status: 200 });
  }
};

async function routeApi(request, env, url) {
  if (!env.DB) throw httpError(500, "Binding D1 env.DB nao configurado");
  await ensureSeed(env.DB);

  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "GET" && path === "/api/event") return getEvent(env.DB);
  if (method === "POST" && path === "/api/participants") return createParticipant(request, env.DB);
  if (method === "GET" && path === "/api/public/status") return publicStatus(env.DB);

  if (path.startsWith("/api/operator/") || path.startsWith("/api/admin/")) {
    await requireStaffPin(request, env.DB);
  }

  if (method === "GET" && path === "/api/operator/queue") return operatorQueue(env.DB);
  if (method === "POST" && path === "/api/operator/duels") return createDuel(request, env.DB);

  const duelMatch = path.match(/^\/api\/operator\/duels\/([^/]+)$/);
  if (duelMatch && method === "GET") return getDuel(env.DB, duelMatch[1]);

  const judgeMatch = path.match(/^\/api\/operator\/duels\/([^/]+)\/judge$/);
  if (judgeMatch && method === "POST") return judgeDuel(request, env.DB, judgeMatch[1]);

  const finishMatch = path.match(/^\/api\/operator\/duels\/([^/]+)\/finish$/);
  if (finishMatch && method === "POST") return finishDuel(env.DB, finishMatch[1]);

  if (path === "/api/admin/branding" && method === "GET") return getBranding(env.DB);
  if (path === "/api/admin/branding" && method === "PUT") return updateBranding(request, env.DB);

  if (path === "/api/admin/registration-fields" && method === "GET") return getRegistrationFields(env.DB);
  if (path === "/api/admin/registration-fields" && method === "PUT") return updateRegistrationFields(request, env.DB);

  if (path === "/api/admin/questions" && method === "GET") return getQuestions(env.DB);
  if (path === "/api/admin/questions" && method === "POST") return createQuestion(request, env.DB);
  if (path === "/api/admin/questions/import" && method === "POST") return importQuestions(request, env.DB);

  if (path === "/api/admin/leads" && method === "GET") return getLeads(env.DB);

  throw httpError(404, "Rota nao encontrada");
}

async function ensureSeed(db) {
  await db
    .prepare("INSERT OR IGNORE INTO organizations (id, name, slug) VALUES (?, ?, ?)")
    .bind("org_flam", "FLAM", "flam")
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO events (id, organization_id, name, slug, pin_code) VALUES (?, ?, ?, ?, ?)")
    .bind(EVENT_ID, "org_flam", "Pomar 2026", "flam-pomar-2026", DEFAULT_PIN)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO event_branding (event_id, logo_url, accent_color, welcome_text) VALUES (?, ?, ?, ?)")
    .bind(EVENT_ID, "", "#E2712A", "Bem-vindo ao estande da FLAM! Teste seus conhecimentos biblicos e concorra a um brinde.")
    .run();

  const fields = [
    ["field_name", "full_name", "Nome completo", "text", 1, 1, 10],
    ["field_phone", "phone", "Telefone", "tel", 1, 1, 20],
    ["field_church", "church", "Igreja que frequenta", "text", 0, 1, 30],
    ["field_theology", "theology_interest", "Ja pensou em estudar teologia?", "text", 0, 1, 40],
    ["field_source", "source", "Como conheceu a FLAM?", "text", 0, 0, 50]
  ];

  await db.batch(
    fields.map((field) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO registration_fields (id, event_id, field_key, label, field_type, required, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(field[0], EVENT_ID, field[1], field[2], field[3], field[4], field[5], field[6])
    )
  );
}

async function getEvent(db) {
  const event = await db
    .prepare(
      `SELECT e.id, e.name, e.slug, e.pin_code, o.name AS organization_name,
        b.logo_url, b.accent_color, b.welcome_text
       FROM events e
       JOIN organizations o ON o.id = e.organization_id
       JOIN event_branding b ON b.event_id = e.id
       WHERE e.id = ?`
    )
    .bind(EVENT_ID)
    .first();
  const fields = await listRegistrationFields(db, true);
  return json({ event: sanitizeEvent(event), fields });
}

async function requireStaffPin(request, db) {
  const supplied = request.headers.get("x-staff-pin") || "";
  const event = await db.prepare("SELECT pin_code FROM events WHERE id = ?").bind(EVENT_ID).first();
  if (!supplied || supplied !== (event?.pin_code || DEFAULT_PIN)) {
    throw httpError(401, "PIN invalido");
  }
}

async function createParticipant(request, db) {
  const body = await readJson(request);
  if (!body.full_name?.trim()) throw httpError(400, "Nome completo e obrigatorio");
  if (!body.phone?.trim()) throw httpError(400, "Telefone e obrigatorio");

  const participantId = id("participant");
  const queueId = id("queue");
  const customAnswers = JSON.stringify(body.custom_answers || {});

  await db.batch([
    db
      .prepare(
        "INSERT INTO participants (id, event_id, full_name, phone, level, custom_answers_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(participantId, EVENT_ID, body.full_name.trim(), body.phone.trim(), LEVEL, customAnswers),
    db
      .prepare("INSERT INTO queue_entries (id, event_id, participant_id, level, status) VALUES (?, ?, ?, ?, 'waiting')")
      .bind(queueId, EVENT_ID, participantId, LEVEL)
  ]);

  return json({ participant_id: participantId, queue_entry_id: queueId }, 201);
}

async function operatorQueue(db) {
  const rows = await db
    .prepare(
      `SELECT q.id AS queue_entry_id, q.arrived_at, p.id AS participant_id, p.full_name, p.phone
       FROM queue_entries q
       JOIN participants p ON p.id = q.participant_id
       WHERE q.event_id = ? AND q.status = 'waiting'
       ORDER BY q.arrived_at ASC`
    )
    .bind(EVENT_ID)
    .all();

  const queue = (rows.results || []).map((row) => ({
    queue_entry_id: row.queue_entry_id,
    participant_id: row.participant_id,
    name: operatorParticipantName(row.full_name),
    full_name: row.full_name,
    phone: row.phone,
    arrived_at: row.arrived_at,
    waiting_minutes: minutesSince(row.arrived_at),
    lonely_warning: false
  }));

  if (queue.length === 1 && queue[0].waiting_minutes >= 15) {
    queue[0].lonely_warning = true;
  }

  return json({ queue });
}

async function createDuel(request, db) {
  const body = await readJson(request);
  const ids = [body.queue_entry_a_id, body.queue_entry_b_id].filter(Boolean);
  if (new Set(ids).size !== 2) throw httpError(400, "Selecione exatamente duas pessoas");

  const entries = await db
    .prepare(
      `SELECT q.id AS queue_entry_id, q.status, p.id AS participant_id, p.full_name
       FROM queue_entries q
       JOIN participants p ON p.id = q.participant_id
       WHERE q.event_id = ? AND q.id IN (?, ?)`
    )
    .bind(EVENT_ID, ids[0], ids[1])
    .all();

  if ((entries.results || []).length !== 2) throw httpError(404, "Pessoa selecionada nao encontrada na fila");
  if (entries.results.some((entry) => entry.status !== "waiting")) {
    throw httpError(409, "Uma das pessoas selecionadas ja saiu da fila");
  }

  const [a, b] = ids.map((entryId) => entries.results.find((entry) => entry.queue_entry_id === entryId));
  const question = await pickQuestion(db, LEVEL);
  const duelId = id("duel");

  await db.batch([
    db
      .prepare(
        `INSERT INTO duels (
          id, event_id, participant_a_id, participant_b_id, queue_entry_a_id, queue_entry_b_id,
          participant_a_level, participant_b_level, effective_level, current_question_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        duelId,
        EVENT_ID,
        a.participant_id,
        b.participant_id,
        a.queue_entry_id,
        b.queue_entry_id,
        LEVEL,
        LEVEL,
        LEVEL,
        question?.id || null
      ),
    db.prepare("UPDATE queue_entries SET status = 'in_duel', updated_at = datetime('now') WHERE id IN (?, ?)").bind(ids[0], ids[1])
  ]);

  if (question?.id) await recordQuestionUse(db, question.id, LEVEL);

  return getDuel(db, duelId, 201);
}

async function getDuel(db, duelId, status = 200) {
  const duel = await fetchDuel(db, duelId);
  if (!duel) throw httpError(404, "Duelo nao encontrado");
  const rounds = await db
    .prepare("SELECT * FROM duel_rounds WHERE duel_id = ? ORDER BY round_number ASC")
    .bind(duelId)
    .all();
  return json({ duel: serializeDuel(duel), rounds: rounds.results || [] }, status);
}

async function judgeDuel(request, db, duelId) {
  const body = await readJson(request);
  const duel = await fetchDuel(db, duelId);
  if (!duel) throw httpError(404, "Duelo nao encontrado");
  if (duel.status === "completed") throw httpError(409, "Duelo ja encerrado");
  if (duel.status === "ready_to_finish") throw httpError(409, "Duelo pronto para resultado");

  const winner = body.winner_participant_id || null;
  if (winner && winner !== duel.participant_a_id && winner !== duel.participant_b_id) {
    throw httpError(400, "Vencedor da rodada invalido");
  }

  const scoreA = duel.score_a + (winner === duel.participant_a_id ? 1 : 0);
  const scoreB = duel.score_b + (winner === duel.participant_b_id ? 1 : 0);
  const nextRound = duel.current_round + 1;
  const projected = { ...duel, score_a: scoreA, score_b: scoreB, current_round: nextRound };
  const complete = isDuelReadyToFinish(projected);
  const nextQuestion = complete ? null : await pickQuestion(db, duel.effective_level);
  const nextStatus = complete ? "ready_to_finish" : "active";

  await db.batch([
    db
      .prepare("INSERT INTO duel_rounds (id, duel_id, question_id, round_number, winner_participant_id) VALUES (?, ?, ?, ?, ?)")
      .bind(id("round"), duel.id, duel.current_question_id || null, duel.current_round, winner),
    db
      .prepare(
        "UPDATE duels SET score_a = ?, score_b = ?, current_round = ?, current_question_id = ?, status = ? WHERE id = ?"
      )
      .bind(scoreA, scoreB, nextRound, nextQuestion?.id || null, nextStatus, duel.id)
  ]);

  if (nextQuestion?.id) await recordQuestionUse(db, nextQuestion.id, duel.effective_level);

  const updated = await fetchDuel(db, duelId);
  return json({ duel: serializeDuel(updated), is_complete: complete });
}

async function finishDuel(db, duelId) {
  const duel = await fetchDuel(db, duelId);
  if (!duel) throw httpError(404, "Duelo nao encontrado");
  const winner = winnerIdForDuel(duel);

  await db.batch([
    db
      .prepare("UPDATE duels SET status = 'completed', winner_participant_id = ?, completed_at = datetime('now') WHERE id = ?")
      .bind(winner, duelId),
    db
      .prepare("UPDATE queue_entries SET status = 'done', updated_at = datetime('now') WHERE id IN (?, ?)")
      .bind(duel.queue_entry_a_id, duel.queue_entry_b_id)
  ]);

  return getDuel(db, duelId);
}

async function publicStatus(db) {
  const countRow = await db
    .prepare("SELECT COUNT(*) AS total FROM queue_entries WHERE event_id = ? AND status = 'waiting'")
    .bind(EVENT_ID)
    .first();

  const current = await db
    .prepare(
      `SELECT d.*, pa.full_name AS participant_a_name, pb.full_name AS participant_b_name
       FROM duels d
       JOIN participants pa ON pa.id = d.participant_a_id
       JOIN participants pb ON pb.id = d.participant_b_id
       WHERE d.event_id = ? AND d.status IN ('active', 'ready_to_finish')
       ORDER BY d.created_at DESC
       LIMIT 1`
    )
    .bind(EVENT_ID)
    .first();

  return json({
    current_duel: current
      ? {
          id: current.id,
          participant_a_name: publicParticipantName(current.participant_a_name),
          participant_b_name: publicParticipantName(current.participant_b_name),
          score_a: current.score_a,
          score_b: current.score_b
        }
      : null,
    waiting_count: countRow?.total || 0
  });
}

async function getLeads(db) {
  const rows = await db
    .prepare(
      `SELECT
        p.id, p.full_name, p.phone, p.created_at,
        COUNT(d.id) AS duel_count,
        SUM(CASE WHEN d.status = 'completed' AND d.winner_participant_id = p.id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN d.status = 'completed' AND d.winner_participant_id IS NOT NULL AND d.winner_participant_id != p.id THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN d.status IN ('active', 'ready_to_finish') THEN 1 ELSE 0 END) AS active_duels
       FROM participants p
       LEFT JOIN duels d ON d.event_id = p.event_id AND (d.participant_a_id = p.id OR d.participant_b_id = p.id)
       WHERE p.event_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    )
    .bind(EVENT_ID)
    .all();

  const leads = (rows.results || []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    created_at: row.created_at,
    wins: row.wins || 0,
    losses: row.losses || 0,
    result: resultTag(row)
  }));

  return json({ leads });
}

function resultTag(row) {
  if (row.active_duels > 0) return "Em andamento";
  if (row.wins > 0 && row.losses > 0) return "Venceu e perdeu";
  if (row.wins > 0) return "Venceu";
  if (row.losses > 0) return "Perdeu";
  if (row.duel_count > 0) return "Empate";
  return "Aguardando";
}

async function getBranding(db) {
  const branding = await db.prepare("SELECT * FROM event_branding WHERE event_id = ?").bind(EVENT_ID).first();
  return json({ branding });
}

async function updateBranding(request, db) {
  const body = await readJson(request);
  await db
    .prepare(
      "UPDATE event_branding SET logo_url = ?, accent_color = ?, welcome_text = ?, updated_at = datetime('now') WHERE event_id = ?"
    )
    .bind(body.logo_url || "", body.accent_color || "#E2712A", body.welcome_text || "", EVENT_ID)
    .run();
  return getBranding(db);
}

async function getRegistrationFields(db) {
  return json({ fields: await listRegistrationFields(db, false) });
}

async function listRegistrationFields(db, publicOnly) {
  const rows = await db
    .prepare(
      `SELECT id, field_key, label, field_type, required, enabled, sort_order
       FROM registration_fields
       WHERE event_id = ? ${publicOnly ? "AND enabled = 1" : ""}
       ORDER BY sort_order ASC`
    )
    .bind(EVENT_ID)
    .all();
  return (rows.results || []).map((row) => ({
    ...row,
    required: Boolean(row.required),
    enabled: Boolean(row.enabled)
  }));
}

async function updateRegistrationFields(request, db) {
  const body = await readJson(request);
  const fields = Array.isArray(body.fields) ? body.fields : [];
  await db.batch(
    fields.map((field, index) =>
      db
        .prepare(
          `INSERT INTO registration_fields (id, event_id, field_key, label, field_type, required, enabled, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(event_id, field_key) DO UPDATE SET
             label = excluded.label,
             field_type = excluded.field_type,
             required = excluded.required,
             enabled = excluded.enabled,
             sort_order = excluded.sort_order`
        )
        .bind(
          field.id || id("field"),
          EVENT_ID,
          safeKey(field.field_key || field.label || `field_${index + 1}`),
          field.label || "Campo personalizado",
          field.field_type || "text",
          field.required ? 1 : 0,
          field.enabled ? 1 : 0,
          Number.isFinite(field.sort_order) ? field.sort_order : (index + 1) * 10
        )
    )
  );
  return getRegistrationFields(db);
}

async function getQuestions(db) {
  const rows = await db
    .prepare(
      `SELECT q.*, COALESCE(u.used_count, 0) AS used_count, u.last_used_at
       FROM questions q
       LEFT JOIN question_usage u ON u.question_id = q.id
       WHERE q.event_id = ? AND q.level = ?
       ORDER BY COALESCE(u.used_count, 0) DESC, q.created_at DESC`
    )
    .bind(EVENT_ID, LEVEL)
    .all();

  return json({ questions: (rows.results || []).map(serializeQuestion) });
}

async function createQuestion(request, db) {
  const body = await readJson(request);
  if (!body.prompt?.trim()) throw httpError(400, "Pergunta obrigatoria");
  if (!body.answer?.trim()) throw httpError(400, "Resposta obrigatoria");

  const questionId = id("question");
  await db
    .prepare(
      "INSERT INTO questions (id, event_id, level, prompt, answer, options_json, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)"
    )
    .bind(questionId, EVENT_ID, LEVEL, body.prompt.trim(), body.answer.trim(), JSON.stringify(normalizeOptions(body.options)))
    .run();
  return json({ question_id: questionId }, 201);
}

async function importQuestions(request, db) {
  const text = await request.text();
  if (!text.trim()) return json({ imported: 0, skipped: 0 });

  let items;
  try {
    const parsed = JSON.parse(text);
    items = Array.isArray(parsed) ? parsed : flattenQuestionMap(parsed);
  } catch {
    items = parseCsvQuestions(text);
  }

  let imported = 0;
  let skipped = 0;
  const statements = [];
  for (const item of items) {
    const prompt = item.prompt || item.question || item.pergunta;
    const answer = item.answer || item.resposta;
    if (!prompt || !answer) {
      skipped += 1;
      continue;
    }
    imported += 1;
    statements.push(
      db
        .prepare("INSERT INTO questions (id, event_id, level, prompt, answer, options_json, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)")
        .bind(id("question"), EVENT_ID, LEVEL, String(prompt).trim(), String(answer).trim(), JSON.stringify(normalizeOptions(item.options || item.alternativas)))
    );
  }

  if (statements.length) await db.batch(statements);
  return json({ imported, skipped });
}

async function fetchDuel(db, duelId) {
  return db
    .prepare(
      `SELECT d.*,
        pa.full_name AS participant_a_name,
        pb.full_name AS participant_b_name,
        q.prompt AS question_prompt,
        q.answer AS question_answer,
        q.options_json AS question_options_json
       FROM duels d
       JOIN participants pa ON pa.id = d.participant_a_id
       JOIN participants pb ON pb.id = d.participant_b_id
       LEFT JOIN questions q ON q.id = d.current_question_id
       WHERE d.id = ? AND d.event_id = ?`
    )
    .bind(duelId, EVENT_ID)
    .first();
}

async function pickQuestion(db, level) {
  const { results } = await db
    .prepare(
      `SELECT q.*, COALESCE(u.used_count, 0) AS used_count
       FROM questions q
       LEFT JOIN question_usage u ON u.question_id = q.id
       WHERE q.event_id = ? AND q.level = ? AND q.enabled = 1
       ORDER BY used_count ASC, COALESCE(u.last_used_at, '1970-01-01') ASC, q.created_at ASC
       LIMIT 10`
    )
    .bind(EVENT_ID, level)
    .all();
  if (!results.length) return null;

  const leastUsedCount = results[0].used_count;
  const candidates = results.filter((row) => row.used_count === leastUsedCount);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function recordQuestionUse(db, questionId, level) {
  await db
    .prepare(
      `INSERT INTO question_usage (question_id, event_id, level, used_count, last_used_at)
       VALUES (?, ?, ?, 1, datetime('now'))
       ON CONFLICT(question_id) DO UPDATE SET
         used_count = used_count + 1,
         last_used_at = datetime('now')`
    )
    .bind(questionId, EVENT_ID, level)
    .run();
}

function serializeDuel(duel) {
  const question = duel.current_question_id
    ? {
        id: duel.current_question_id,
        prompt: duel.question_prompt,
        answer: duel.question_answer,
        options: parseJson(duel.question_options_json, [])
      }
    : {
        id: null,
        prompt: "Pergunta ainda nao cadastrada para este nivel.",
        answer: "Adicione perguntas no painel de administracao.",
        options: []
      };

  return {
    id: duel.id,
    status: duel.status,
    effective_level: duel.effective_level,
    current_round: duel.current_round,
    score_a: duel.score_a,
    score_b: duel.score_b,
    participant_a: {
      id: duel.participant_a_id,
      name: operatorParticipantName(duel.participant_a_name),
      full_name: duel.participant_a_name,
      level: duel.participant_a_level
    },
    participant_b: {
      id: duel.participant_b_id,
      name: operatorParticipantName(duel.participant_b_name),
      full_name: duel.participant_b_name,
      level: duel.participant_b_level
    },
    winner_participant_id: duel.winner_participant_id,
    current_question: question,
    created_at: duel.created_at,
    completed_at: duel.completed_at
  };
}

function serializeQuestion(question) {
  return {
    ...question,
    enabled: Boolean(question.enabled),
    options: parseJson(question.options_json, []),
    used_count: question.used_count || 0
  };
}

function sanitizeEvent(event) {
  const { pin_code, ...publicEvent } = event;
  return publicEvent;
}

function minutesSince(value) {
  const timestamp = new Date(`${value.replace(" ", "T")}Z`).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function normalizeOptions(options) {
  if (!options) return [];
  if (Array.isArray(options)) return options.map(String).filter(Boolean);
  if (typeof options === "string") {
    return options
      .split(/[|;]/)
      .map((option) => option.trim())
      .filter(Boolean);
  }
  return [];
}

function flattenQuestionMap(map) {
  return Object.values(map || {}).flatMap((value) => (Array.isArray(value) ? value : []));
}

function parseCsvQuestions(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((header) => safeKey(header));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] || "";
      return acc;
    }, {});
  });
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

function safeKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "JSON invalido");
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "http://127.0.0.1:8787,http://localhost:8787")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type,x-staff-pin",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
