const elements = {
  updated: document.getElementById('updated'),
  status: document.getElementById('status'),
  search: document.getElementById('search'),
  conferenceList: document.getElementById('conference-list'),
  conferenceCount: document.getElementById('conference-count'),
  relatedDetails: document.getElementById('related-details'),
  relatedList: document.getElementById('related-list'),
  relatedCount: document.getElementById('related-count'),
  modal: document.getElementById('item-modal'),
  modalContent: document.getElementById('item-modal-content'),
};

const conferenceNames = {
  CoRL: 'Conference on Robot Learning',
  Humanoids: 'IEEE-RAS International Conference on Humanoid Robots',
  ICRA: 'IEEE International Conference on Robotics and Automation',
  IROS: 'IEEE/RSJ International Conference on Intelligent Robots and Systems',
  NeurIPS: 'Conference on Neural Information Processing Systems',
  RSS: 'Robotics: Science and Systems',
  RoboSoft: 'IEEE International Conference on Soft Robotics',
};

const conferenceOrder = ['CoRL', 'ICRA', 'IROS', 'RSS', 'NeurIPS', 'Humanoids', 'RoboSoft'];
const deadlineTypes = new Set(['abstract', 'paper']);
let allItems = [];
let view = 'all';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.href) : '';
  } catch {
    return '';
  }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isUpcoming(item) {
  const date = parseDate(item.date);
  return Boolean(date && date >= todayStart());
}

function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(undefined, options).format(date) : 'Date not announced';
}

function formatDistance(value) {
  const date = parseDate(value);
  if (!date) return 'Date TBA';
  const days = Math.round((date.getTime() - todayStart().getTime()) / 86400000);
  if (days < 0) return 'Passed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

function titleCase(value) {
  return String(value || 'deadline').replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase());
}

// Keep the main submission tracks above the fold. A workshop proposal with the
// same short title as its parent conference is still a related call.
function isMainTrack(item) {
  if (item.type === 'workshop') return false;
  if (item.title === item.conference) return true;
  if (item.conference === 'NeurIPS' && /^NeurIPS 2026 (Main|Evaluations & Datasets|Position Paper) Track/.test(item.title)) return true;
  if (item.conference === 'ICRA' && /^ICRA 2026 main conference/.test(item.title)) return true;
  return false;
}

function matches(item, query) {
  return [item.conference, conferenceNames[item.conference], item.title, item.type, item.notes]
    .join(' ').toLowerCase().includes(query);
}

function sortByDate(a, b) {
  return (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31') || a.title.localeCompare(b.title);
}

function primaryDeadline(items) {
  const core = items.filter((item) => deadlineTypes.has(item.type) && item.date);
  const upcoming = core.filter(isUpcoming).sort(sortByDate);
  if (upcoming.length) return { item: upcoming[0], upcoming: true };
  const latest = core.sort((a, b) => b.date.localeCompare(a.date))[0];
  return { item: latest || null, upcoming: false };
}

function renderConference(name, items) {
  const { item: primary, upcoming } = primaryDeadline(items);
  const upcomingMilestones = items.filter((item) => item.date && isUpcoming(item) && item !== primary).sort(sortByDate).slice(0, 3);
  const source = safeUrl(primary?.source || items.find((item) => safeUrl(item.source))?.source);
  const shortDate = upcoming ? formatDate(primary.date, { month: 'short', day: 'numeric' }) : 'TBA';
  const year = upcoming ? parseDate(primary.date).getFullYear() : '';
  const status = upcoming ? formatDistance(primary.date) : 'No upcoming main deadline listed';
  const pastInfo = !upcoming && primary
    ? `<span class="last-date">Last listed ${escapeHtml(primary.type)} deadline: ${escapeHtml(formatDate(primary.date))} · passed</span>`
    : '';
  const milestones = upcomingMilestones.length
    ? `<div class="milestones">${upcomingMilestones.map((item) => `<button type="button" class="milestone" data-item-index="${allItems.indexOf(item)}"><span>${escapeHtml(titleCase(item.type))}</span><strong>${escapeHtml(formatDate(item.date))}</strong></button>`).join('')}</div>`
    : '';
  const sourceLink = source ? `<a class="source-action" href="${source}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : '';

  return `<article class="conference-card${upcoming ? ' has-upcoming' : ''}">
    <div class="date-block${upcoming ? '' : ' is-tba'}" aria-label="${escapeHtml(upcoming ? formatDate(primary.date) : 'Next deadline not announced')}">
      <strong>${escapeHtml(shortDate)}</strong><span>${escapeHtml(year || 'next call')}</span>
    </div>
    <div class="conference-main">
      <div class="conference-topline"><span class="conference-code">${escapeHtml(name)}</span><span class="conference-status${upcoming ? ' is-upcoming' : ''}">${escapeHtml(status)}</span></div>
      <h3>${escapeHtml(conferenceNames[name] || name)}</h3>
      <div class="conference-bottom">${upcoming ? `<span class="deadline-type">${escapeHtml(titleCase(primary.type))} deadline</span>` : pastInfo}${sourceLink}</div>
      ${milestones}
    </div>
    ${primary ? `<button class="card-open" type="button" data-item-index="${allItems.indexOf(primary)}" aria-label="Details for ${escapeHtml(name)}">↗</button>` : ''}
  </article>`;
}

function renderRelatedGroup(name, items, query) {
  const sorted = [...items].sort((a, b) => {
    const difference = Number(isUpcoming(b)) - Number(isUpcoming(a));
    return difference || sortByDate(a, b);
  });
  return `<details class="related-group"${query ? ' open' : ''}>
    <summary><span><strong>${escapeHtml(name)}</strong><small>${items.length} call${items.length === 1 ? '' : 's'}</small></span><span class="chevron" aria-hidden="true">⌄</span></summary>
    <div class="related-rows">${sorted.map((item) => `<button class="related-row" type="button" data-item-index="${allItems.indexOf(item)}">
      <span class="related-title">${escapeHtml(item.title || item.conference)}</span>
      <span class="related-kind">${escapeHtml(titleCase(item.type))}</span>
      <span class="related-date${isUpcoming(item) ? ' is-upcoming' : ''}">${escapeHtml(item.date ? formatDate(item.date) : 'TBA')}</span>
      <span class="related-arrow" aria-hidden="true">↗</span>
    </button>`).join('')}</div>
  </details>`;
}

function sourceLinks(item) {
  const sources = [{ url: item.source, label: 'Primary source' }, ...(item.alternate_sources || []).map((source) => ({ url: source.url, label: source.note || titleCase(source.kind) }))];
  return sources.filter((source) => safeUrl(source.url)).map((source) => `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} ↗</a>`).join('');
}

function openDetails(item) {
  const notes = item.notes ? `<section><h3>Notes</h3><p>${escapeHtml(item.notes)}</p></section>` : '';
  const conflict = item.conflict_note ? `<section class="notice"><h3>Source discrepancy</h3><p>${escapeHtml(item.conflict_note)}</p></section>` : '';
  const extension = item.is_extension && item.change_summary ? `<section><h3>Extension</h3><p>${escapeHtml(item.change_summary)}</p></section>` : '';
  const expectations = Array.isArray(item.expectations_summary) && item.expectations_summary.length
    ? `<section><h3>Submission details</h3><ul>${item.expectations_summary.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></section>` : '';
  const links = sourceLinks(item);
  elements.modalContent.innerHTML = `<div class="modal-header"><span class="modal-code">${escapeHtml(item.conference)}</span><span class="modal-type">${escapeHtml(titleCase(item.type))}</span></div>
    <h2>${escapeHtml(item.title || item.conference)}</h2>
    <p class="modal-date">${escapeHtml(formatDate(item.date))}<span>${escapeHtml(formatDistance(item.date))}</span></p>
    ${extension}${conflict}${notes}${expectations}
    ${links ? `<section><h3>Sources</h3><div class="modal-sources">${links}</div></section>` : ''}`;
  elements.modal.showModal();
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const conferenceItems = allItems.filter(isMainTrack);
  const relatedItems = allItems.filter((item) => !isMainTrack(item));
  const names = [...new Set(conferenceItems.map((item) => item.conference))]
    .sort((a, b) => conferenceOrder.indexOf(a) - conferenceOrder.indexOf(b));
  const visibleNames = names.filter((name) => {
    const entries = conferenceItems.filter((item) => item.conference === name);
    if (view === 'upcoming' && !primaryDeadline(entries).upcoming) return false;
    return !query || name.toLowerCase().includes(query) || (conferenceNames[name] || '').toLowerCase().includes(query) || entries.some((item) => matches(item, query));
  });

  elements.conferenceCount.textContent = `${visibleNames.length} tracked`;
  elements.conferenceList.innerHTML = visibleNames.length
    ? visibleNames.map((name) => renderConference(name, conferenceItems.filter((item) => item.conference === name))).join('')
    : `<p class="empty-state">${view === 'upcoming' && !query ? 'No upcoming main conference deadlines are currently listed.' : 'No matching main conferences.'}</p>`;

  const visibleRelated = relatedItems.filter((item) => matches(item, query));
  const relatedNames = [...new Set(visibleRelated.map((item) => item.conference))]
    .sort((a, b) => conferenceOrder.indexOf(a) - conferenceOrder.indexOf(b));
  elements.relatedCount.textContent = `${visibleRelated.length} ${visibleRelated.length === 1 ? 'entry' : 'entries'}`;
  elements.relatedList.innerHTML = relatedNames.length
    ? relatedNames.map((name) => renderRelatedGroup(name, visibleRelated.filter((item) => item.conference === name), query)).join('')
    : '<p class="empty-state">No matching workshops or related calls.</p>';
  if (query && visibleRelated.length && !visibleNames.length) elements.relatedDetails.open = true;

  const upcomingCount = names.filter((name) => primaryDeadline(conferenceItems.filter((item) => item.conference === name)).upcoming).length;
  elements.status.textContent = upcomingCount
    ? `${upcomingCount} conference${upcomingCount === 1 ? '' : 's'} with a future main deadline in this snapshot.`
    : 'No future main-track submission dates are listed in this snapshot. Past dates are labeled below; new calls will appear when the data is updated.';
  elements.status.classList.toggle('is-warning', !upcomingCount);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-item-index]');
  if (!button) return;
  const item = allItems[Number(button.dataset.itemIndex)];
  if (item) openDetails(item);
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach((other) => {
      const active = other === button;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});

elements.search.addEventListener('input', render);
elements.modal.addEventListener('click', (event) => {
  if (event.target === elements.modal) elements.modal.close();
});

fetch('data/deadlines.json')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    allItems = Array.isArray(data.items) ? data.items : [];
    elements.updated.textContent = `Data last checked ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(data.updated_at))}`;
    render();
  })
  .catch((error) => {
    elements.updated.textContent = 'Deadline data unavailable';
    elements.status.textContent = `Could not load deadlines (${error.message}).`;
    elements.conferenceList.innerHTML = '<p class="empty-state">Please try refreshing this page.</p>';
  });
