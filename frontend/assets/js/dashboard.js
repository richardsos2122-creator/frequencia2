import { get, post } from './api.js';
import { setupRealtime } from './realtime.js';
import { logoutUser, requireAuth, showAlert } from './ui.js';

const auth = requireAuth();
const usuario = auth?.usuario;
const salasGrid = document.getElementById('salas-grid');
const usuarioNome = document.getElementById('usuario-nome');
const alertBox = document.getElementById('alert-box');
const logoutBtn = document.getElementById('logout-btn');
const toggleSalaBtn = document.getElementById('toggle-sala-btn');
const toggleAlunoBtn = document.getElementById('toggle-aluno-btn');
const salaPanel = document.getElementById('sala-panel');
const salaForm = document.getElementById('sala-form');
const alunoPanel = document.getElementById('aluno-panel');
const alunoForm = document.getElementById('aluno-form');
const salaAlunoSelect = document.getElementById('sala-aluno');
const addResponsaveisToggle = document.getElementById('add-responsaveis-toggle');
const responsaveisAlunoWrapper = document.getElementById('responsaveis-aluno-wrapper');
const responsaveisAlunoList = document.getElementById('responsaveis-aluno-list');
const addResponsavelBtn = document.getElementById('add-responsavel-btn');
const salasTotal = document.getElementById('salas-total');
const quickSalaBtn = document.getElementById('quick-sala-btn');
const quickAlunoBtn = document.getElementById('quick-aluno-btn');
const quickSalaShortcut = document.getElementById('quick-sala-shortcut');
const quickAlunoShortcut = document.getElementById('quick-aluno-shortcut');
const quickChamadaBtn = document.getElementById('quick-chamada-btn');
const calendarPreview = document.getElementById('calendar-preview');

if (auth) {
  usuarioNome.textContent = usuario?.nome || 'Usuario';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

function showError(message) {
  showAlert(alertBox, message, 'error');
}

function showSuccess(message) {
  showAlert(alertBox, message, 'success');
}

function renderCalendarPreview(items = []) {
  if (!calendarPreview) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    calendarPreview.innerHTML = `
      <article class="empty-state">
        <h3>Nenhum evento neste mês</h3>
        <p>Use o botão Calendário para cadastrar feriados, reuniões e provas.</p>
      </article>
    `;
    return;
  }

  calendarPreview.innerHTML = items.slice(0, 6).map((item) => {
    const normalizedDate = String(item.data_evento || item.data || '').slice(0, 10);
    const dataFormatada = normalizedDate
      ? new Date(`${normalizedDate}T12:00:00`).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        })
      : 'Sem data';

    return `
      <article class="preview-event-card">
        <span class="preview-event-dot" style="background:${escapeHtml(item.cor || '#126bff')}"></span>
        <div>
          <strong>${escapeHtml(item.titulo || 'Evento')}</strong>
          <p>${escapeHtml(item.tipo || 'evento')} • ${escapeHtml(dataFormatada)}</p>
        </div>
      </article>
    `;
  }).join('');
}

async function carregarCalendarioResumo() {
  if (!calendarPreview) {
    return;
  }

  try {
    const mesAtual = new Date().toISOString().slice(0, 7);
    const payload = await get(`/calendario?mes=${mesAtual}`);
    const items = normalizeItems(payload);
    renderCalendarPreview(items);
  } catch {
    renderCalendarPreview([]);
  }
}

function createResponsavelFields(index) {
  const card = document.createElement('div');
  card.className = 'responsavel-inline-card';
  card.innerHTML = `
    <h4>Responsavel ${index + 1}</h4>
    <div class="form-grid">
      <div class="form-group">
        <label>Nome do responsavel</label>
        <input type="text" class="resp-nome" maxlength="120" />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" class="resp-email" maxlength="120" />
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="tel" class="resp-telefone" maxlength="25" />
      </div>
      <div class="form-group">
        <label>Data de nascimento</label>
        <input type="date" class="resp-data-nascimento" />
      </div>
      <button type="button" class="btn-danger remover-responsavel-btn">Remover</button>
    </div>
  `;

  const dataNascimentoInput = card.querySelector('.resp-data-nascimento');
  if (dataNascimentoInput) {
    dataNascimentoInput.max = new Date().toISOString().split('T')[0];
  }

  const removerBtn = card.querySelector('.remover-responsavel-btn');
  removerBtn.addEventListener('click', () => {
    card.remove();
    atualizarOrdemResponsaveis();
  });

  return card;
}

function atualizarOrdemResponsaveis() {
  const cards = Array.from(responsaveisAlunoList.querySelectorAll('.responsavel-inline-card'));
  cards.forEach((card, index) => {
    const title = card.querySelector('h4');
    const removerBtn = card.querySelector('.remover-responsavel-btn');
    if (title) {
      title.textContent = `Responsavel ${index + 1}`;
    }
    if (removerBtn) {
      removerBtn.disabled = cards.length === 1;
    }
  });
}

function resetResponsaveisForm() {
  addResponsaveisToggle.checked = false;
  responsaveisAlunoWrapper.classList.add('hidden');
  responsaveisAlunoList.innerHTML = '';
  responsaveisAlunoList.appendChild(createResponsavelFields(0));
  atualizarOrdemResponsaveis();
}

function coletarResponsaveisParaEnvio() {
  if (!addResponsaveisToggle.checked) {
    return [];
  }

  const cards = Array.from(responsaveisAlunoList.querySelectorAll('.responsavel-inline-card'));
  const responsaveis = [];

  cards.forEach((card, index) => {
    const nome = String(card.querySelector('.resp-nome')?.value || '').trim();
    const email = String(card.querySelector('.resp-email')?.value || '').trim();
    const telefone = String(card.querySelector('.resp-telefone')?.value || '').trim();
    const dataNascimento = String(card.querySelector('.resp-data-nascimento')?.value || '').trim();

    const algumCampoPreenchido = Boolean(nome || email || telefone || dataNascimento);
    if (!algumCampoPreenchido) {
      return;
    }

    if (!nome || !email || !telefone || !dataNascimento) {
      throw new Error(`Preencha nome, email, telefone e data de nascimento do responsavel ${index + 1}.`);
    }

    responsaveis.push({ nome, email, telefone, dataNascimento });
  });

  if (responsaveis.length === 0) {
    throw new Error('Adicione pelo menos um responsavel completo ou desmarque a opcao de responsaveis.');
  }

  return responsaveis;
}

function createSalaCard(sala) {
  const article = document.createElement('article');
  article.className = 'card sala-card';

  article.innerHTML = `
    <div class="sala-card-header">
      <div>
        <h3>${escapeHtml(sala.nome)}</h3>
        <p>Turno: ${escapeHtml(sala.turno)}</p>
      </div>
      <span class="sala-badge">${Number(sala.total_alunos || 0)} aluno(s)</span>
    </div>
    <p class="sala-card-hint">Abra a sala para fazer a chamada e acompanhar o mês.</p>
    <span class="sala-card-cta">Abrir sala →</span>
  `;

  article.addEventListener('click', () => {
    window.location.href = `/sala.html?salaId=${sala.id}&nome=${encodeURIComponent(sala.nome)}`;
  });

  return article;
}

function updateToggleButtons() {
  const salaOpen = !salaPanel.classList.contains('hidden');
  const alunoOpen = !alunoPanel.classList.contains('hidden');

  toggleSalaBtn.textContent = salaOpen ? 'Fechar cadastro de sala' : 'Cadastrar sala';
  toggleAlunoBtn.textContent = alunoOpen ? 'Fechar cadastro de aluno' : 'Cadastrar aluno';
  toggleSalaBtn.setAttribute('aria-expanded', String(salaOpen));
  toggleAlunoBtn.setAttribute('aria-expanded', String(alunoOpen));
}

function togglePanel(panelToToggle, otherPanel) {
  otherPanel.classList.add('hidden');
  panelToToggle.classList.toggle('hidden');
  updateToggleButtons();

  if (!panelToToggle.classList.contains('hidden')) {
    panelToToggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function carregarSalas() {
  try {
    const salasResponse = await get('/salas');
    const salas = normalizeItems(salasResponse);
    salasGrid.innerHTML = '';
    salasTotal.textContent = String(salas.length);

    if (salas.length === 0) {
      salasGrid.innerHTML = `
        <article class="card empty-state">
          <h3>Nenhuma sala cadastrada ainda</h3>
          <p>Use o botão de cadastro para criar a primeira turma e começar a organizar a frequência.</p>
        </article>
      `;
    } else {
      salas.forEach((sala) => salasGrid.appendChild(createSalaCard(sala)));
    }

    salaAlunoSelect.innerHTML = '<option value="">Selecione</option>';
    salas.forEach((sala) => {
      const option = document.createElement('option');
      option.value = String(sala.id);
      option.textContent = `${sala.nome} (${sala.turno})`;
      salaAlunoSelect.appendChild(option);
    });
  } catch (error) {
    showError(error.message);
  }
}

toggleAlunoBtn.addEventListener('click', () => {
  togglePanel(alunoPanel, salaPanel);
});

quickAlunoBtn?.addEventListener('click', () => {
  togglePanel(alunoPanel, salaPanel);
});

quickAlunoShortcut?.addEventListener('click', () => {
  togglePanel(alunoPanel, salaPanel);
});

quickSalaBtn?.addEventListener('click', () => {
  togglePanel(salaPanel, alunoPanel);
});

quickSalaShortcut?.addEventListener('click', () => {
  togglePanel(salaPanel, alunoPanel);
});

quickChamadaBtn?.addEventListener('click', () => {
  document.getElementById('salas-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

toggleSalaBtn.addEventListener('click', () => {
  togglePanel(salaPanel, alunoPanel);
});

addResponsaveisToggle.addEventListener('change', () => {
  if (addResponsaveisToggle.checked) {
    responsaveisAlunoWrapper.classList.remove('hidden');
    if (responsaveisAlunoList.children.length === 0) {
      responsaveisAlunoList.appendChild(createResponsavelFields(0));
    }
    atualizarOrdemResponsaveis();
    return;
  }

  responsaveisAlunoWrapper.classList.add('hidden');
});

addResponsavelBtn.addEventListener('click', () => {
  const nextIndex = responsaveisAlunoList.querySelectorAll('.responsavel-inline-card').length;
  responsaveisAlunoList.appendChild(createResponsavelFields(nextIndex));
  atualizarOrdemResponsaveis();
});

alunoForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const salaId = Number(salaAlunoSelect.value);
  const nomeAluno = document.getElementById('nome-aluno').value.trim();

  if (!salaId) {
    showError('Selecione uma sala para cadastrar o aluno.');
    return;
  }

  try {
    const responsaveis = coletarResponsaveisParaEnvio();
    const response = await post(`/salas/${salaId}/alunos`, {
      nome: nomeAluno,
      responsaveis,
    });
    showSuccess(response.message);
    alunoForm.reset();
    resetResponsaveisForm();
    alunoPanel.classList.add('hidden');
    updateToggleButtons();
    await carregarSalas();
  } catch (error) {
    showError(error.message);
  }
});

salaForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    nome: document.getElementById('nome-sala').value.trim(),
    turno: document.getElementById('turno-sala').value,
  };

  try {
    const response = await post('/salas', payload);
    showSuccess(response.message);
    salaForm.reset();
    salaPanel.classList.add('hidden');
    updateToggleButtons();
    await carregarSalas();
  } catch (error) {
    showError(error.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  await logoutUser((refreshToken) => post('/auth/logout', { refreshToken }));
});

setupRealtime({
  onMessage: async (event) => {
    if (['salas.changed', 'alunos.changed'].includes(event?.type)) {
      await carregarSalas();
    }

    if (event?.type === 'calendario.changed') {
      await carregarCalendarioResumo();
    }
  },
  onFallback: async () => {
    await carregarSalas();
    await carregarCalendarioResumo();
  },
  pollIntervalMs: 45000,
});

carregarSalas();
carregarCalendarioResumo();
resetResponsaveisForm();
updateToggleButtons();
}
