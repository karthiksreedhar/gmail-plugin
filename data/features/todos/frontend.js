/**
 * TODOs Frontend
 * Automatically renders TODOs below category pills for visible emails.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('TODOs: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const todosCache = new Map(); // emailId -> string[]
  const pendingIds = new Set();
  const BATCH_SIZE = 3;
  let inflight = false;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEmailId(emailItem) {
    const notesPreview = emailItem.querySelector('.notes-preview[data-email-notes]');
    if (notesPreview) {
      const id = String(notesPreview.getAttribute('data-email-notes') || '').trim();
      if (id) return id;
    }

    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickRaw = deleteBtn ? String(deleteBtn.getAttribute('onclick') || '') : '';
    const idMatch = onclickRaw.match(/deleteEmailThread\('([^']+)'/);
    if (idMatch && idMatch[1]) return idMatch[1];

    return '';
  }

  function renderTodosLine(emailItem, todos) {
    const existing = emailItem.querySelector('.todos-inline-line');
    if (existing) existing.remove();

    const anchor = emailItem.querySelector('.email-meta-row');
    if (!anchor) return;

    const line = document.createElement('span');
    line.className = 'todos-inline-line';
    line.style.cssText = 'margin-left:10px;font-size:12px;line-height:1.3;color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:58%;display:inline-block;vertical-align:middle;';
    if (todos === null) {
      line.innerHTML = '<strong style="color:#3c4043;">TODOs:</strong> Loading...';
    } else {
      const list = Array.isArray(todos) ? todos.filter(Boolean) : [];
      if (list.length) {
        line.innerHTML = `<strong style="color:#3c4043;">TODOs:</strong> ${escapeHtml(list.join(' | '))}`;
      } else {
        line.innerHTML = '<strong style="color:#3c4043;">TODOs:</strong> None';
      }
    }

    anchor.appendChild(line);
  }

  function collectVisibleEmailIds() {
    const emailItems = Array.from(document.querySelectorAll('.email-item'));
    const ids = [];
    for (const item of emailItems) {
      const id = getEmailId(item);
      if (id) ids.push(id);
    }
    return Array.from(new Set(ids));
  }

  function renderAllFromCache() {
    const emailItems = Array.from(document.querySelectorAll('.email-item'));
    for (const item of emailItems) {
      const id = getEmailId(item);
      if (!id) continue;
      if (todosCache.has(id)) {
        renderTodosLine(item, todosCache.get(id) || []);
      } else {
        renderTodosLine(item, null);
      }
    }
  }

  async function hydrateTodos() {
    if (inflight) return;
    inflight = true;
    try {
      const visibleIds = collectVisibleEmailIds();
      if (!visibleIds.length) return;

      const unknown = visibleIds.filter(id => !todosCache.has(id) && !pendingIds.has(id));
      if (unknown.length) {
        const cachedResp = await API.apiCall('/api/todos/cached-batch', {
          method: 'POST',
          body: { emailIds: unknown }
        });
        if (cachedResp && cachedResp.success && cachedResp.todosByEmailId && typeof cachedResp.todosByEmailId === 'object') {
          Object.entries(cachedResp.todosByEmailId).forEach(([id, todos]) => {
            if (Array.isArray(todos)) {
              todosCache.set(id, todos);
            }
          });
        }
      }

      const missing = visibleIds.filter(id => !todosCache.has(id) && !pendingIds.has(id));
      const batchIds = missing.slice(0, BATCH_SIZE); // newest first (DOM order)
      if (batchIds.length) {
        batchIds.forEach(id => pendingIds.add(id));
      }
      renderAllFromCache();

      if (batchIds.length) {
        const response = await API.apiCall('/api/todos/extract-batch', {
          method: 'POST',
          body: { emailIds: batchIds }
        });
        if (response && response.success && response.todosByEmailId && typeof response.todosByEmailId === 'object') {
          Object.entries(response.todosByEmailId).forEach(([id, todos]) => {
            todosCache.set(id, Array.isArray(todos) ? todos : []);
            pendingIds.delete(id);
          });
        } else {
          batchIds.forEach(id => pendingIds.delete(id));
        }
      }

      renderAllFromCache();
    } catch (error) {
      console.error('TODOs: hydrate failed:', error);
    } finally {
      inflight = false;
    }
  }

  function initialize() {
    API.on('emailsLoaded', () => {
      setTimeout(() => { hydrateTodos(); }, 100);
    });

    setTimeout(() => { hydrateTodos(); }, 200);
    setInterval(() => { hydrateTodos(); }, 900);

    if (typeof window.displayEmails === 'function') {
      const original = window.displayEmails;
      window.displayEmails = async function(...args) {
        const out = await original.apply(this, args);
        setTimeout(() => { hydrateTodos(); }, 60);
        return out;
      };
    }
  }

  initialize();
  console.log('TODOs: Frontend initialized');
})();
