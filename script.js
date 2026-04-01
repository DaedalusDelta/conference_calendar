const calendar = document.getElementById('calendar');
const timeline = document.getElementById('timeline');
const grid = document.getElementById('grid');
const pastGrid = document.getElementById('past-grid');
const pastCount = document.getElementById('past-count');
const updated = document.getElementById('updated');
const changeBanner = document.getElementById('change-banner');
const search = document.getElementById('search');
const itemModal = document.getElementById('item-modal');
const itemModalContent = document.getElementById('item-modal-content');
const statUpcoming = document.getElementById('stat-upcoming');
const statUrgent = document.getElementById('stat-urgent');
const statExtensions = document.getElementById('stat-extensions');
const statConflicts = document.getElementById('stat-conflicts');
const filterChips = Array.from(document.querySelectorAll('.filter-chip'));
const sidebarMonths = document.getElementById('sidebar-months');
const sidebarConferences = document.getElementById('sidebar-conferences');

let allItems = [];
let activeFilter = 'all';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isPastDeadline(value) {
  const date = parseDate(value);
  if (!date) return false;
  return date < getTodayStart();
}

function isWithinPastDays(value, daysBack) {
  const days = getDaysUntil(value);
  return days !== null && days < 0 && days >= -daysBack;
}

function isApproachingThisMonth(value) {
  const date = parseDate(value);
  if (!date) return false;
  const today = getTodayStart();
  return (
    date >= today &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMonthKey(value) {
  const date = parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getSourceKindLabel(value) {
  return value ? value.replaceAll('_', ' ') : 'official source';
}

function getConferenceHue(name) {
  let hash = 0;
  for (const char of String(name || '')) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return (hash + 360) % 360;
}

function getConferenceStyle(name) {
  const hue = getConferenceHue(name);
  return `--conference-accent: hsl(${hue} 55% 42%); --conference-accent-soft: hsl(${hue} 72% 94%);`;
}

function getItemKind(item) {
  return item.title && item.title !== item.conference ? 'Workshop' : 'Conference';
}

function getDaysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = getTodayStart();
  const diffMs = date.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

function formatDeadlineDistance(value) {
  const days = getDaysUntil(value);
  if (days === null) return 'Date unavailable';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

function itemMatchesQuery(item, query) {
  if (!query) return true;
  const alternateSourceText = Array.isArray(item.alternate_sources)
    ? item.alternate_sources.map((source) => `${source.kind} ${source.note} ${source.url}`).join(' ')
    : '';

  return [
    item.conference,
    item.title,
    item.type,
    item.date,
    item.raw,
    item.notes,
    item.conflict_note,
    item.source_kind,
    item.source,
    alternateSourceText,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function matchesActiveFilter(item) {
  if (activeFilter === 'urgent') return isApproachingThisMonth(item.date);
  if (activeFilter === 'changed') return Boolean(item.is_extension);
  if (activeFilter === 'conflicts') return Boolean(item.conflict_note);
  if (activeFilter === 'workshops') return item.title && item.title !== item.conference;
  return true;
}

function getLaneLabel(item) {
  const days = getDaysUntil(item.date);
  if (days === null) return 'Archive';
  if (days < -7) return 'Archive';
  if (days < 0) return 'Past 7 Days';
  if (days <= 0) return 'Today';
  if (days <= 7) return 'This Week';
  if (days <= 31) return 'This Month';
  return 'Later';
}

function getSourceConfidence(item) {
  if (item.used_fallback_year) return 'Fallback year';
  if (item.conflict_note && item.source_kind === 'website') return 'Mixed sources';
  if (item.source_kind === 'website') return 'Official site';
  if (item.source_kind === 'submission_portal') return 'Portal-backed';
  return 'Mixed sources';
}

function renderEmptyState(target, message) {
  target.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderSidebarLinks(target, entries, emptyLabel, prefix, sectionId, sectionLabel) {
  if (!target) return;
  if (!entries.length) {
    target.innerHTML = `<span class="sidebar-empty">${escapeHtml(emptyLabel)}</span>`;
    return;
  }

  const links = [];
  if (sectionId && sectionLabel) {
    links.push(`<a href="#${escapeHtml(sectionId)}">${escapeHtml(sectionLabel)}</a>`);
  }
  links.push(...entries.map((entry) => `<a href="#${escapeHtml(prefix + entry.id)}">${escapeHtml(entry.label)}</a>`));
  target.innerHTML = links.join('');
}

function renderChangeBanner(summary) {
  if (!summary || typeof summary !== 'object') {
    changeBanner.innerHTML = '';
    return;
  }

  const extendedCount = Number(summary.extended || 0);

  if (!extendedCount) {
    changeBanner.innerHTML = `
      <div class="change-banner-inner">
        <strong>No extensions detected in the latest refresh.</strong>
      </div>
    `;
    return;
  }

  changeBanner.innerHTML = `
    <div class="change-banner-inner">
      <strong>Latest refresh:</strong>
      <span class="pill extension">${extendedCount} extended</span>
    </div>
  `;
}

function updateStats(items) {
  const upcoming = items.filter((item) => item.date && !isPastDeadline(item.date)).length;
  const urgent = items.filter((item) => isApproachingThisMonth(item.date)).length;
  const extensions = items.filter((item) => item.is_extension).length;
  const conflicts = items.filter((item) => item.conflict_note).length;

  statUpcoming.textContent = String(upcoming);
  statUrgent.textContent = String(urgent);
  statExtensions.textContent = String(extensions);
  statConflicts.textContent = String(conflicts);
}

function renderSourceLinks(item) {
  const primary = item.source
    ? `
      <a class="source-link primary" href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">
        Primary source
        <span>${escapeHtml(getSourceKindLabel(item.source_kind))}</span>
      </a>
    `
    : '';

  const alternates = Array.isArray(item.alternate_sources) ? item.alternate_sources : [];
  const alternateMarkup = alternates
    .map(
      (source) => `
        <a class="source-link secondary" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(getSourceKindLabel(source.kind))}
          <span>${escapeHtml(source.note || 'Additional source')}</span>
        </a>
      `
    )
    .join('');

  if (!primary && !alternateMarkup) {
    return '';
  }

  return `
    <div class="source-stack">
      ${primary}
      ${alternateMarkup}
    </div>
  `;
}

function buildDetailMarkup(item) {
  const extension = item.is_extension ? '<span class="pill extension">Extended</span>' : '';
  const conflict = item.conflict_note ? '<span class="pill conflict">Conflict</span>' : '';
  const urgent = isApproachingThisMonth(item.date) ? '<span class="pill urgent">Due this month</span>' : '';
  const distance = `<span class="distance-chip">${escapeHtml(formatDeadlineDistance(item.date))}</span>`;
  const title = item.title && item.title !== item.conference
    ? `<p class="modal-parent">${escapeHtml(item.conference)}</p>`
    : '';
  const changeText = item.is_extension && item.change_summary
    ? `<div class="modal-block"><h4>Latest change</h4><p>${escapeHtml(item.change_summary)}</p></div>`
    : '';
  const notes = item.notes
    ? `<div class="modal-block"><h4>Notes</h4><p>${escapeHtml(item.notes)}</p></div>`
    : '';
  const conflictText = item.conflict_note
    ? `<div class="modal-block"><h4>Conflict</h4><p>${escapeHtml(item.conflict_note)}</p></div>`
    : '';
  const evidence = item.raw
    ? `<div class="modal-block"><h4>Evidence</h4><p>${escapeHtml(item.raw)}</p></div>`
    : '';
  const expectations = Array.isArray(item.expectations_summary) && item.expectations_summary.length
    ? `
      <div class="modal-block">
        <h4>Submission expectations</h4>
        <ul class="modal-list">
          ${item.expectations_summary
            .map((entry) => `<li>${escapeHtml(entry)}</li>`)
            .join('')}
        </ul>
      </div>
    `
    : '';
  const previousDate = item.previous_date
    ? `<div class="modal-fact"><span>Previous date</span><strong>${escapeHtml(formatDate(item.previous_date))}</strong></div>`
    : '';
  const sourceConfidence = getSourceConfidence(item);

  return `
    <div class="modal-frame" style="${getConferenceStyle(item.conference)}">
    <div class="modal-header">
      <div class="modal-header-copy">
        <div class="modal-meta">
          <span class="conference-chip">${escapeHtml(item.conference)}</span>
          <span class="kind-chip">${escapeHtml(getItemKind(item))}</span>
          ${distance}
          <span class="entry-type">${escapeHtml(item.type)}</span>
          ${urgent}
          ${extension}
          ${conflict}
        </div>
        <h2>${escapeHtml(item.title || item.conference)}</h2>
        ${title}
        <p class="modal-date">${escapeHtml(formatDate(item.date))}</p>
      </div>
    </div>
    <div class="modal-facts">
      <div class="modal-fact"><span>Conference</span><strong>${escapeHtml(item.conference)}</strong></div>
      <div class="modal-fact"><span>Scope</span><strong>${escapeHtml(getItemKind(item))}</strong></div>
      <div class="modal-fact"><span>Source winner</span><strong>${escapeHtml(getSourceKindLabel(item.source_kind))}</strong></div>
      <div class="modal-fact"><span>Source confidence</span><strong>${escapeHtml(sourceConfidence)}</strong></div>
      ${previousDate}
    </div>
    ${changeText}
    ${notes}
    ${conflictText}
    ${expectations}
    ${evidence}
    <div class="modal-block">
      <h4>Sources</h4>
      ${renderSourceLinks(item)}
    </div>
    </div>
  `;
}

function openItemModal(item) {
  itemModalContent.innerHTML = buildDetailMarkup(item);
  itemModal.showModal();
}

function attachItemOpenHandlers(target) {
  target.querySelectorAll('[data-item-index]').forEach((node) => {
    node.addEventListener('click', () => {
      const index = Number(node.getAttribute('data-item-index'));
      const item = allItems[index];
      if (item) openItemModal(item);
    });
  });
}

function renderTimeline(items) {
  const timelineItems = [...items]
    .filter((item) => item.date && !isPastDeadline(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.conference.localeCompare(b.conference))
    .slice(0, 8);

  if (!timelineItems.length) {
    renderEmptyState(timeline, 'No upcoming deadlines are available for the current filter.');
    return;
  }

  timeline.innerHTML = timelineItems
    .map((item, index) => {
      const urgent = isApproachingThisMonth(item.date) ? ' urgent' : '';
      const extension = item.is_extension ? '<span class="pill extension">Extended</span>' : '';
      const conflict = item.conflict_note ? '<span class="pill conflict">Conflict</span>' : '';
      const distance = formatDeadlineDistance(item.date);
      const parent = item.title && item.title !== item.conference
        ? `<p class="timeline-parent">${escapeHtml(item.conference)}</p>`
        : '';

      return `
        <button class="timeline-item${urgent}" type="button" data-item-index="${allItems.indexOf(item)}" style="${getConferenceStyle(item.conference)} animation-delay: ${index * 45}ms">
          <div class="summary-top">
            <span class="conference-chip">${escapeHtml(item.conference)}</span>
            <span class="distance-chip">${escapeHtml(distance)}</span>
          </div>
          <h3>${escapeHtml(item.title || item.conference)}</h3>
          ${parent}
          <p class="timeline-date">${escapeHtml(formatDate(item.date))}</p>
          <div class="timeline-meta">
            <span class="kind-chip">${escapeHtml(getItemKind(item))}</span>
            <span class="entry-type">${escapeHtml(item.type)}</span>
            ${extension}
            ${conflict}
          </div>
        </button>
      `;
    })
    .join('');

  attachItemOpenHandlers(timeline);
}

function renderCalendar(items) {
  const datedItems = items
    .filter((item) => item.date && !isPastDeadline(item.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.conference.localeCompare(b.conference));

  if (!datedItems.length) {
    renderEmptyState(calendar, 'No upcoming dated deadlines are available for the current filter.');
    renderSidebarLinks(sidebarMonths, [], 'No visible months', 'month-', 'calendar-section', 'Section top');
    return;
  }

  const groups = new Map();
  for (const item of datedItems) {
    const monthKey = item.date.slice(0, 7);
    if (!groups.has(monthKey)) groups.set(monthKey, []);
    groups.get(monthKey).push(item);
  }

  calendar.innerHTML = Array.from(groups.entries())
    .map(([monthKey, monthItems], monthIndex) => {
      const monthLabel = formatMonthKey(`${monthKey}-01`);
      const datedCount = monthItems.length;
      const monthId = `month-${monthKey}`;
      const listMarkup = monthItems
        .map((item) => {
          const date = parseDate(item.date);
          const day = date
            ? new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(date)
            : '--';
          const weekday = date
            ? new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
            : '';
          const extension = item.is_extension ? '<span class="pill extension">Extension</span>' : '';
          const conflict = item.conflict_note ? '<span class="pill conflict">Conflict</span>' : '';
          const urgentClass = isApproachingThisMonth(item.date) ? ' urgent' : '';
          const distance = formatDeadlineDistance(item.date);
          const parent = item.title && item.title !== item.conference
            ? `<p class="calendar-parent">${escapeHtml(item.conference)}</p>`
            : '';

          return `
            <button class="calendar-item${urgentClass}" type="button" data-item-index="${allItems.indexOf(item)}" style="${getConferenceStyle(item.conference)}">
              <div class="calendar-date${urgentClass}">
                <span class="calendar-day">${escapeHtml(day)}</span>
                <span class="calendar-label">${escapeHtml(weekday)}</span>
              </div>
              <div class="calendar-item-body">
                <div class="summary-top">
                  <span class="conference-chip">${escapeHtml(item.conference)}</span>
                  <span class="distance-chip">${escapeHtml(distance)}</span>
                </div>
                <h4>${escapeHtml(item.title || item.conference)}</h4>
                ${parent}
                <div class="calendar-meta">
                  <span class="kind-chip">${escapeHtml(getItemKind(item))}</span>
                  <span class="entry-type">${escapeHtml(item.type)}</span>
                  ${extension}
                  ${conflict}
                </div>
              </div>
            </button>
          `;
        })
        .join('');

      return `
        <section id="${escapeHtml(monthId)}" class="month-card" style="animation-delay: ${monthIndex * 70}ms">
          <div class="month-card-header">
            <h3>${escapeHtml(monthLabel)}</h3>
            <span class="month-count">${datedCount} deadline${datedCount === 1 ? '' : 's'}</span>
          </div>
          <div class="month-list">${listMarkup}</div>
        </section>
      `;
    })
    .join('');

  attachItemOpenHandlers(calendar);
  renderSidebarLinks(
    sidebarMonths,
    Array.from(groups.keys()).map((monthKey) => ({
      id: monthKey,
      label: formatMonthKey(`${monthKey}-01`),
    })),
    'No visible months',
    'month-',
    'calendar-section',
    'Section top',
  );
}

function renderGroupedEntries(target, items, emptyMessage) {
  const sortedItems = [...items].sort((a, b) => {
    const aPast = isPastDeadline(a.date);
    const bPast = isPastDeadline(b.date);
    if (aPast !== bPast) return aPast ? 1 : -1;
    const aKey = a.date || '9999-12-31';
    const bKey = b.date || '9999-12-31';
    return aKey.localeCompare(bKey) || a.conference.localeCompare(b.conference);
  });

  if (!sortedItems.length) {
    renderEmptyState(target, emptyMessage);
    if (target === grid) {
      renderSidebarLinks(sidebarConferences, [], 'No visible conferences', 'conference-', 'entries-section', 'Section top');
    }
    return;
  }

  const laneGrouped = new Map();
  for (const item of sortedItems) {
    const lane = getLaneLabel(item);
    if (!laneGrouped.has(lane)) laneGrouped.set(lane, new Map());
    const conferenceGroups = laneGrouped.get(lane);
    if (!conferenceGroups.has(item.conference)) conferenceGroups.set(item.conference, []);
    conferenceGroups.get(item.conference).push(item);
  }

  const laneOrder = ['Past 7 Days', 'Today', 'This Week', 'This Month', 'Later', 'Archive'];
  target.innerHTML = Array.from(laneGrouped.entries())
    .sort((a, b) => laneOrder.indexOf(a[0]) - laneOrder.indexOf(b[0]))
    .map(([lane, grouped], laneIndex) => {
      const laneMarkup = Array.from(grouped.entries())
        .map(([conference, itemsForConference], sectionIndex) => {
          const workshopCount = itemsForConference.filter((item) => getItemKind(item) === 'Workshop').length;
          const conflictCount = itemsForConference.filter((item) => item.conflict_note).length;
          const extensionCount = itemsForConference.filter((item) => item.is_extension).length;
          const nextItem = itemsForConference
            .filter((item) => item.date)
            .sort((a, b) => a.date.localeCompare(b.date))[0];

      const cards = itemsForConference
        .map((item, index) => {
          const extension = item.is_extension ? '<span class="pill extension">Extended</span>' : '';
          const conflict = item.conflict_note ? '<span class="pill conflict">Conflicting sources</span>' : '';
          const approaching = isApproachingThisMonth(item.date)
            ? '<span class="pill urgent">Due this month</span>'
            : '';
          const title = item.title && item.title !== item.conference
            ? `<p class="entry-parent">${escapeHtml(item.conference)}</p>`
            : '';
          const classes = [
            'card',
            item.date ? '' : 'muted',
            isApproachingThisMonth(item.date) ? 'urgent' : '',
            isPastDeadline(item.date) && !isWithinPastDays(item.date, 7) ? 'past' : '',
            isWithinPastDays(item.date, 7) ? 'recent-past' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return `
            <button class="${classes}" type="button" data-item-index="${allItems.indexOf(item)}" style="${getConferenceStyle(item.conference)} animation-delay: ${(laneIndex * 90) + (sectionIndex * 60) + (index * 35)}ms">
              <div class="entry-topline">
                <span class="conference-chip">${escapeHtml(item.conference)}</span>
                <span class="kind-chip">${escapeHtml(getItemKind(item))}</span>
                ${approaching}
                ${extension}
                ${conflict}
              </div>
              <h3>${escapeHtml(item.title || item.conference)}</h3>
              ${title}
              <div class="entry-primary">
                <p class="entry-date">${escapeHtml(formatDate(item.date))}</p>
                <p class="entry-distance">${escapeHtml(formatDeadlineDistance(item.date))}</p>
              </div>
              <div class="entry-secondary">
                <span class="entry-type">${escapeHtml(item.type)}</span>
                <span class="entry-preview">${escapeHtml((item.is_extension && item.change_summary) || item.notes || item.raw || 'Open for details.')}</span>
              </div>
              <span class="entry-open">Open details</span>
            </button>
          `;
        })
        .join('');

      return `
        <section id="${escapeHtml(`conference-${slugify(conference)}`)}" class="group-block">
          <header class="group-header">
            <div>
              <h3>${escapeHtml(conference)}</h3>
              <div class="group-summary">
                <span>${itemsForConference.length} entr${itemsForConference.length === 1 ? 'y' : 'ies'}</span>
                <span>${workshopCount} workshop${workshopCount === 1 ? '' : 's'}</span>
                <span>${conflictCount} conflict${conflictCount === 1 ? '' : 's'}</span>
                <span>${extensionCount} extension${extensionCount === 1 ? '' : 's'}</span>
              </div>
            </div>
            <span class="group-next">${nextItem ? `Next: ${formatDeadlineDistance(nextItem.date)}` : 'No date'}</span>
          </header>
          <div class="group-grid">
            ${cards}
          </div>
        </section>
      `;
        })
        .join('');

      return `
        <section class="lane-block">
          <header class="lane-header">
            <h3>${escapeHtml(lane)}</h3>
          </header>
          ${laneMarkup}
        </section>
      `;
    })
    .join('');

  attachItemOpenHandlers(target);
  if (target === grid) {
    renderSidebarLinks(
      sidebarConferences,
      Array.from(laneGrouped.values())
        .flatMap((grouped) => Array.from(grouped.keys()))
        .filter((conference, index, list) => list.indexOf(conference) === index)
        .map((conference) => ({
          id: slugify(conference),
          label: conference,
        })),
      'No visible conferences',
      'conference-',
      'entries-section',
      'Section top',
    );
  }
}

function renderEntries(items) {
  const activeItems = items.filter((item) => !isPastDeadline(item.date) || isWithinPastDays(item.date, 7));
  renderGroupedEntries(grid, activeItems, 'No active conferences matched the current filter.');
}

function renderPastEntries(items) {
  const pastItems = items.filter((item) => isPastDeadline(item.date) && !isWithinPastDays(item.date, 7));
  pastCount.textContent = `${pastItems.length} item${pastItems.length === 1 ? '' : 's'}`;
  renderGroupedEntries(pastGrid, pastItems, 'No past deadlines matched the current filter.');
}

function filterAndRender() {
  const query = search.value.trim().toLowerCase();
  const filtered = allItems.filter((item) => itemMatchesQuery(item, query) && matchesActiveFilter(item));
  updateStats(filtered);
  renderTimeline(filtered);
  renderCalendar(filtered);
  renderEntries(filtered);
  renderPastEntries(filtered);
}

for (const chip of filterChips) {
  chip.addEventListener('click', () => {
    activeFilter = chip.dataset.filter || 'all';
    for (const current of filterChips) {
      current.classList.toggle('is-active', current === chip);
    }
    filterAndRender();
  });
}

itemModal.addEventListener('click', (event) => {
  const rect = itemModal.getBoundingClientRect();
  const withinDialog =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!withinDialog) {
    itemModal.close();
  }
});

fetch('data/deadlines.json')
  .then((res) => res.json())
  .then((data) => {
    updated.textContent = `Last updated: ${new Date(data.updated_at).toLocaleString()}`;
    allItems = Array.isArray(data.items) ? data.items : [];
    renderChangeBanner(data.change_summary);
    updateStats(allItems);
    renderTimeline(allItems);
    renderCalendar(allItems);
    renderEntries(allItems);
    renderPastEntries(allItems);
  })
  .catch((err) => {
    updated.textContent = `Failed to load deadlines: ${err.message}`;
    changeBanner.innerHTML = '';
    renderEmptyState(timeline, 'Deadline data could not be loaded.');
    renderEmptyState(calendar, 'Deadline data could not be loaded.');
    renderEmptyState(grid, 'Deadline data could not be loaded.');
    renderEmptyState(pastGrid, 'Deadline data could not be loaded.');
  });

search.addEventListener('input', filterAndRender);
