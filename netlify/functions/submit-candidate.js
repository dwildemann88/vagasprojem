const Busboy = require("busboy");
const crypto = require("crypto");

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx"];
const ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream"
];
const VALID_DDDS = new Set([
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99"
]);

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return reject(new Error("Formato de envio inválido."));
    }

    const fields = {};
    let resume = null;

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 50 }
    });

    bb.on("field", (name, val) => { fields[name] = String(val).trim(); });

    bb.on("file", (name, stream, info) => {
      if (name !== "curriculo") {
        stream.resume();
        return;
      }

      const chunks = [];
      let exceeded = false;
      stream.on("limit", () => { exceeded = true; });
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("end", () => {
        if (!info.filename) return;
        if (exceeded) return reject(new Error("O currículo deve ter no máximo 5 MB."));

        const ext = "." + info.filename.split(".").pop().toLowerCase();
        if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(info.mimeType)) {
          return reject(new Error("Formato de currículo inválido."));
        }

        resume = {
          filename: info.filename.replace(/[^\p{L}\p{N}._ -]/gu, "_"),
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, resume }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");
    bb.end(body);
  });
}

function isYes(v) {
  return String(v).toLowerCase() === "sim";
}

function normalizeName(raw) {
  return String(raw || "")
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidName(raw) {
  const normalized = normalizeName(raw);
  const letters = normalized.replace(/\s/g, "");
  return letters.length >= 3 && /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(normalized);
}

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(email) {
  if (!email) return true;
  if (email.length > 160 || /\s/.test(email)) return false;
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/i.test(email);
}

function localPhoneDigits(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function isValidBrazilWhatsapp(raw) {
  const digits = localPhoneDigits(raw);
  if (digits.length !== 11) return false;
  if (!VALID_DDDS.has(digits.slice(0, 2))) return false;
  if (digits[2] !== "9") return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

function normalizeWhatsapp(raw) {
  return `55${localPhoneDigits(raw)}`;
}

function formatWhatsappDisplay(raw) {
  const d = localPhoneDigits(raw);
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function safeText(v, max = 1500) {
  return String(v || "").trim().slice(0, max);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Método não permitido." });

  try {
    const { fields, resume } = await parseMultipart(event);

    const required = [
      "nome_completo", "idade", "cidade", "whatsapp",
      "experiencia_vendas", "cnh_b", "veiculo_proprio",
      "notebook", "cnpj_ativo", "consentimento"
    ];

    for (const key of required) {
      if (!fields[key]) return response(400, { error: `Campo obrigatório ausente: ${key}` });
    }

    const nome = normalizeName(fields.nome_completo);
    if (!isValidName(fields.nome_completo)) {
      return response(400, { error: "Informe um nome com pelo menos 3 letras, sem números ou caracteres especiais." });
    }

    const email = normalizeEmail(fields.email);
    if (!isValidEmail(email)) {
      return response(400, { error: "Informe um e-mail válido ou deixe o campo em branco." });
    }

    if (!isValidBrazilWhatsapp(fields.whatsapp)) {
      return response(400, { error: "Informe um WhatsApp brasileiro válido com DDD e 9 dígitos." });
    }

    if (!resume && !safeText(fields.sobre_voce)) {
      return response(400, { error: "Envie o currículo ou conte-nos mais sobre você." });
    }

    const idade = Number(fields.idade);
    if (!Number.isInteger(idade) || idade < 16 || idade > 100) {
      return response(400, { error: "Idade inválida." });
    }

    const qualified =
      idade >= 18 &&
      isYes(fields.experiencia_vendas) &&
      isYes(fields.cnh_b) &&
      isYes(fields.veiculo_proprio);

    const eventId = `vaga_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const whatsapp = normalizeWhatsapp(fields.whatsapp);
    const whatsappDisplay = formatWhatsappDisplay(fields.whatsapp);
    const city = safeText(fields.cidade, 100);
    const about = safeText(fields.sobre_voce, 1500);

    const payload = {
      event: "LeadQualificado",
      event_id: eventId,
      event_time: now,
      vaga: fields.vaga || "vendedor_externo",
      status: qualified ? "qualificado" : "nao_qualificado",
      nome_completo: nome,
      idade,
      cidade: city,
      whatsapp,
      whatsapp_formatado: whatsappDisplay,
      whatsapp_link: `https://wa.me/${whatsapp}`,
      email,
      experiencia_vendas: isYes(fields.experiencia_vendas) ? "Sim" : "Não",
      cnh_b: isYes(fields.cnh_b) ? "Sim" : "Não",
      veiculo_proprio: isYes(fields.veiculo_proprio) ? "Sim" : "Não",
      notebook: isYes(fields.notebook) ? "Sim" : "Não",
      cnpj_ativo: isYes(fields.cnpj_ativo) ? "Sim" : "Não",
      sobre_voce: about,
      qualificado: qualified,
      qualificacao: {
        idade_18_ou_mais: idade >= 18,
        experiencia_vendas: isYes(fields.experiencia_vendas),
        cnh_b: isYes(fields.cnh_b),
        veiculo_proprio: isYes(fields.veiculo_proprio)
      },
      origem: {
        utm_source: safeText(fields.utm_source, 150),
        utm_medium: safeText(fields.utm_medium, 150),
        utm_campaign: safeText(fields.utm_campaign, 200),
        utm_content: safeText(fields.utm_content, 200),
        utm_term: safeText(fields.utm_term, 200),
        fbclid: safeText(fields.fbclid, 500),
        gclid: safeText(fields.gclid, 500),
        landing_page: safeText(fields.landing_page, 1000),
        referrer: safeText(fields.referrer, 1000)
      },
      tecnico: {
        enviado_em: now,
        form_version: fields.form_version || "1.2-mobile",
        source: "formulario_vagas_projem"
      },
      telegram_message: [
        "🟢 NOVO CANDIDATO QUALIFICADO",
        "",
        `👤 Nome: ${nome}`,
        `🎂 Idade: ${idade} anos`,
        `📍 Cidade: ${city}`,
        `📱 WhatsApp: ${whatsappDisplay}`,
        email ? `✉️ E-mail: ${email}` : "✉️ E-mail: não informado",
        "",
        `💼 Experiência com vendas: ${isYes(fields.experiencia_vendas) ? "Sim" : "Não"}`,
        `🚘 CNH B: ${isYes(fields.cnh_b) ? "Sim" : "Não"}`,
        `🚗 Veículo próprio: ${isYes(fields.veiculo_proprio) ? "Sim" : "Não"}`,
        `💻 Notebook: ${isYes(fields.notebook) ? "Sim" : "Não"}`,
        `🏢 CNPJ ativo: ${isYes(fields.cnpj_ativo) ? "Sim" : "Não"}`,
        about ? `\n📝 Sobre o candidato:\n${about}` : "",
        "",
        `📊 Origem: ${fields.utm_source || "direto"}${fields.utm_medium ? ` / ${fields.utm_medium}` : ""}`,
        fields.utm_campaign ? `Campanha: ${fields.utm_campaign}` : "",
        "",
        `✅ LEAD QUALIFICADO`,
        `🔗 WhatsApp: https://wa.me/${whatsapp}`
      ].filter(Boolean).join("\n")
    };

    if (qualified) {
      const outgoing = new FormData();
      outgoing.append("payload_json", JSON.stringify(payload));

      for (const [key, val] of Object.entries({
        event: payload.event,
        event_id: payload.event_id,
        vaga: payload.vaga,
        status: payload.status,
        nome_completo: payload.nome_completo,
        idade: String(payload.idade),
        cidade: payload.cidade,
        whatsapp: payload.whatsapp,
        whatsapp_formatado: payload.whatsapp_formatado,
        whatsapp_link: payload.whatsapp_link,
        email: payload.email,
        experiencia_vendas: payload.experiencia_vendas,
        cnh_b: payload.cnh_b,
        veiculo_proprio: payload.veiculo_proprio,
        notebook: payload.notebook,
        cnpj_ativo: payload.cnpj_ativo,
        sobre_voce: payload.sobre_voce,
        utm_source: payload.origem.utm_source,
        utm_medium: payload.origem.utm_medium,
        utm_campaign: payload.origem.utm_campaign,
        utm_content: payload.origem.utm_content,
        utm_term: payload.origem.utm_term,
        fbclid: payload.origem.fbclid,
        gclid: payload.origem.gclid,
        landing_page: payload.origem.landing_page,
        referrer: payload.origem.referrer,
        enviado_em: payload.tecnico.enviado_em,
        telegram_message: payload.telegram_message
      })) outgoing.append(key, val ?? "");

      if (resume) {
        const blob = new Blob([resume.buffer], { type: resume.mimeType });
        outgoing.append("curriculo", blob, resume.filename);
        outgoing.append("curriculo_nome", resume.filename);
        outgoing.append("curriculo_tipo", resume.mimeType);
      } else {
        outgoing.append("curriculo_nome", "");
        outgoing.append("curriculo_tipo", "");
      }

      if (!MAKE_WEBHOOK_URL) throw new Error("MAKE_WEBHOOK_URL não configurado.");
      const makeResponse = await fetch(MAKE_WEBHOOK_URL, { method: "POST", body: outgoing });
      if (!makeResponse.ok) throw new Error(`Webhook Make retornou HTTP ${makeResponse.status}.`);
    }

    return response(200, { ok: true, qualified, event_id: eventId });
  } catch (err) {
    console.error(err);
    return response(500, { error: "Não foi possível processar a candidatura." });
  }
};
