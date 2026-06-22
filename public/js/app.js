// ── State ──
let platform = 'LinkedIn';
let tone = 'Friendly & direct';
let varCount = 1;
let variants = [];
let activeVar = 0;
let isGenerating = false;
let isGeneratingFollowUp = false;

let currentHistoryId = null;   // history id of the most recent generation in the output panel
let followUps = {};            // activeVar index -> follow-up text, for the currently displayed result

let historyItems = [];
let historyLoaded = false;

// ── Chip selectors ──
function setupChips(rowId, callback) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      callback(btn.dataset.val);
    });
  });
}

setupChips('platform-row', val => { platform = val; });
setupChips('tone-row',     val => { tone = val; });
setupChips('count-row',    val => { varCount = parseInt(val); });

// ── View tabs (Generate / History) ──
function setupViewTabs() {
  const tabs = document.getElementById('view-tabs');
  if (!tabs) return;
  tabs.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.view);
    });
  });
}

function switchView(view) {
  const heroSection = document.getElementById('hero-section');
  const generateView = document.getElementById('generate-view');
  const historyView = document.getElementById('history-view');

  if (view === 'history') {
    heroSection.classList.add('hidden');
    generateView.classList.add('hidden');
    historyView.classList.remove('hidden');
    loadHistory();
  } else {
    heroSection.classList.remove('hidden');
    generateView.classList.remove('hidden');
    historyView.classList.add('hidden');
  }
}

// ── UI helpers ──
function showEmpty() {
  document.getElementById('output-empty').classList.remove('hidden');
  document.getElementById('output-result').classList.add('hidden');
}

function showResult() {
  document.getElementById('output-empty').classList.add('hidden');
  document.getElementById('output-result').classList.remove('hidden');
}

function renderOutput() {
  showResult();
  const tabRow = document.getElementById('tab-row');

  if (variants.length > 1) {
    tabRow.innerHTML = variants.map((_, i) =>
      `<button class="tab-btn${i === activeVar ? ' active' : ''}" onclick="switchVar(${i})">
        Version ${i + 1}
      </button>`
    ).join('');
  } else {
    tabRow.innerHTML = '';
  }

  const text = variants[activeVar] || '';
  const dmEl = document.getElementById('dm-output');
  dmEl.classList.remove('loading-dots');
  dmEl.textContent = text;
  document.getElementById('char-count').textContent = `${text.length} characters`;
  document.getElementById('result-meta').textContent = `${platform} · ${tone}`;

  renderFollowUp();
}

function switchVar(i) {
  activeVar = i;
  renderOutput();
}

// ── Follow-up rendering ──
function renderFollowUp() {
  const block = document.getElementById('followup-block');
  const out = document.getElementById('followup-output');
  const text = followUps[activeVar];

  if (text) {
    block.classList.remove('hidden');
    out.classList.remove('loading-dots');
    out.textContent = text;
  } else {
    block.classList.add('hidden');
    out.textContent = '';
  }
}

async function generateFollowUp() {
  if (isGeneratingFollowUp) return;
  const baseText = variants[activeVar];
  if (!baseText) return;

  isGeneratingFollowUp = true;
  const btn = document.getElementById('followup-btn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Writing follow-up...';

  const block = document.getElementById('followup-block');
  const out = document.getElementById('followup-output');
  block.classList.remove('hidden');
  out.classList.add('loading-dots');
  out.textContent = 'Writing follow-up';

  try {
    const payload = currentHistoryId
      ? { historyId: currentHistoryId, baseVariantIndex: activeVar }
      : {
          originalMessage: baseText,
          platform,
          tone,
          name: document.getElementById('name').value.trim(),
          role: document.getElementById('role').value.trim(),
          about: document.getElementById('about').value.trim(),
          cta: document.getElementById('cta').value.trim()
        };

    const response = await fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      handleSessionExpired();
      isGeneratingFollowUp = false;
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    followUps[activeVar] = data.followUp;
    renderFollowUp();

  } catch (err) {
    out.classList.remove('loading-dots');
    out.textContent = `Error: ${err.message}`;
    out.style.color = '#f87171';
    setTimeout(() => { out.style.color = ''; }, 5000);
    console.error('Follow-up error:', err);
  }

  isGeneratingFollowUp = false;
  btn.disabled = false;
  btn.textContent = originalLabel;
}

// ── Copy ──
function copyText(text, successMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => showToast(successMsg || 'Copied to clipboard!'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg || 'Copied!');
    });
}

function copyDM() {
  copyText(variants[activeVar] || '', 'Copied to clipboard!');
}

// ── Toast ──
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

// ── Generate ──
async function generate() {
  if (isGenerating) return;

  const reason = document.getElementById('reason').value.trim();
  const about  = document.getElementById('about').value.trim();

  if (!reason || !about) {
    showToast("Please fill in why you're reaching out and about yourself.");
    return;
  }

  isGenerating = true;
  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="gen-btn-icon">&#8635;</span> Generating...';

  // Reset follow-up state for the new generation
  followUps = {};
  currentHistoryId = null;
  document.getElementById('followup-block').classList.add('hidden');

  // Show loading state
  showResult();
  document.getElementById('tab-row').innerHTML = '';
  document.getElementById('result-meta').textContent = `${platform} · ${tone}`;
  const dmEl = document.getElementById('dm-output');
  dmEl.classList.add('loading-dots');
  dmEl.textContent = 'Generating your DM';
  document.getElementById('char-count').textContent = '—';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        platform,
        tone,
        varCount,
        name:   document.getElementById('name').value.trim(),
        role:   document.getElementById('role').value.trim(),
        reason,
        about,
        cta:    document.getElementById('cta').value.trim()
      })
    });

    if (response.status === 401) {
      handleSessionExpired();
      showEmpty();
      isGenerating = false;
      btn.disabled = false;
      btn.innerHTML = '<span class="gen-btn-icon">✦</span> Generate DM';
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    variants = data.variants || [];
    activeVar = 0;
    currentHistoryId = data.historyId || null;
    renderOutput();

    // History was just updated server-side; invalidate cached list so the History tab refetches.
    historyLoaded = false;

  } catch (err) {
    showResult();
    dmEl.classList.remove('loading-dots');
    dmEl.textContent = `Error: ${err.message}\n\nMake sure your server is running and GEMINI_API_KEY is set in .env`;
    dmEl.style.color = '#f87171';
    setTimeout(() => { dmEl.style.color = ''; }, 5000);
    console.error('Generate error:', err);
  }

  isGenerating = false;
  btn.disabled = false;
  btn.innerHTML = '<span class="gen-btn-icon">✦</span> Generate DM';
}

// ── History view ──
async function loadHistory(force) {
  if (historyLoaded && !force) return;

  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  listEl.innerHTML = '<p class="history-loading">Loading history...</p>';
  emptyEl.classList.add('hidden');

  try {
    const response = await fetch('/api/history', { credentials: 'same-origin' });

    if (response.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load history');

    historyItems = data.items || [];
    historyLoaded = true;
    renderHistory();

  } catch (err) {
    listEl.innerHTML = `<p class="history-loading" style="color:#f87171">Error loading history: ${escapeHtml(err.message)}</p>`;
    console.error('History load error:', err);
  }
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');

  if (!historyItems.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  listEl.innerHTML = historyItems.map(item => renderHistoryItem(item)).join('');
}

function renderHistoryItem(item) {
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  const variantsHtml = (item.variants || []).map((text, i) => {
    const fu = (item.followUps || []).filter(f => f.baseVariantIndex === i);
    const fuHtml = fu.map(f => `
      <div class="history-followup">
        <p class="history-followup-label">Follow-up</p>
        <p class="history-variant-text">${escapeHtml(f.text)}</p>
        <div class="history-item-actions">
          <button class="action-btn small" onclick="copyText(${jsAttr(f.text)}, 'Follow-up copied!')">Copy</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="history-variant">
        ${item.variants.length > 1 ? `<p class="history-variant-label">Version ${i + 1}</p>` : ''}
        <p class="history-variant-text">${escapeHtml(text)}</p>
        <div class="history-item-actions">
          <button class="action-btn small" onclick="copyText(${jsAttr(text)}, 'Copied!')">Copy</button>
          <button class="action-btn small" onclick="generateFollowUpFromHistory('${item.id}', ${i}, this)">+ Follow-up</button>
        </div>
        ${fuHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="history-item" id="history-item-${item.id}">
      <div class="history-item-header">
        <div class="history-item-meta">
          <span class="history-tag">${escapeHtml(item.platform || '')}</span>
          <span class="history-tag muted">${escapeHtml(item.tone || '')}</span>
          ${item.name ? `<span class="history-tag muted">to ${escapeHtml(item.name)}</span>` : ''}
          <span class="history-date">${dateStr}</span>
        </div>
        <button class="action-btn small danger" onclick="deleteHistoryItem('${item.id}')">Delete</button>
      </div>
      ${variantsHtml}
    </div>
  `;
}

// Generate a follow-up directly from a history card (inline, no need to switch tabs)
async function generateFollowUpFromHistory(historyId, variantIndex, btnEl) {
  const originalLabel = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Writing...';

  try {
    const response = await fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ historyId, baseVariantIndex: variantIndex })
    });

    if (response.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Server error ${response.status}`);

    // Update local cache and re-render just this item
    const entry = historyItems.find(h => h.id === historyId);
    if (entry) {
      if (!Array.isArray(entry.followUps)) entry.followUps = [];
      entry.followUps.push({ baseVariantIndex: variantIndex, text: data.followUp, createdAt: new Date().toISOString() });
      const itemEl = document.getElementById(`history-item-${historyId}`);
      if (itemEl) itemEl.outerHTML = renderHistoryItem(entry);
    }
    showToast('Follow-up generated!');

  } catch (err) {
    showToast(`Error: ${err.message}`);
    console.error('Follow-up error:', err);
    btnEl.disabled = false;
    btnEl.textContent = originalLabel;
  }
}

async function deleteHistoryItem(id) {
  try {
    const response = await fetch(`/api/history/${id}`, { method: 'DELETE', credentials: 'same-origin' });

    if (response.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete');

    historyItems = historyItems.filter(h => h.id !== id);
    renderHistory();
    showToast('Deleted from history.');

  } catch (err) {
    showToast(`Error: ${err.message}`);
    console.error('Delete history error:', err);
  }
}

async function clearHistory() {
  if (!historyItems.length) return;
  if (!confirm('Clear all saved history? This cannot be undone.')) return;

  try {
    const response = await fetch('/api/history', { method: 'DELETE', credentials: 'same-origin' });

    if (response.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to clear history');

    historyItems = [];
    renderHistory();
    showToast('History cleared.');

  } catch (err) {
    showToast(`Error: ${err.message}`);
    console.error('Clear history error:', err);
  }
}

// ── Small utils ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Safely embed a string as a JS string literal inside an inline onclick="..." HTML attribute.
// JSON.stringify gives a double-quoted JS literal; we HTML-entity-escape the quotes/ampersands
// so it survives being placed inside a double-quoted HTML attribute.
function jsAttr(str) {
  const jsonStr = JSON.stringify(str == null ? '' : String(str));
  return jsonStr
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Keyboard shortcut
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
});

// Init
setupViewTabs();
showEmpty();
