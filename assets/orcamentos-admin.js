const state = {
  key: sessionStorage.getItem("hagav_admin_key") || "",
  rows: []
};

const els = {
  accessKey: document.getElementById("access-key"),
  saveKeyBtn: document.getElementById("save-key"),
  refreshBtn: document.getElementById("refresh-list"),
  statusFilter: document.getElementById("status-filter"),
  cards: document.getElementById("cards"),
  pageStatus: document.getElementById("page-status")
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setPageStatus(text, isError = false) {
  if (!els.pageStatus) return;
  els.pageStatus.textContent = text || "";
  els.pageStatus.style.color = isError ? "#ff8e8e" : "rgba(255,255,255,0.8)";
}

async function apiRequest(path, options = {}) {
  if (!state.key) throw new Error("Informe a chave de acesso.");
  const headers = {
    ...(options.headers || {}),
    "x-admin-key": state.key
  };
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Falha ${response.status}`);
  }
  return data;
}

function buildCard(row) {
  const created = new Date(row.created_at || Date.now()).toLocaleString("pt-BR");
  const precoBase = Number(row.preco_base || 0);
  const precoFinal = Number(row.preco_final || 0);
  return `
    <article class="card" data-id="${row.id}">
      <div class="card-top">
        <div>
          <strong>#${row.id} • ${escapeHtml(row.nome || "Sem nome")}</strong>
          <div class="muted">${escapeHtml(row.whatsapp || "-")} • ${escapeHtml(row.servico || "-")}</div>
        </div>
        <div class="muted">${escapeHtml(created)}</div>
      </div>
      <div class="summary">${escapeHtml(row.resumo_orcamento || "Sem resumo.")}</div>
      <div class="grid">
        <label>Preço base
          <input type="number" step="0.01" value="${Number.isFinite(precoBase) ? precoBase : 0}" disabled />
        </label>
        <label>Preço final
          <input type="number" step="0.01" data-field="preco_final" value="${Number.isFinite(precoFinal) ? precoFinal : 0}" />
        </label>
        <label>Pacote sugerido
          <input type="text" data-field="pacote_sugerido" value="${escapeHtml(row.pacote_sugerido || "")}" />
        </label>
        <label>Status orçamento
          <select data-field="status_orcamento">
            ${["pendente_revisao","em_revisao","aprovado","enviado","arquivado","cancelado"].map((status) => (
              `<option value="${status}"${status === row.status_orcamento ? " selected" : ""}>${status}</option>`
            )).join("")}
          </select>
        </label>
        <label class="full">Observações internas
          <textarea data-field="observacoes_internas">${escapeHtml(row.observacoes_internas || "")}</textarea>
        </label>
        <label class="full">Link PDF
          <input type="text" data-field="link_pdf" value="${escapeHtml(row.link_pdf || "")}" />
        </label>
      </div>
      <div class="actions">
        <button class="btn btn-yellow" data-action="save">Salvar ajuste</button>
        <button class="btn btn-ghost" data-action="pdf">Gerar PDF</button>
      </div>
      <div class="status" data-status></div>
    </article>
  `;
}

function renderCards() {
  if (!els.cards) return;
  if (!state.rows.length) {
    els.cards.innerHTML = `<div class="panel">Nenhum orçamento encontrado para o filtro atual.</div>`;
    return;
  }
  els.cards.innerHTML = state.rows.map(buildCard).join("");
}

async function loadRows() {
  const status = (els.statusFilter?.value || "").trim();
  const query = new URLSearchParams({ limit: "120" });
  if (status) query.set("status_orcamento", status);
  setPageStatus("Carregando orçamentos...");
  const data = await apiRequest(`/api/admin-orcamentos?${query.toString()}`);
  state.rows = Array.isArray(data.rows) ? data.rows : [];
  renderCards();
  setPageStatus(`Total carregado: ${state.rows.length}`);
}

function getCardPayload(card) {
  const id = String(card.getAttribute("data-id") || "").trim();
  const read = (field) => {
    const input = card.querySelector(`[data-field="${field}"]`);
    return input ? input.value : "";
  };
  return {
    id,
    preco_final: Number(read("preco_final") || 0),
    pacote_sugerido: read("pacote_sugerido"),
    status_orcamento: read("status_orcamento"),
    observacoes_internas: read("observacoes_internas"),
    link_pdf: read("link_pdf")
  };
}

function setCardStatus(card, text, isError = false) {
  const el = card.querySelector("[data-status]");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#ff8e8e" : "#9dffb8";
}

function downloadPdfFromBase64(base64, fileName) {
  if (!base64) return;
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "orcamento-rascunho.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function handleCardSave(card) {
  const payload = getCardPayload(card);
  setCardStatus(card, "Salvando...");
  await apiRequest("/api/admin-orcamentos", {
    method: "PATCH",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });
  setCardStatus(card, "Ajuste salvo com sucesso.");
}

async function handleGeneratePdf(card) {
  const id = String(card.getAttribute("data-id") || "").trim();
  if (!id) return;
  setCardStatus(card, "Gerando PDF...");
  const data = await apiRequest("/api/admin-orcamentos-pdf", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ id })
  });
  if (data.link_pdf) {
    const input = card.querySelector('[data-field="link_pdf"]');
    if (input) input.value = data.link_pdf;
  }
  downloadPdfFromBase64(data.pdf_base64, data.fileName);
  if (data.uploaded) {
    setCardStatus(card, "PDF gerado, link salvo no banco e download iniciado.");
  } else {
    setCardStatus(card, `PDF gerado para download local (${data.upload_reason || "sem upload"}).`);
  }
}

function bindEvents() {
  els.saveKeyBtn?.addEventListener("click", async () => {
    state.key = (els.accessKey?.value || "").trim();
    if (!state.key) {
      setPageStatus("Informe a chave de acesso.", true);
      return;
    }
    sessionStorage.setItem("hagav_admin_key", state.key);
    try {
      await loadRows();
    } catch (error) {
      setPageStatus(error.message || "Falha ao carregar painel.", true);
    }
  });

  els.refreshBtn?.addEventListener("click", async () => {
    try {
      await loadRows();
    } catch (error) {
      setPageStatus(error.message || "Falha ao atualizar.", true);
    }
  });

  els.statusFilter?.addEventListener("change", async () => {
    try {
      await loadRows();
    } catch (error) {
      setPageStatus(error.message || "Falha ao filtrar.", true);
    }
  });

  els.cards?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest(".card");
    if (!card) return;
    btn.disabled = true;
    try {
      if (btn.dataset.action === "save") {
        await handleCardSave(card);
      } else if (btn.dataset.action === "pdf") {
        await handleGeneratePdf(card);
      }
    } catch (error) {
      setCardStatus(card, error.message || "Falha ao processar ação.", true);
    } finally {
      btn.disabled = false;
    }
  });
}

function init() {
  if (els.accessKey) els.accessKey.value = state.key;
  bindEvents();
  if (state.key) {
    loadRows().catch((error) => setPageStatus(error.message || "Falha ao carregar painel.", true));
  }
}

init();
