const form = document.getElementById("jobForm");
const steps = [...document.querySelectorAll(".step")];
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const submitBtn = document.getElementById("submitBtn");
const progressBar = document.getElementById("progressBar");
const stepCount = document.getElementById("stepCount");
const formError = document.getElementById("formError");
const successState = document.getElementById("successState");
const fileInput = document.getElementById("curriculo");
const fileName = document.getElementById("fileName");
const nameInput = form.elements.nome_completo;
const phoneInput = form.elements.whatsapp;
const emailInput = form.elements.email;
let current = 0;
let animating = false;

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

function pushEvent(event, extra = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...extra });
}

function value(name) {
  const el = form.elements[name];
  if (!el) return "";
  if (el instanceof RadioNodeList) return el.value;
  return el.value;
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

function phoneLocalDigits(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function isValidBrazilWhatsapp(raw) {
  const digits = phoneLocalDigits(raw);
  if (digits.length !== 11) return false;
  if (!VALID_DDDS.has(digits.slice(0, 2))) return false;
  if (digits[2] !== "9") return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

function formatPhoneInput(raw) {
  const digits = phoneLocalDigits(raw).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

function isValidEmail(raw) {
  const email = String(raw || "").trim();
  if (!email) return true;
  if (email.length > 160 || /\s/.test(email)) return false;
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/i.test(email);
}

nameInput.addEventListener("input", () => {
  const filtered = String(nameInput.value || "")
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s{2,}/g, " ");
  if (nameInput.value !== filtered) nameInput.value = filtered;
  nameInput.setCustomValidity("");
});

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhoneInput(phoneInput.value);
  phoneInput.setCustomValidity("");
});

emailInput.addEventListener("input", () => emailInput.setCustomValidity(""));

function setTrackingFields() {
  const params = new URLSearchParams(location.search);
  const keys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid"];
  keys.forEach(k => {
    const v = params.get(k) || sessionStorage.getItem(`track_${k}`) || "";
    if (form.elements[k]) form.elements[k].value = v;
    if (params.get(k)) sessionStorage.setItem(`track_${k}`, params.get(k));
  });
  form.elements.landing_page.value = location.href;
  form.elements.referrer.value = document.referrer || "";
}

function updateUI() {
  const pct = ((current + 1) / steps.length) * 100;
  progressBar.style.width = `${pct}%`;
  stepCount.textContent = `${current + 1} / ${steps.length}`;
  backBtn.classList.toggle("hidden", current === 0);
  nextBtn.classList.toggle("hidden", current === steps.length - 1);
  submitBtn.classList.toggle("hidden", current !== steps.length - 1);
}

function changeStep(nextIndex, direction = 1) {
  if (animating || nextIndex < 0 || nextIndex >= steps.length) return;
  animating = true;
  formError.hidden = true;

  const old = steps[current];
  const next = steps[nextIndex];
  old.classList.remove("active");
  old.classList.add(direction > 0 ? "exit-left" : "exit-right");

  setTimeout(() => {
    old.classList.remove("exit-left","exit-right");
    current = nextIndex;
    next.classList.add("active");
    updateUI();
    pushEvent("FormStep", { form_name: "vagas_projem", step: current + 1 });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => animating = false, 340);
  }, 190);
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function validateStep() {
  formError.hidden = true;
  const step = steps[current];

  if (step.contains(nameInput)) {
    nameInput.value = normalizeName(nameInput.value);
    if (!isValidName(nameInput.value)) {
      showError("Informe um nome com pelo menos 2 letras, sem números ou caracteres especiais.");
      nameInput.focus();
      return false;
    }
  }

  if (step.contains(phoneInput)) {
    if (!isValidBrazilWhatsapp(phoneInput.value)) {
      showError("Informe um WhatsApp brasileiro válido com DDD e 9 dígitos.");
      phoneInput.focus();
      return false;
    }
    if (!isValidEmail(emailInput.value)) {
      showError("Informe um e-mail válido ou deixe o campo em branco.");
      emailInput.focus();
      return false;
    }
  }

  for (const input of step.querySelectorAll("input[required],textarea[required]")) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }

  for (const group of step.querySelectorAll("[data-required-radio]")) {
    if (!value(group.dataset.requiredRadio)) {
      showError("Selecione uma opção para continuar.");
      return false;
    }
  }

  if (current === steps.length - 1) {
    const hasFile = fileInput.files.length > 0;
    const about = value("sobre_voce").trim();

    if (!hasFile && !about) {
      showError("Envie seu currículo ou conte-nos mais sobre você.");
      return false;
    }

    if (hasFile && fileInput.files[0].size > 5 * 1024 * 1024) {
      showError("O currículo deve ter no máximo 5 MB.");
      return false;
    }
  }

  return true;
}

nextBtn.addEventListener("click", () => {
  if (!validateStep()) return;
  changeStep(current + 1, 1);
});

backBtn.addEventListener("click", () => changeStep(current - 1, -1));

document.querySelectorAll(".options input").forEach(input => {
  input.addEventListener("change", () => {
    if (current < steps.length - 1) {
      setTimeout(() => {
        if (validateStep()) changeStep(current + 1, 1);
      }, 180);
    }
  });
});

fileInput.addEventListener("change", () => {
  fileName.textContent = fileInput.files[0] ? `Arquivo selecionado: ${fileInput.files[0].name}` : "";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStep()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const data = new FormData(form);
    data.set("nome_completo", normalizeName(value("nome_completo")));
    data.set("email", String(value("email") || "").trim().toLowerCase());
    data.set("whatsapp", phoneLocalDigits(value("whatsapp")));

    const res = await fetch("/.netlify/functions/submit-candidate", {
      method: "POST",
      body: data
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Não foi possível enviar sua candidatura.");

    pushEvent("Lead", {
      form_name: "vagas_projem",
      vaga: value("vaga"),
      event_id: result.event_id
    });
    if (typeof window.fbq === "function") window.fbq("track", "Lead");

    if (result.qualified) {
      pushEvent("LeadQualificado", {
        form_name: "vagas_projem",
        vaga: value("vaga"),
        event_id: result.event_id
      });
      if (typeof window.fbq === "function") window.fbq("trackCustom", "LeadQualificado");
    }

    form.classList.add("hidden");
    successState.classList.remove("hidden");
    stepCount.textContent = "Concluído";
    progressBar.style.width = "100%";
  } catch (err) {
    showError(err.message || "Ocorreu um erro. Tente novamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Finalizar candidatura";
  }
});

setTrackingFields();
updateUI();
pushEvent("FormStart", { form_name: "vagas_projem", vaga: value("vaga") });
