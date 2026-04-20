import { del, get, post, put } from './api.js';
import { getSessionUser, requireAuth, showAlert } from './ui.js';

requireAuth();

const STORAGE_KEY = 'avanceCalendarioEventos';
const EVENT_META = {
  feriado: { label: 'Feriado', color: '#f59e0b' },
  reuniao: { label: 'Reunião', color: '#2563eb' },
  prova: { label: 'Prova', color: '#dc2626' },
  evento: { label: 'Evento', color: '#16a34a' },
  conselho: { label: 'Conselho', color: '#7c3aed' },
  recesso: { label: 'Recesso', color: '#0f766e' },
  'aula-especial': { label: 'Aula especial', color: '#0891b2' },
  observacao: { label: 'Observação', color: '#64748b' },
};

const state = {
  currentDate: new Date(),
  items: [],
  editingId: null,
  usingFallback: false,
  fallbackNotified: false,
};

const usuarioNome = document.getElementById('usuario-nome');
const alertBox = document.getElementById('alert-box');
const monthTitle = document.getElementById('month-title');
const calendarGrid = document.getElementById('calendar-grid');
const upcomingEvents = document.getElementById('upcoming-events');
const legend = document.getElementById('calendar-legend');
const modal = document.getElementById('calendar-modal');
const modalCard = modal?.querySelector('.modal-card');
const modalTitle = document.getElementById('modal-title');
const closeModalBtn = document.getElementById('close-modal-btn');
const addEventBtn = document.getElementById('add-event-btn');
const addHolidayBtn = document.getElementById('add-holiday-btn');
const quickNewEventBtn = document.getElementById('quick-new-event-btn');
const quickNewHolidayBtn = document.getElementById('quick-new-holiday-btn');
const quickTodayBtn = document.getElementById('quick-today-btn');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const todayBtn = document.getElementById('today-btn');
const calendarForm = document.getElementById('calendar-form');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const saveEventBtn = document.getElementById('save-event-btn');
const deleteEventBtn = document.getElementById('delete-event-btn');
const tituloInput = document.getElementById('evento-titulo');
const dataInput = document.getElementById('evento-data');
const tipoInput = document.getElementById('evento-tipo');
const descricaoInput = document.getElementById('evento-descricao');

const usuario = getSessionUser();
if (usuarioNome) {
  usuarioNome.textContent = usuario?.nome || 'Usuário';
}

function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function normalizeItems(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  return items.map((item) => ({
    ...item,
    data_evento: String(item.data_evento || item.data || '').slice(0, 10),
  }));
}

function getTypeMeta(type) {
  return EVENT_META[type] || EVENT_META.evento;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const byDate = String(a.data_evento).localeCompare(String(b.data_evento));
    return byDate || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR');
  });
}

function readLocalItems() {
  try {
    return sortItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

function saveLocalItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sortItems(items)));
}

function isSameMonth(dateValue, monthValue) {
  return String(dateValue || '').startsWith(`${monthValue}-`);
}

async function listMonthItems(monthValue) {
  try {
    const data = await get(`/calendario?mes=${monthValue}`);
    state.usingFallback = false;
    return sortItems(normalizeItems(data));
  } catch {
    state.usingFallback = true;

    if (!state.fallbackNotified) {
      state.fallbackNotified = true;
      showAlert(alertBox, 'Calendário em modo local temporário. A API principal não respondeu.', 'error');
    }

    return readLocalItems().filter((item) => isSameMonth(item.data_evento, monthValue));
  }
}

async function createOrUpdateItem(payload) {
  if (!state.usingFallback) {
    try {
      if (state.editingId) {
        await put(`/calendario/${state.editingId}`, payload);
      } else {
        await post('/calendario', payload);
      }
      return;
    } catch {
      state.usingFallback = true;
    }
  }

  const localItems = readLocalItems();

  if (state.editingId) {
    const updated = localItems.map((item) => (
      Number(item.id) === Number(state.editingId)
        ? { ...item, ...payload, id: Number(state.editingId) }
        : item
    ));
    saveLocalItems(updated);
    return;
  }

  const nextId = localItems.length > 0 ? Math.max(...localItems.map((item) => Number(item.id) || 0)) + 1 : 1;
  saveLocalItems([...localItems, { id: nextId, ...payload }]);
}

async function removeItem(itemId) {
  if (!state.usingFallback) {
    try {
      await del(`/calendario/${itemId}`);
      return;
    } catch {
      state.usingFallback = true;
    }
  }

  const items = readLocalItems().filter((item) => Number(item.id) !== Number(itemId));
  saveLocalItems(items);
}

function renderLegend() {
  legend.innerHTML = Object.values(EVENT_META).map((meta) => `
    <span class="legend-pill" style="--event-color:${meta.color}">${meta.label}</span>
  `).join('');
}

function renderUpcomingEvents() {
  if (!state.items.length) {
    upcomingEvents.innerHTML = `
      <article class="empty-state cardless-empty">
        <h3>Nenhuma marcação neste mês</h3>
        <p>Use os botões acima para registrar feriados, reuniões, provas e eventos.</p>
      </article>
    `;
    return;
  }

  upcomingEvents.innerHTML = state.items.map((item) => {
    const meta = getTypeMeta(item.tipo);
    const day = new Date(`${item.data_evento}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    return `
      <button type="button" class="event-list-item" data-event-id="${Number(item.id)}">
        <span class="event-list-dot" style="background:${meta.color}"></span>
        <span>
          <strong>${item.titulo}</strong>
          <small>${meta.label} • ${day}</small>
        </span>
      </button>
    `;
  }).join('');

  upcomingEvents.querySelectorAll('[data-event-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const eventId = Number(button.dataset.eventId);
      const selected = state.items.find((item) => Number(item.id) === eventId);
      if (selected) {
        openModal(selected);
      }
    });
  });
}

function createDayCard(date, isCurrentMonth) {
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayItems = state.items.filter((item) => item.data_evento === isoDate);

  return `
    <button type="button" class="calendar-day${isCurrentMonth ? '' : ' is-outside'}${isoDate === todayIso ? ' is-today' : ''}" data-date="${isoDate}">
      <span class="calendar-day-number">${date.getDate()}</span>
      <span class="calendar-day-events">
        ${dayItems.slice(0, 3).map((item) => {
          const meta = getTypeMeta(item.tipo);
          return `<span class="calendar-badge" data-event-id="${Number(item.id)}" style="--event-color:${item.cor || meta.color}">${item.titulo}</span>`;
        }).join('')}
        ${dayItems.length > 3 ? `<span class="calendar-more">+${dayItems.length - 3} mais</span>` : ''}
      </span>
    </button>
  `;
}

function renderCalendar() {
  monthTitle.textContent = formatMonthTitle(state.currentDate);

  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);
    days.push(createDayCard(current, current.getMonth() === month));
  }

  calendarGrid.innerHTML = days.join('');

  calendarGrid.querySelectorAll('.calendar-day').forEach((dayButton) => {
    dayButton.addEventListener('click', (event) => {
      const eventChip = event.target.closest('[data-event-id]');
      if (eventChip) {
        event.stopPropagation();
        const selected = state.items.find((item) => Number(item.id) === Number(eventChip.dataset.eventId));
        if (selected) {
          openModal(selected);
        }
        return;
      }

      openModal({ data_evento: dayButton.dataset.date, tipo: 'evento' });
    });
  });
}

function resetCalendarForm() {
  calendarForm?.reset();
  state.editingId = null;

  if (dataInput) {
    dataInput.value = new Date().toISOString().slice(0, 10);
  }

  if (tipoInput) {
    tipoInput.value = 'evento';
  }

  if (deleteEventBtn) {
    deleteEventBtn.classList.add('hidden');
  }

  if (modalTitle) {
    modalTitle.textContent = 'Novo evento';
  }
}

function setModalVisibility(isOpen) {
  if (!modal) {
    return;
  }

  modal.classList.toggle('hidden', !isOpen);
  modal.setAttribute('aria-hidden', String(!isOpen));
  document.body.classList.toggle('modal-open', isOpen);
}

function closeModal() {
  setModalVisibility(false);
  resetCalendarForm();
}

function openNewEventModal(type = 'evento') {
  openModal({ data_evento: new Date().toISOString().slice(0, 10), tipo: type });
}

function openModal(item = {}) {
  state.editingId = item.id ? Number(item.id) : null;
  setModalVisibility(true);
  modalTitle.textContent = state.editingId ? 'Editar marcação' : 'Nova marcação';
  tituloInput.value = item.titulo || '';
  dataInput.value = String(item.data_evento || new Date().toISOString().slice(0, 10)).slice(0, 10);
  tipoInput.value = item.tipo || 'evento';
  descricaoInput.value = item.descricao || '';
  deleteEventBtn.classList.toggle('hidden', !state.editingId);
  tituloInput.focus();
}

async function refreshCalendar() {
  const monthValue = getMonthValue(state.currentDate);
  state.items = await listMonthItems(monthValue);
  renderCalendar();
  renderUpcomingEvents();
}

addEventBtn?.addEventListener('click', () => {
  openNewEventModal('evento');
});

addHolidayBtn?.addEventListener('click', () => {
  openNewEventModal('feriado');
});

quickNewEventBtn?.addEventListener('click', () => {
  openNewEventModal('evento');
});

quickNewHolidayBtn?.addEventListener('click', () => {
  openNewEventModal('feriado');
});

prevMonthBtn?.addEventListener('click', async () => {
  state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
  await refreshCalendar();
});

nextMonthBtn?.addEventListener('click', async () => {
  state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
  await refreshCalendar();
});

todayBtn?.addEventListener('click', async () => {
  state.currentDate = new Date();
  await refreshCalendar();
});

quickTodayBtn?.addEventListener('click', async () => {
  state.currentDate = new Date();
  await refreshCalendar();
});

closeModalBtn?.addEventListener('click', closeModal);
cancelModalBtn?.addEventListener('click', closeModal);
modalCard?.addEventListener('click', (event) => {
  event.stopPropagation();
});
modal?.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

deleteEventBtn?.addEventListener('click', async () => {
  if (!state.editingId) {
    return;
  }

  try {
    await removeItem(state.editingId);
    closeModal();
    showAlert(alertBox, 'Evento excluído com sucesso.', 'success');
    await refreshCalendar();
  } catch (error) {
    showAlert(alertBox, error.message || 'Não foi possível excluir o evento.');
  }
});

calendarForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const titulo = tituloInput.value.trim();
  const data = dataInput.value;
  const tipo = tipoInput.value;
  const descricao = descricaoInput.value.trim();
  const meta = getTypeMeta(tipo);
  const wasEditing = Boolean(state.editingId);

  if (!titulo) {
    showAlert(alertBox, 'Informe o título da marcação para continuar.');
    tituloInput.focus();
    return;
  }

  if (!data) {
    showAlert(alertBox, 'Escolha a data da marcação para continuar.');
    dataInput.focus();
    return;
  }

  if (!tipo) {
    showAlert(alertBox, 'Selecione o tipo da marcação para continuar.');
    tipoInput.focus();
    return;
  }

  if (saveEventBtn) {
    saveEventBtn.disabled = true;
    saveEventBtn.textContent = 'Salvando...';
  }

  try {
    await createOrUpdateItem({
      titulo,
      data,
      tipo,
      descricao,
      cor: meta.color,
      data_evento: data,
    });

    state.currentDate = new Date(`${data}T12:00:00`);
    await refreshCalendar();
    closeModal();
    showAlert(alertBox, wasEditing ? 'Evento atualizado com sucesso.' : 'Evento cadastrado com sucesso.', 'success');
  } catch (error) {
    showAlert(alertBox, error.message || 'Não foi possível salvar o evento.');
  } finally {
    if (saveEventBtn) {
      saveEventBtn.disabled = false;
      saveEventBtn.textContent = 'Salvar marcação';
    }
  }
});

if (!modal || !calendarForm || !tituloInput || !dataInput || !tipoInput) {
  console.error('Elementos essenciais do calendário não foram encontrados na tela.');
}

renderLegend();
refreshCalendar();
