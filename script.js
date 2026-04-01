const grid = document.getElementById('grid');
const updated = document.getElementById('updated');
const search = document.getElementById('search');

let allItems = [];

function render(items) {
  grid.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('article');
    card.className = `card ${item.date ? '' : 'muted'}`;
    card.innerHTML = `
      <h2>${item.conference}</h2>
      <p><strong>Type:</strong> ${item.type}</p>
      <p><strong>Date:</strong> ${item.date || 'Not found automatically'}</p>
      <p class="raw">${item.raw || item.note || ''}</p>
      <a href="${item.source}" target="_blank" rel="noopener noreferrer">Source</a>
    `;
    grid.appendChild(card);
  }
}

function filterAndRender() {
  const q = search.value.trim().toLowerCase();
  const filtered = !q
    ? allItems
    : allItems.filter((item) =>
        [item.conference, item.type, item.raw || ''].join(' ').toLowerCase().includes(q)
      );
  render(filtered);
}

fetch('data/deadlines.json')
  .then((res) => res.json())
  .then((data) => {
    updated.textContent = `Last updated: ${new Date(data.updated_at).toLocaleString()}`;
    allItems = data.items || [];
    render(allItems);
  })
  .catch((err) => {
    updated.textContent = `Failed to load deadlines: ${err.message}`;
  });

search.addEventListener('input', filterAndRender);
