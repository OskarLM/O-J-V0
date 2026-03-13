// app.js
import {
  initDB,
  addItem,
  getAllItems,
  deleteItem,
  updateItem,
  countItems,
  findByTextPrefix
} from './db.js';

async function boot() {
  await initDB();

  const form = document.getElementById('data-form');
  const input = document.getElementById('data-input');
  const list  = document.getElementById('data-list');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const item = await addItem({ text });
    input.value = '';
    await refresh();
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'delete') {
      await deleteItem(id);
      await refresh();
    } else if (action === 'edit') {
      const newText = prompt('Nuevo texto:');
      if (newText != null) {
        await updateItem(id, { text: newText });
        await refresh();
      }
    }
  });

  async function refresh(prefix = '') {
    const items = prefix
      ? await findByTextPrefix(prefix)
      : await getAllItems({ sortBy: 'createdAt', direction: 'desc' });

    list.innerHTML = items.map(renderItem).join('');
    const total = await countItems();
    console.debug(`[app] items=${items.length}/${total}`);
  }

  function renderItem(it) {
    const date = new Date(it.createdAt).toLocaleString();
    return `
      <li>
        <span>${escapeHTML(it.text)} <small>(${date})</small></span>
        <button data-action="edit" data-id="${it.id}">Editar</button>
        <button data-action="delete" data-id="${it.id}">Borrar</button>
      </li>
    `;
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  await refresh();
}

document.addEventListener('DOMContentLoaded', boot);
