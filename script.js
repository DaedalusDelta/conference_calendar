const grid = document.getElementById('grid');
const updated = document.getElementById('updated');
const search = document.getElementById('search');
const calendar = document.getElementById('calendar');
const calendarTitle = document.getElementById('calendarTitle');
const prevMonth = document.getElementById('prevMonth');
const nextMonth = document.getElementById('nextMonth');

let allItems = [];
let monthCursor = new Date();
monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);

function renderCards(items) {
  grid.innerHTML = '';
  for (const item of items) {
    const extensionTag = item.is_extension ? '<span class="badge">Extension</span>' : '';
    const card = document.createElement('article');
    card.className = `card ${item.date ? '' : 'muted'}`;
    card.innerHTML = `
      <h2>${item.conference} ${extensionTag}</h2>
      <p><strong>Venue:</strong> ${item.venue_type || 'conference'}</p>
      <p><strong>Type:</strong> ${item.deadline_type || item.type}</p>
      <p><strong>Date:</strong> ${item.date || 'Not found automatically'}</p>
      <p><strong>From:</strong> ${item.source_page || 'homepage'}</p>
      <p class="raw">${item.snippet || item.raw || item.note || ''}</p>
      <a href="${item.source}" target="_blank" rel="noopener noreferrer">Source</a>
    `;
    grid.appendChild(card);
  }
}

function eventsByDate(items) {
  const byDate = new Map();
  for (const item of items) {
    if (!item.date) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }
  return byDate;
}

function renderCalendar(items) {
  const byDate = eventsByDate(items);
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendarTitle.textContent = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  calendar.innerHTML = '';

  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = d;
    calendar.appendChild(el);
  });

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    const itemsOnDay = byDate.get(iso) || [];

    const cell = document.createElement('div');
    cell.className = `day ${itemsOnDay.length ? 'has-event' : ''}`;

    const dayNum = document.createElement('div');
    dayNum.className = 'day-num';
    dayNum.textContent = String(day);
    cell.appendChild(dayNum);

    if (itemsOnDay.length) {
      const ul = document.createElement('ul');
      ul.className = 'event-list';
      for (const event of itemsOnDay.slice(0, 2)) {
        const li = document.createElement('li');
        li.textContent = `${event.conference}: ${event.deadline_type}`;
        ul.appendChild(li);
      }
      if (itemsOnDay.length > 2) {
        const li = document.createElement('li');
        li.textContent = `+${itemsOnDay.length - 2} more`;
        ul.appendChild(li);
      }
      cell.appendChild(ul);
    }

    calendar.appendChild(cell);
  }
}

function filterAndRender() {
  const q = search.value.trim().toLowerCase();
  const filtered = !q
    ? allItems
    : allItems.filter((item) =>
        [item.conference, item.deadline_type || '', item.venue_type || '', item.snippet || '']
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
  renderCards(filtered);
  renderCalendar(filtered);
}

fetch('data/deadlines.json')
  .then((res) => res.json())
  .then((data) => {
    updated.textContent = `Last updated: ${new Date(data.updated_at).toLocaleString()}`;
    allItems = data.items || [];
    filterAndRender();
  })
  .catch((err) => {
    updated.textContent = `Failed to load deadlines: ${err.message}`;
  });

search.addEventListener('input', filterAndRender);
prevMonth.addEventListener('click', () => {
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
  renderCalendar(allItems);
});
nextMonth.addEventListener('click', () => {
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  renderCalendar(allItems);
});
