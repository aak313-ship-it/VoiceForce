/* VoiceForge — app.js */

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  profileId: null,
  profileName: null,
  analysed: false,
  selectedWriters: new Set(),
  sampleCount: 0,
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const profileNameInput  = $('profile-name');
const btnCreateProfile  = $('btn-create-profile');
const profileSelect     = $('profile-select');
const profileSummary    = $('profile-summary');

const sectionUpload     = $('section-upload');
const tabPaste          = $('tab-paste');
const tabFile           = $('tab-file');
const panelPaste        = $('panel-paste');
const panelFile         = $('panel-file');
const pasteText         = $('paste-text');
const pasteLabel        = $('paste-label');
const btnPasteSave      = $('btn-paste-save');
const uploadArea        = $('upload-area');
const fileInput         = $('file-input');
const sampleList        = $('sample-list');
const btnAnalyse        = $('btn-analyse');
const analyseResult     = $('analyse-result');

const sectionInfluences = $('section-influences');
const writerGrid        = $('writer-grid');
const btnAddInfluence   = $('btn-add-influence');
const modalOverlay      = $('modal-overlay');
const influenceName     = $('influence-name');
const influenceEra      = $('influence-era');
const influenceSample   = $('influence-sample');
const btnModalCancel    = $('btn-modal-cancel');
const btnModalSave      = $('btn-modal-save');

const sectionRewrite    = $('section-rewrite');
const sourceText        = $('source-text');
const toneInput         = $('tone-input');
const btnRewrite        = $('btn-rewrite');
const rewriteOutput     = $('rewrite-output');
const rewrittenText     = $('rewritten-text');
const btnCopy           = $('btn-copy');
const historySection    = $('history-section');
const historyList       = $('history-list');

// ─── Utilities ───────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setLoading(btn, loading) {
  btn.classList.toggle('loading', loading);
}

function enableSection(el) { el.classList.remove('disabled'); }

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Section 1: Profiles ─────────────────────────────────────────────────────
async function loadProfiles() {
  const profiles = await api('GET', '/profiles');
  profileSelect.innerHTML = '<option value="">— select a profile —</option>';
  profiles.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  });
}

btnCreateProfile.addEventListener('click', async () => {
  const name = profileNameInput.value.trim();
  if (!name) { showToast('Enter a profile name', 'error'); return; }

  setLoading(btnCreateProfile, true);
  try {
    const profile = await api('POST', '/profiles', { name });
    await loadProfiles();
    profileSelect.value = profile.id;
    profileSelect.dispatchEvent(new Event('change'));
    profileNameInput.value = '';
    showToast('Profile created', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(btnCreateProfile, false);
  }
});

profileSelect.addEventListener('change', async () => {
  const id = profileSelect.value;
  if (!id) {
    state.profileId = null;
    state.profileName = null;
    state.analysed = false;
    profileSummary.classList.add('hidden');
    sectionUpload.classList.add('disabled');
    sectionInfluences.classList.add('disabled');
    sectionRewrite.classList.add('disabled');
    return;
  }

  try {
    const profile = await api('GET', `/profiles/${id}`);
    state.profileId = profile.id;
    state.profileName = profile.name;
    state.analysed = !!profile.characteristics;
    state.sampleCount = profile.samples.length;

    // Show summary
    if (profile.characteristics && profile.characteristics.one_sentence_summary) {
      profileSummary.textContent = profile.characteristics.one_sentence_summary;
      profileSummary.classList.remove('hidden');
    } else {
      profileSummary.classList.add('hidden');
    }

    // Enable sections
    enableSection(sectionUpload);

    // Populate sample list
    renderSampleList(profile.samples);
    btnAnalyse.disabled = profile.samples.length === 0;

    // Show previous analyse result if available
    if (profile.characteristics) {
      showAnalyseResult(profile.characteristics);
    } else {
      analyseResult.classList.add('hidden');
    }

    // Unlock influences + rewrite only if analysed
    if (state.analysed) {
      enableSection(sectionInfluences);
      enableSection(sectionRewrite);
      loadHistory();
    } else {
      sectionInfluences.classList.add('disabled');
      sectionRewrite.classList.add('disabled');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ─── Section 2: Upload ───────────────────────────────────────────────────────

// Tab switching
tabPaste.addEventListener('click', () => {
  tabPaste.classList.add('active');
  tabFile.classList.remove('active');
  panelPaste.classList.remove('hidden');
  panelFile.classList.add('hidden');
});

tabFile.addEventListener('click', () => {
  tabFile.classList.add('active');
  tabPaste.classList.remove('active');
  panelFile.classList.remove('hidden');
  panelPaste.classList.add('hidden');
});

// Paste text submit
btnPasteSave.addEventListener('click', async () => {
  const text = pasteText.value.trim();
  if (!text) { showToast('Paste some text first', 'error'); return; }
  if (!state.profileId) return;

  if (state.sampleCount >= 5) {
    showToast('Maximum 5 samples per profile', 'error');
    return;
  }

  setLoading(btnPasteSave, true);
  try {
    const res = await fetch(`/upload/${state.profileId}/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, label: pasteLabel.value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const profile = await api('GET', `/profiles/${state.profileId}`);
    renderSampleList(profile.samples);
    pasteText.value = '';
    pasteLabel.value = '';
    showToast('Sample added', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(btnPasteSave, false);
  }
});

function renderSampleList(samples) {
  sampleList.innerHTML = '';
  state.sampleCount = samples.length;
  samples.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s.filename;
    sampleList.appendChild(li);
  });
  btnAnalyse.disabled = samples.length === 0;
}

async function uploadFiles(files) {
  if (!state.profileId) return;

  const remaining = 5 - state.sampleCount;
  if (remaining <= 0) {
    showToast('Maximum 5 samples per profile', 'error');
    return;
  }

  const toUpload = Array.from(files).slice(0, remaining);
  const formData = new FormData();
  toUpload.forEach((f) => formData.append('files', f));

  try {
    uploadArea.classList.add('drag-over');
    const res = await fetch(`/upload/${state.profileId}`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Refresh profile to get updated sample list
    const profile = await api('GET', `/profiles/${state.profileId}`);
    renderSampleList(profile.samples);
    showToast(`Uploaded ${toUpload.length} file(s)`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    uploadArea.classList.remove('drag-over');
  }
}

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadFiles(e.dataTransfer.files);
});

function showAnalyseResult(c) {
  analyseResult.innerHTML = `<strong>Voice profile analysed</strong>
${c.one_sentence_summary || ''}
<br/><br/>
<b>Rhythm:</b> ${c.sentence_rhythm || '—'} &nbsp;|&nbsp;
<b>Formality:</b> ${c.formality || '—'} &nbsp;|&nbsp;
<b>Vocabulary:</b> ${c.vocabulary_level || '—'}`;
  analyseResult.classList.remove('hidden');
}

btnAnalyse.addEventListener('click', async () => {
  if (!state.profileId) return;
  setLoading(btnAnalyse, true);
  try {
    const profile = await api('POST', `/profiles/${state.profileId}/analyse`);
    state.analysed = true;

    showAnalyseResult(profile.characteristics);

    if (profile.characteristics && profile.characteristics.one_sentence_summary) {
      profileSummary.textContent = profile.characteristics.one_sentence_summary;
      profileSummary.classList.remove('hidden');
    }

    enableSection(sectionInfluences);
    enableSection(sectionRewrite);
    showToast('Voice profile ready', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(btnAnalyse, false);
  }
});

// ─── Section 3: Writer influences ────────────────────────────────────────────
async function loadWriters() {
  try {
    const writers = await api('GET', '/fragments');
    writerGrid.innerHTML = '';
    writers.forEach((w) => renderWriterCard(w));
  } catch (e) {
    showToast('Could not load writer influences', 'error');
  }
}

function renderWriterCard(w) {
  const card = document.createElement('div');
  card.className = 'writer-card';
  card.dataset.slug = w.slug;
  card.dataset.id = w.id;
  card.innerHTML = `
    <button class="btn-delete-writer" title="Remove">&#x2715;</button>
    <div class="wname">${w.name}</div>
    <div class="wera">${w.era || ''}</div>
    <div class="wsummary">${w.style_summary || ''}</div>`;

  card.querySelector('.btn-delete-writer').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove "${w.name}" from influences?`)) return;
    try {
      await api('DELETE', `/fragments/${w.id}`);
      state.selectedWriters.delete(w.slug);
      card.remove();
      showToast('Influence removed', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  card.addEventListener('click', () => toggleWriter(card, w.slug));
  writerGrid.appendChild(card);
}

// Modal — add new influence
btnAddInfluence.addEventListener('click', () => {
  influenceName.value = '';
  influenceEra.value = '';
  influenceSample.value = '';
  modalOverlay.classList.remove('hidden');
  influenceName.focus();
});

btnModalCancel.addEventListener('click', () => modalOverlay.classList.add('hidden'));

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});

btnModalSave.addEventListener('click', async () => {
  const name = influenceName.value.trim();
  const era = influenceEra.value.trim();
  const sampleText = influenceSample.value.trim();

  if (!name) { showToast('Name is required', 'error'); return; }
  if (!sampleText) { showToast('Paste some sample writing', 'error'); return; }

  setLoading(btnModalSave, true);
  try {
    const writer = await api('POST', '/fragments', { name, era: era || undefined, sampleText });
    renderWriterCard(writer);
    modalOverlay.classList.add('hidden');
    showToast(`${writer.name} added`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(btnModalSave, false);
  }
});

function toggleWriter(card, slug) {
  if (state.selectedWriters.has(slug)) {
    state.selectedWriters.delete(slug);
    card.classList.remove('selected');
  } else {
    if (state.selectedWriters.size >= 3) {
      showToast('Maximum 3 influences', 'error');
      return;
    }
    state.selectedWriters.add(slug);
    card.classList.add('selected');
  }
}

// ─── Section 4: Rewrite ──────────────────────────────────────────────────────
btnRewrite.addEventListener('click', async () => {
  const text = sourceText.value.trim();
  if (!text) { showToast('Paste some text to rewrite', 'error'); return; }
  if (!state.profileId) return;

  setLoading(btnRewrite, true);
  rewrittenText.textContent = '';
  rewriteOutput.classList.remove('hidden');

  const body = {
    profileId: state.profileId,
    text,
    tone: toneInput.value.trim() || undefined,
    writerSlugs: state.selectedWriters.size > 0 ? [...state.selectedWriters] : undefined,
  };

  try {
    // Use fetch + ReadableStream to consume the SSE response
    const res = await fetch('/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by double newline)
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // keep incomplete tail

      for (const part of parts) {
        const eventLine = part.split('\n').find((l) => l.startsWith('event:'));
        const dataLine  = part.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;

        const eventName = eventLine ? eventLine.slice(7).trim() : 'message';
        const payload   = JSON.parse(dataLine.slice(5).trim());

        if (eventName === 'token') {
          rewrittenText.textContent += payload.token;
        } else if (eventName === 'done') {
          loadHistory();
        } else if (eventName === 'error') {
          showToast(payload.error, 'error');
        }
      }
    }
  } catch (e) {
    showToast(e.message, 'error');
    rewriteOutput.classList.add('hidden');
  } finally {
    setLoading(btnRewrite, false);
  }
});

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(rewrittenText.textContent)
    .then(() => showToast('Copied!', 'success'))
    .catch(() => showToast('Copy failed', 'error'));
});

async function loadHistory() {
  if (!state.profileId) return;
  try {
    const jobs = await api('GET', `/rewrite/history/${state.profileId}`);
    if (jobs.length === 0) { historySection.classList.add('hidden'); return; }

    historyList.innerHTML = '';
    jobs.forEach((j) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="hist-date">${formatDate(j.created_at)}</div>
        <div class="hist-preview">${j.rewritten_text.slice(0, 120)}…</div>`;
      li.addEventListener('click', () => {
        rewrittenText.textContent = j.rewritten_text;
        rewriteOutput.classList.remove('hidden');
        rewriteOutput.scrollIntoView({ behavior: 'smooth' });
      });
      historyList.appendChild(li);
    });

    historySection.classList.remove('hidden');
  } catch {
    // non-fatal
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([loadProfiles(), loadWriters()]);
})();
