const MIN_VERSION = '1.324.0';
const POLL_INTERVAL_MS = 1000;

function meetsMinVersion(version) {
  if (!version) return false;
  const parts = version.split('.').map(Number);
  const min = MIN_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const v = parts[i] || 0;
    const m = min[i] || 0;
    if (v > m) return true;
    if (v < m) return false;
  }
  return true;
}

// --- State ---
const state = {
  posthogDetected: false,
  version: null,
  versionOk: false,
  toursEnabled: false,
  pageUrl: null,
  tours: [],
  toursContext: null,
  flags: {},
  flagDetails: {},
  storage: { shown: {}, completed: {}, dismissed: {}, activeTour: null },
  filterText: '',
  loading: false
};

// --- DOM refs ---
const statusBar = document.getElementById('statusBar');
const toursPanel = document.getElementById('toursPanel');
const refreshBtn = document.getElementById('refreshBtn');
const tourFilterInput = document.getElementById('tourFilterInput');

// --- Messaging ---
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id ?? null);
    });
  });
}

async function sendAction(action, payload) {
  const tabId = await getActiveTabId();
  if (!tabId) return { data: null, error: 'No active tab' };

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PH_DEBUG_REQUEST', action, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ data: null, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { data: null, error: 'Empty response' });
      }
    });
  });
}

// --- Data Fetching ---
async function detect() {
  const res = await sendAction('detect');
  if (res.error || !res.data) {
    state.posthogDetected = false;
    state.version = null;
    state.versionOk = false;
    state.toursEnabled = false;
    state.pageUrl = null;
  } else {
    state.posthogDetected = res.data.found;
    state.version = res.data.version;
    state.versionOk = meetsMinVersion(res.data.version);
    state.toursEnabled = res.data.toursEnabled;
    state.pageUrl = res.data.pageUrl || null;
  }
}

async function fetchTours() {
  const res = await sendAction('getTours');
  if (res.data) {
    state.tours = res.data.tours || [];
    state.toursContext = res.data.context || null;
  } else {
    state.tours = [];
    state.toursContext = null;
  }
}

async function fetchFlags() {
  const res = await sendAction('getFlags');
  state.flags = res.data?.flags || {};
  state.flagDetails = res.data?.flagDetails || {};
}

async function fetchStorage() {
  const res = await sendAction('getStorage');
  if (res.data) {
    state.storage = res.data;
  } else {
    state.storage = { shown: {}, completed: {}, dismissed: {}, activeTour: null };
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  refreshBtn.classList.toggle('is-loading', isLoading);
}

async function refreshAll() {
  try {
    setLoading(true);
    renderLoading();
    await detect();
    renderStatus();

    if (state.posthogDetected && state.versionOk && state.toursEnabled) {
      await Promise.all([fetchTours(), fetchFlags(), fetchStorage()]);
    } else if (state.posthogDetected && state.versionOk) {
      await Promise.all([fetchFlags(), fetchStorage()]);
    }
  } catch (error) {
    showToast(error?.message || 'Refresh failed', 'error');
  } finally {
    setLoading(false);
    renderAll();
  }
}

// --- Rendering ---
function renderStatus() {
  if (!state.posthogDetected) {
    statusBar.className = 'status-bar status-error';
    statusBar.innerHTML = `
      <div class="status-line">
        <span class="status-dot red"></span>
        <span>posthog-js not detected on this page</span>
      </div>
      <div class="status-line">
        <button class="btn btn-primary btn-small" id="enableDebugBtn">Enable Debug &amp; Reload</button>
        <span class="status-hint">Reloads with ?__posthog_debug=true to expose the PostHog instance</span>
      </div>`;
    // listener handled via event delegation on document.body
  } else if (!state.versionOk) {
    statusBar.className = 'status-bar status-error';
    statusBar.innerHTML = `
      <div class="status-line">
        <span class="status-dot red"></span>
        <span>PostHog v${esc(state.version || '?')} detected</span>
      </div>
      <div class="status-line">
        <span class="status-dot red"></span>
        <span>Requires v${MIN_VERSION}+ (upgrade posthog-js)</span>
      </div>`;
  } else if (!state.toursEnabled) {
    statusBar.className = 'status-bar status-warn';
    statusBar.innerHTML = `
      <div class="status-line">
        <span class="status-dot yellow"></span>
        <span>PostHog v${esc(state.version || '?')} detected</span>
      </div>
      <div class="status-line">
        <span class="status-dot yellow"></span>
        <span>Tours API not available</span>
      </div>`;
  } else {
    statusBar.className = 'status-bar status-ok';
    statusBar.innerHTML = `
      <div class="status-line">
        <span class="status-dot green"></span>
        <span>PostHog v${esc(state.version || '?')} detected</span>
      </div>
      <div class="status-line">
        <span class="status-dot green"></span>
        <span>Tours API: Available</span>
      </div>`;
  }
}

function renderAll() {
  renderStatus();
  renderTours();
}

// --- Tours Panel ---
function renderTours() {
  if (!state.posthogDetected || !state.versionOk || !state.toursEnabled) {
    toursPanel.innerHTML = '';
    return;
  }

  if (state.loading) {
    renderLoading();
    return;
  }

  let html = '';

  // Active tour/announcement banner
  if (state.storage.activeTour) {
    const active = state.storage.activeTour;
    const activeTourObj = findTourById(active.tourId);
    const tourName = getTourName(active.tourId) || active.name || active.tourId || 'Unknown';
    const isAnn = activeTourObj ? isAnnouncement(activeTourObj) : false;
    const label = isAnn ? 'Active Announcement' : 'Active Tour';

    let stepInfo = '';
    if (!isAnn) {
      const totalSteps = activeTourObj ? (activeTourObj.steps || []).length : active.totalSteps;
      if (active.stepIndex != null && totalSteps) {
        stepInfo = `Step ${active.stepIndex + 1} of ${totalSteps}`;
      } else if (active.currentStep != null && active.totalSteps) {
        stepInfo = `Step ${active.currentStep + 1} of ${active.totalSteps}`;
      }
    }

    html += `
      <div class="active-tour-banner">
        <div class="active-tour-banner-label">${esc(label)}</div>
        <div class="active-tour-banner-header">
          <span class="active-tour-banner-title">${esc(tourName)}</span>
          ${stepInfo ? `<span class="active-tour-banner-step">${esc(stepInfo)}</span>` : ''}
        </div>
        <div class="active-tour-actions">
          ${isAnn ? '' : '<button class="btn btn-secondary btn-small" data-action="previousStep">Prev</button>'}
          ${isAnn ? '' : '<button class="btn btn-secondary btn-small" data-action="nextStep">Next</button>'}
          <button class="btn btn-danger btn-small" data-action="dismissTour">Dismiss</button>
        </div>
      </div>`;
  }

  // Global actions
  html += `
    <div class="global-actions">
      <button class="btn btn-secondary btn-small" data-action="resetAllTours">Reset All Tours</button>
      <button class="btn btn-secondary btn-small" data-action="clearCache">Clear Cache</button>
    </div>`;

  const filteredTours = state.tours.filter((tour) => {
    if (!state.filterText) return true;
    const id = String(tour.id || '').toLowerCase();
    const name = String(tour.name || '').toLowerCase();
    const query = state.filterText.toLowerCase();
    return id.includes(query) || name.includes(query);
  });

  if (filteredTours.length === 0) {
    html += state.filterText
      ? '<div class="empty-state">No tours match the filter</div>'
      : '<div class="empty-state">No tours found</div>';
  } else {
    for (const tour of filteredTours) {
      html += renderTourCard(tour);
    }
  }

  toursPanel.innerHTML = html;
}

function renderLoading() {
  toursPanel.innerHTML = `
    <div class="loading">
      <span class="spinner"></span>
      <span>Loading tours...</span>
    </div>`;
}

function renderTourCard(tour) {
  const tourId = tour.id || '';
  const tourName = tour.name || 'Unnamed Tour';
  const steps = tour.steps || [];
  const stepTypes = new Set(steps.map((s) => s.type || 'unknown'));

  let html = `<div class="tour-card" data-tour-id="${esc(tourId)}">`;

  // Header
  html += `
    <div class="tour-card-header">
      <div>
        <div class="tour-name">${esc(tourName)}</div>
        <div class="tour-id" data-copy="${esc(tourId)}" title="Click to copy">ID: ${esc(tourId)}</div>
      </div>
    </div>`;

  // Meta badges
  const ann = isAnnouncement(tour);
  html += '<div class="tour-meta">';
  if (ann) {
    html += `<span class="badge badge-blue">Announcement</span>`;
  } else {
    html += `<span class="badge badge-blue">${steps.length} steps</span>`;
  }
  for (const t of stepTypes) {
    html += `<span class="badge badge-gray">${esc(t)}</span>`;
  }
  if (tour.display_frequency) {
    html += `<span class="badge badge-orange">${esc(tour.display_frequency)}</span>`;
  }
  html += '</div>';

  // Eligibility checklist
  html += renderEligibility(tour);

  // Storage status
  html += renderTourStorage(tourId);

  // Actions
  const showLabel = ann ? 'Show' : 'Show Tour';
  html += `
    <div class="tour-actions">
      <button class="btn btn-primary btn-small" data-action="showTour" data-tour-id="${esc(tourId)}">${showLabel}</button>
      <button class="btn btn-secondary btn-small" data-action="resetTour" data-tour-id="${esc(tourId)}">Reset</button>
    </div>`;

  html += '</div>';
  return html;
}

function renderEligibility(tour) {
  let html = '<div class="eligibility"><div class="eligibility-title">Eligibility</div>';

  // 1. Launch status (derived from start_date / end_date)
  if (!tour.start_date && !tour.end_date) {
    html += eligibilityItem(false, 'Not launched');
  } else if (tour.start_date && !tour.end_date) {
    html += eligibilityItem(true, `Launched ${formatDate(tour.start_date)}`);
  } else {
    html += eligibilityItem(false, `Stopped (${formatDate(tour.start_date)} \u2013 ${formatDate(tour.end_date)})`);
  }

  // 2. URL condition (matches checkTourConditions -> doesTourUrlMatch)
  if (tour.conditions?.url) {
    const urlMatch = doesTourUrlMatch(tour);
    const matchType = tour.conditions.urlMatchType || 'icontains';
    html += eligibilityItem(urlMatch, `URL (${matchType}): ${tour.conditions.url}`);
  } else {
    html += eligibilityItem(null, 'URL condition: Not set');
  }

  // 3. Frequency (SDK defaults to 'until_interacted' when not set)
  const frequency = tour.display_frequency ?? 'until_interacted';
  const tourId = tour.id;
  const shown = hasStorageKey(state.storage.shown, tourId);
  const completed = hasStorageKey(state.storage.completed, tourId);
  const dismissed = hasStorageKey(state.storage.dismissed, tourId);

  if (frequency === 'show_once') {
    const blocked = shown;
    html += eligibilityItem(!blocked, `Frequency (once): ${blocked ? 'Already shown' : 'Not yet shown'}`);
  } else if (frequency === 'until_interacted') {
    const blocked = completed || dismissed;
    const defaultNote = !tour.display_frequency ? ' (default)' : '';
    html += eligibilityItem(!blocked, `Frequency (until interacted${defaultNote}): ${blocked ? 'Already interacted' : 'Not yet interacted'}`);
  } else if (frequency === 'always') {
    html += eligibilityItem(true, 'Frequency: Always');
  } else {
    html += eligibilityItem(null, `Frequency: ${frequency}`);
  }

  // 4. Internal targeting flag
  if (tour.internal_targeting_flag_key) {
    const flagVal = state.flags[tour.internal_targeting_flag_key];
    const pass = flagVal !== undefined && flagVal !== false && flagVal !== null;
    const reason = getFlagReason(tour.internal_targeting_flag_key);
    const label = pass ? 'Enabled' : 'Disabled';
    const reasonText = reason ? ` — ${reason}` : '';
    html += eligibilityItem(pass, `Targeting flag: ${label}${reasonText}`);
  } else {
    html += eligibilityItem(null, 'Targeting flag: Not set');
  }

  // 5. Linked flag with variant check (matches _isProductToursFeatureFlagEnabled)
  if (tour.linked_flag_key) {
    const flagVal = state.flags[tour.linked_flag_key];
    const flagEnabled = flagVal !== undefined && flagVal !== false && flagVal !== null;
    const reason = getFlagReason(tour.linked_flag_key);
    const reasonText = reason ? ` — ${reason}` : '';
    const variant = tour.conditions?.linkedFlagVariant;

    if (variant) {
      const variantMatch = variant === 'any' || flagVal === variant;
      const pass = flagEnabled && variantMatch;
      const detail = !flagEnabled
        ? `Disabled${reasonText}`
        : variantMatch
          ? `Enabled (variant: ${variant})`
          : `Wrong variant (expected: ${variant}, got: ${flagVal})`;
      html += eligibilityItem(pass, `Linked flag: ${detail}`);
    } else {
      html += eligibilityItem(flagEnabled, `Linked flag: ${flagEnabled ? 'Enabled' : `Disabled${reasonText}`}`);
    }
  } else {
    html += eligibilityItem(null, 'Linked flag: Not set');
  }

  html += '</div>';
  return html;
}

function eligibilityItem(pass, text) {
  let cls, icon;
  if (pass === true) { cls = 'pass'; icon = '\u2713'; }
  else if (pass === false) { cls = 'fail'; icon = '\u2717'; }
  else { cls = 'na'; icon = '\u2014'; }

  return `<div class="eligibility-item">
    <span class="eligibility-icon ${cls}">${icon}</span>
    <span>${esc(text)}</span>
  </div>`;
}

function hasStorageKey(storageObj, tourId) {
  if (!storageObj) return false;
  return Object.keys(storageObj).some((k) => k.includes(tourId));
}

function renderTourStorage(tourId) {
  const shown = hasStorageKey(state.storage.shown, tourId);
  const completed = hasStorageKey(state.storage.completed, tourId);
  const dismissed = hasStorageKey(state.storage.dismissed, tourId);

  if (!shown && !completed && !dismissed) return '';

  let html = '<div class="tour-storage">';
  if (shown) html += '<span class="badge badge-blue">Shown</span>';
  if (completed) html += '<span class="badge badge-green">Completed</span>';
  if (dismissed) html += '<span class="badge badge-orange">Dismissed</span>';
  html += '</div>';
  return html;
}

// --- Helpers ---

function getTourName(tourId) {
  const tour = state.tours.find((t) => t.id === tourId);
  return tour ? tour.name || 'Unnamed Tour' : null;
}

function isAnnouncement(tour) {
  return (tour.steps || []).length === 1;
}

function findTourById(tourId) {
  return state.tours.find((t) => t.id === tourId);
}

function getFlagReason(flagKey) {
  const detail = state.flagDetails[flagKey];
  if (!detail?.reason) return null;
  return detail.reason.description || detail.reason.code || null;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function normalizeUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function doesTourUrlMatch(tour) {
  const conditions = tour.conditions;
  if (!conditions?.url) return true;

  const href = state.pageUrl;
  if (!href) return false;

  const matchType = conditions.urlMatchType || 'icontains';

  if (matchType === 'exact') {
    return normalizeUrl(href) === normalizeUrl(conditions.url);
  }
  if (matchType === 'is_not') {
    return normalizeUrl(href) !== normalizeUrl(conditions.url);
  }
  if (matchType === 'icontains') {
    return href.toLowerCase().includes(conditions.url.toLowerCase());
  }
  if (matchType === 'not_icontains') {
    return !href.toLowerCase().includes(conditions.url.toLowerCase());
  }
  if (matchType === 'regex') {
    try { return new RegExp(conditions.url).test(href); } catch { return false; }
  }
  if (matchType === 'not_regex') {
    try { return !new RegExp(conditions.url).test(href); } catch { return true; }
  }

  return false;
}

// --- Enable Debug ---
function enableDebugAndReload() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url || !tab.id) return;

    const url = new URL(tab.url);
    if (!url.searchParams.has('__posthog_debug')) {
      url.searchParams.set('__posthog_debug', 'true');
      chrome.tabs.update(tab.id, { url: url.toString() });
    } else {
      // Param already present — just reload to retry detection
      chrome.tabs.reload(tab.id);
    }
  });
}

// --- Event Handlers ---
refreshBtn.addEventListener('click', () => refreshAll());

// --- Event Delegation ---
async function doAction(action, payload) {
  const res = await sendAction(action, payload);
  if (res.error) {
    console.warn(`Action ${action} failed:`, res.error);
    showToast(res.error, 'error');
  }
  await refreshAll();
}

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.textContent = String(message || 'Something went wrong');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function showCopiedTooltip() {
  const el = document.createElement('div');
  el.className = 'copied-tooltip';
  el.textContent = 'Copied!';
  el.style.top = '8px';
  el.style.right = '8px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// Delegate clicks on dynamically rendered content
document.body.addEventListener('click', (e) => {
  // data-action buttons (doAction)
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    const tourId = actionBtn.dataset.tourId;
    const payload = tourId ? { tourId } : undefined;
    doAction(action, payload);
    return;
  }

  // enableDebugBtn
  if (e.target.closest('#enableDebugBtn')) {
    enableDebugAndReload();
    return;
  }

  // data-copy elements
  const copyEl = e.target.closest('[data-copy]');
  if (copyEl) {
    navigator.clipboard.writeText(copyEl.dataset.copy).then(() => {
      showCopiedTooltip();
    });
    return;
  }

});

// --- Utility ---
function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// --- Poll for active tour changes ---
let pollTimer = null;

async function pollActiveTour() {
  const prevActive = JSON.stringify(state.storage.activeTour);
  await fetchStorage();
  const newActive = JSON.stringify(state.storage.activeTour);

  if (prevActive !== newActive) {
    renderTours();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollActiveTour, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// --- Auto-refresh on tab changes ---
chrome.tabs.onActivated.addListener(() => {
  refreshAll();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    refreshAll();
  }
});

// --- Init ---
refreshAll().then(startPolling);

tourFilterInput?.addEventListener('input', (e) => {
  state.filterText = e.target.value.trim();
  renderTours();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    refreshAll().then(startPolling);
  }
});
