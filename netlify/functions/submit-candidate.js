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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function str(form, key) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  return letters.length >= 2 && /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(normalized);
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

function getResume(form) {
  const file = form.get("curriculo");
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") return null;
  if (!file.name || !file.size) return null;
  return file;
}

function validateResume(file) {
  if (!file) return null;
  if (file.size > MAX_FILE_SIZE) return "O currículo deve ter no máximo 5 MB.";
  const ext = "." + String(file.name || "").split(".").pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return "Formato de currículo inválido.";
  if (file.type && !ALLOWED_MIME.includes(file.type)) return "Formato de currículo inválido.";
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const form = await req.formData();

    const fields = {
      nome_completo: str(form, "nome_completo"),
      idade: str(form, "idade"),
      cidade: str(form, "cidade"),
      whatsapp: str(form, "whatsapp"),
      email: str(form, "email"),
      experiencia_vendas: str(form, "experiencia_vendas"),
      cnh_b: str(form, "cnh_b"),
      veiculo_proprio: str(form, "veiculo_proprio"),
      notebook: str(form, "notebook"),
      cnpj_ativo: str(form, "cnpj_ativo"),
      consentimento: str(form, "consentimento"),
      sobre_voce: str(form, "sobre_voce"),
      vaga: str(form, "vaga") || "vendedor_externo",
      form_version: str(form, "form_version") || "1.3-mobile",
      utm_source: str(form, "utm_source"),
      utm_medium: str(form, "utm_medium"),
      utm_campaign: str(form, "utm_campaign"),
      utm_content: str(form, "utm_content"),
      utm_term: str(form, "utm_term"),
      fbclid: str(form, "fbclid"),
      gclid: str(form, "gclid"),
      landing_page: str(form, "landing_page"),
      referrer: str(form, "referrer")
    };

    const required = [
      "nome_completo", "idade", "cidade", "whatsapp",
      "experiencia_vendas", "cnh_b", "veiculo_proprio",
      "notebook", "cnpj_ativo", "consentimento"
    ];

    for (const key of required) {
      if (!fields[key]) return json({ error: `Campo obrigatório ausente: ${key}` }, 400);
    }

    const nome = normalizeName(fields.nome_completo);
    if (!isValidName(nome)) {
      return json({ error: "Informe um nome com pelo menos 2 letras, sem números ou caracteres especiais." }, 400);
    }

    const email = normalizeEmail(fields.email);
    if (!isValidEmail(email)) {
      return json({ error: "Informe um e-mail válido ou deixe o campo em branco." }, 400);
    }

    if (!isValidBrazilWhatsapp(fields.whatsapp)) {
      return json({ error: "Informe um WhatsApp brasileiro válido com DDD e 9 dígitos." }, 400);
    }

    const resume = getResume(form);
    const resumeError = validateResume(resume);
    if (resumeError) return json({ error: resumeError }, 400);

    const about = safeText(fields.sobre_voce, 1500);
    if (!resume && !about) {
      return json({ error: "Envie seu currículo ou conte-nos mais sobre você." }, 400);
    }

    const idade = Number(fields.idade);
    if (!Number.isInteger(idade) || idade < 16 || idade > 100) {
      return json({ error: "Idade inválida." }, 400);
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

    const payload = {
      event: "LeadQualificado",
      event_id: eventId,
      event_time: now,
      vaga: fields.vaga,
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
        form_version: fields.form_version,
        source: "formulario_vagas_projem"
      }
    };

    payload.telegram_message = [
      "🟢 NOVO CANDIDATO QUALIFICADO",
      "",
      `👤 Nome: ${nome}`,
      `🎂 Idade: ${idade} anos`,
      `📍 Cidade: ${city}`,
      `📱 WhatsApp: ${whatsappDisplay}`,
      email ? `✉️ E-mail: ${email}` : "✉️ E-mail: não informado",
      "",
      `💼 Experiência com vendas: ${payload.experiencia_vendas}`,
      `🚘 CNH B: ${payload.cnh_b}`,
      `🚗 Veículo próprio: ${payload.veiculo_proprio}`,
      `💻 Notebook: ${payload.notebook}`,
      `🏢 CNPJ ativo: ${payload.cnpj_ativo}`,
      about ? `\n📝 Sobre o candidato:\n${about}` : "",
      "",
      `📊 Origem: ${fields.utm_source || "direto"}${fields.utm_medium ? ` / ${fields.utm_medium}` : ""}`,
      fields.utm_campaign ? `Campanha: ${fields.utm_campaign}` : "",
      "",
      "✅ LEAD QUALIFICADO",
      `🔗 WhatsApp: https://wa.me/${whatsapp}`
    ].filter(Boolean).join("\n");

    if (qualified) {
      const webhook = Netlify.env.get("MAKE_WEBHOOK_URL");
      if (!webhook) {
        console.error("MAKE_WEBHOOK_URL ausente no ambiente do Netlify.");
        return json({ error: "Integração com o processo seletivo não está configurada no servidor." }, 500);
      }

      const outgoing = new FormData();
      outgoing.append("payload_json", JSON.stringify(payload));

      const flatFields = {
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
      };

      for (const [key, val] of Object.entries(flatFields)) {
        outgoing.append(key, val ?? "");
      }

      if (resume) {
        outgoing.append("curriculo", resume, String(resume.name || "curriculo").replace(/[^\p{L}\p{N}._ -]/gu, "_"));
        outgoing.append("curriculo_nome", String(resume.name || "curriculo"));
        outgoing.append("curriculo_tipo", String(resume.type || ""));
      } else {
        outgoing.append("curriculo_nome", "");
        outgoing.append("curriculo_tipo", "");
      }

      const makeResponse = await fetch(webhook, { method: "POST", body: outgoing });
      if (!makeResponse.ok) {
        console.error("Make webhook HTTP", makeResponse.status);
        return json({ error: `O servidor de integração recusou o envio (${makeResponse.status}).` }, 502);
      }
    }

    return json({ ok: true, qualified, event_id: eventId });
  } catch (err) {
    console.error("submit-candidate error", err);
    return json({ error: "Não foi possível processar a candidatura." }, 500);
  }
};
