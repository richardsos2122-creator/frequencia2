import { get, post } from './api.js';
import { put, del } from './api.js';
import { setupRealtime } from './realtime.js';
import { requireAuth, showAlert as renderAlert } from './ui.js';

const auth = requireAuth();

const params = new URLSearchParams(window.location.search);
const salaId = params.get('salaId');
const salaNome = params.get('nome') || 'Sala';

const salaTitulo = document.getElementById('sala-titulo');
const btnRenameSala = document.getElementById('btn-rename-sala');
const btnDeleteSala = document.getElementById('btn-delete-sala');
const modalRename = document.getElementById('modal-rename');
const modalDelete = document.getElementById('modal-delete');
const formRenameSala = document.getElementById('form-rename-sala');
const novoNomeInput = document.getElementById('novo-nome');
const novoTurnoInput = document.getElementById('novo-turno');
const cancelRenameBtn = document.getElementById('cancel-rename');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const dataAula = document.getElementById('data-aula');
const alunosList = document.getElementById('alunos-list');
const mesPesquisa = document.getElementById('mes-pesquisa');
const mensalSummary = document.getElementById('mensal-summary');
const mensalAlunos = document.getElementById('mensal-alunos');
const alertBox = document.getElementById('alert-box');
const salvarBtn = document.getElementById('salvar-btn');
const salvarLabel = document.getElementById('salvar-label');
const voltarBtn = document.getElementById('voltar-btn');
const alunoDetalhePanel = document.getElementById('aluno-detalhe-panel');
const alunoDetalheSummary = document.getElementById('aluno-detalhe-summary');
const alunoDetalheList = document.getElementById('aluno-detalhe-list');
const countPresentesEl = document.getElementById('count-presentes');
const countFaltasEl = document.getElementById('count-faltas');
const countTotalEl = document.getElementById('count-total');
const progressBarEl = document.getElementById('progress-bar');

const frequenciaAtual = new Map();
const responsaveisCache = new Map();
const uiState = {
  selectedAlunoId: null,
  selectedAlunoNome: '',
  monthlyRequestId: 0,
  detailRequestId: 0,
};
mesPesquisa.value = new Date().toISOString().slice(0, 7);

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

const hasSalaId = Boolean(salaId);

if (!hasSalaId) {
  window.location.replace('/dashboard.html');
}

salaTitulo.textContent = `Controle de Frequencia - ${salaNome}`;

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  if (modalRename?.classList.contains('hidden') && modalDelete?.classList.contains('hidden')) {
    document.body.classList.remove('modal-open');
  }
}

function setupModalDismiss(modal, onClose) {
  if (!modal) return;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      onClose();
    }
  });
}

// Preencher campos do modal de renomear com valores atuais
if (btnRenameSala) {
  btnRenameSala.addEventListener('click', async () => {
    try {
      const sala = await get(`/salas/${salaId}`);
      novoNomeInput.value = sala.nome || '';
      novoTurnoInput.value = sala.turno || '';
      openModal(modalRename);
      novoNomeInput.focus();
    } catch (e) {
      showAlert('Erro ao buscar dados da sala.');
    }
  });
}

if (cancelRenameBtn) {
  cancelRenameBtn.addEventListener('click', () => {
    closeModal(modalRename);
  });
}

if (formRenameSala) {
  formRenameSala.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnRenameSala.disabled = true;
    try {
      const nome = novoNomeInput.value.trim();
      const turno = novoTurnoInput.value.trim();
      await put(`/salas/${salaId}`, { nome, turno });
      showAlert('Sala renomeada com sucesso!', 'success');
      salaTitulo.textContent = `Controle de Frequencia - ${nome}`;
      closeModal(modalRename);
    } catch (err) {
      showAlert(err.message || 'Erro ao renomear sala.');
    } finally {
      btnRenameSala.disabled = false;
    }
  });
}

if (btnDeleteSala) {
  btnDeleteSala.addEventListener('click', () => {
    openModal(modalDelete);
  });
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', () => {
    closeModal(modalDelete);
  });
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', async () => {
    btnDeleteSala.disabled = true;
    try {
      await del(`/salas/${salaId}`);
      showAlert('Sala excluída com sucesso!', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 1200);
    } catch (err) {
      showAlert(err.message || 'Erro ao excluir sala.');
    } finally {
      btnDeleteSala.disabled = false;
      closeModal(modalDelete);
    }
  });
}

setupModalDismiss(modalRename, () => closeModal(modalRename));
setupModalDismiss(modalDelete, () => closeModal(modalDelete));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  if (modalRename && !modalRename.classList.contains('hidden')) {
    closeModal(modalRename);
    return;
  }

  if (modalDelete && !modalDelete.classList.contains('hidden')) {
    closeModal(modalDelete);
  }
});

dataAula.valueAsDate = new Date();

function showAlert(message, type = 'error') {
  renderAlert(alertBox, message, type);
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return '';
  try {
    const date = new Date(`${monthValue}-01T12:00:00`);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return monthValue;
  }
}

function capitalizeText(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAttendanceDate(dateValue) {
  if (!dateValue) {
    return {
      principal: 'Data não informada',
      complementar: '',
    };
  }

  try {
    const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T12:00:00`
      : dateValue;

    const parsedDate = new Date(normalizedValue);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date');
    }

    return {
      principal: parsedDate.toLocaleDateString('pt-BR'),
      complementar: capitalizeText(parsedDate.toLocaleDateString('pt-BR', { weekday: 'long' })),
    };
  } catch {
    return {
      principal: String(dateValue),
      complementar: '',
    };
  }
}

function updateSelectedDetailButtons() {
  const detalheButtons = mensalAlunos.querySelectorAll('.ver-detalhe-btn');

  detalheButtons.forEach((button) => {
    const isSelected = Number(button.dataset.alunoId) === Number(uiState.selectedAlunoId);
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
    button.textContent = isSelected ? 'Selecionado' : 'Ver detalhe';
  });
}

function clearAlunoDetalhe({ invalidateRequest = true } = {}) {
  if (invalidateRequest) {
    uiState.detailRequestId += 1;
  }

  uiState.selectedAlunoId = null;
  uiState.selectedAlunoNome = '';
  alunoDetalheSummary.innerHTML = '';
  alunoDetalheList.innerHTML = '';
  alunoDetalhePanel.classList.add('hidden');
  updateSelectedDetailButtons();
}

function showAlunoDetalheLoading(alunoNome = 'Aluno') {
  alunoDetalhePanel.classList.remove('hidden');
  alunoDetalheSummary.innerHTML = `
    <div class="mensal-summary-grid">
      <div><strong>Aluno:</strong> ${escapeHtml(alunoNome)}</div>
      <div><strong>Status:</strong> Carregando detalhes...</div>
    </div>
  `;
  alunoDetalheList.innerHTML = '<div class="mensal-row"><span>Atualizando frequência individual...</span></div>';
  updateSelectedDetailButtons();
}

function renderMonthlySummary(data) {
  const taxa = data.totais.registros
    ? Math.round((data.totais.presentes / data.totais.registros) * 100)
    : 0;

  mensalSummary.innerHTML = `
    <div class="mensal-summary-grid">
      <div><strong>Relatório de:</strong> ${escapeHtml(formatMonthLabel(data.mes))}</div>
      <div><strong>Presenças:</strong> ${Number(data.totais.presentes || 0)}</div>
      <div><strong>Faltas:</strong> ${Number(data.totais.faltas || 0)}</div>
      <div><strong>Total de registros:</strong> ${Number(data.totais.registros || 0)}</div>
      <div><strong>Taxa média:</strong> ${taxa}%</div>
      <div><strong>Sala:</strong> ${escapeHtml(salaNome)}</div>
    </div>
  `;

  if (!Array.isArray(data.alunos) || data.alunos.length === 0) {
    mensalAlunos.innerHTML = '<div class="mensal-row"><span>Nenhum registro mensal encontrado.</span></div>';
    clearAlunoDetalhe();
    return;
  }

  const alunoSelecionadoAindaExiste = data.alunos.some((item) => Number(item.aluno_id) === Number(uiState.selectedAlunoId));
  if (uiState.selectedAlunoId && !alunoSelecionadoAindaExiste) {
    clearAlunoDetalhe({ invalidateRequest: false });
  }

  const rows = data.alunos.map((item) => {
    const isSelected = Number(item.aluno_id) === Number(uiState.selectedAlunoId);

    return `
      <tr>
        <td data-label="Aluno">${escapeHtml(item.aluno_nome)}</td>
        <td data-label="Sala">${escapeHtml(salaNome)}</td>
        <td data-label="Presenças">${Number(item.presentes || 0)}</td>
        <td data-label="Faltas">${Number(item.faltas || 0)}</td>
        <td data-label="Registros">${Number(item.registros || 0)}</td>
        <td data-label="Ação">
          <button
            type="button"
            data-aluno-id="${Number(item.aluno_id)}"
            data-aluno-nome="${escapeHtml(item.aluno_nome)}"
            class="btn-secondary btn-small ver-detalhe-btn${isSelected ? ' is-selected' : ''}"
            aria-pressed="${isSelected}"
          >${isSelected ? 'Selecionado' : 'Ver detalhe'}</button>
        </td>
      </tr>
    `;
  }).join('');

  mensalAlunos.innerHTML = `
    <div class="table-scroll">
      <table class="mensal-table">
        <thead>
          <tr>
            <th>Aluno</th>
            <th>Sala</th>
            <th>Pres.</th>
            <th>Faltas</th>
            <th>Reg.</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  const detalheButtons = mensalAlunos.querySelectorAll('.ver-detalhe-btn');
  detalheButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const alunoId = Number(button.dataset.alunoId);
      const alunoNome = button.dataset.alunoNome || 'Aluno';

      try {
        await carregarDetalheAluno(alunoId, { alunoNome });
      } catch (error) {
        showAlert(error.message);
      }
    });
  });

  updateSelectedDetailButtons();
}

function renderAlunoDetalhe(data) {
  alunoDetalhePanel.classList.remove('hidden');

  const taxa = data.totais.registros
    ? Math.round((data.totais.presentes / data.totais.registros) * 100)
    : 0;

  uiState.selectedAlunoNome = data.alunoNome || uiState.selectedAlunoNome;

  alunoDetalheSummary.innerHTML = `
    <div class="mensal-summary-grid">
      <div><strong>Aluno:</strong> ${escapeHtml(uiState.selectedAlunoNome)}</div>
      <div><strong>Mês selecionado:</strong> ${escapeHtml(formatMonthLabel(data.mes))}</div>
      <div><strong>Presenças:</strong> ${Number(data.totais.presentes || 0)}</div>
      <div><strong>Faltas:</strong> ${Number(data.totais.faltas || 0)}</div>
      <div><strong>Total de registros:</strong> ${Number(data.totais.registros || 0)}</div>
      <div><strong>Taxa:</strong> ${taxa}%</div>
    </div>
  `;

  if (!Array.isArray(data.dias) || data.dias.length === 0) {
    alunoDetalheList.innerHTML = '<div class="mensal-row"><span>Nenhum registro de frequencia encontrado para este aluno neste mês.</span></div>';
    updateSelectedDetailButtons();
    return;
  }

  const rows = data.dias.map((item) => {
    const dataFormatada = formatAttendanceDate(item.data_aula);
    const statusLabel = item.status === 'presente' ? 'Presente' : 'Falta';
    const statusClass = item.status === 'presente' ? 'is-presente' : 'is-falta';

    return `
      <tr>
        <td data-label="Dia da aula">
          <div class="mensal-date-cell">
            <strong>${escapeHtml(dataFormatada.principal)}</strong>
            ${dataFormatada.complementar ? `<small>${escapeHtml(dataFormatada.complementar)}</small>` : ''}
          </div>
        </td>
        <td data-label="Status">
          <span class="mensal-status-pill ${statusClass}">${statusLabel}</span>
        </td>
      </tr>
    `;
  }).join('');

  alunoDetalheList.innerHTML = `
    <div class="table-scroll">
      <table class="mensal-table">
        <thead>
          <tr>
            <th>Dia da aula</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  updateSelectedDetailButtons();
}

async function carregarDetalheAluno(alunoId, { alunoNome = '', showLoading = true } = {}) {
  if (!mesPesquisa?.value) {
    throw new Error('Selecione um mês antes de ver o detalhe do aluno.');
  }

  const normalizedAlunoId = Number(alunoId);
  const requestId = ++uiState.detailRequestId;
  uiState.selectedAlunoId = normalizedAlunoId;
  uiState.selectedAlunoNome = alunoNome || uiState.selectedAlunoNome;

  if (showLoading) {
    showAlunoDetalheLoading(uiState.selectedAlunoNome || 'Aluno');
  } else {
    updateSelectedDetailButtons();
  }

  const data = await get(`/frequencia/aluno/${normalizedAlunoId}/mensal?mes=${mesPesquisa.value}`);

  if (requestId !== uiState.detailRequestId || normalizedAlunoId !== Number(uiState.selectedAlunoId)) {
    return;
  }

  renderAlunoDetalhe(data);
}

async function carregarResumoMensal() {
  if (!mesPesquisa?.value) {
    mensalSummary.innerHTML = '<p>Selecione um mês para ver o relatório mensal.</p>';
    mensalAlunos.innerHTML = '';
    clearAlunoDetalhe();
    return;
  }

  const requestId = ++uiState.monthlyRequestId;
  const alunoSelecionadoId = uiState.selectedAlunoId;
  const alunoSelecionadoNome = uiState.selectedAlunoNome;

  try {
    const data = await get(`/frequencia/sala/${salaId}/mensal?mes=${mesPesquisa.value}`);

    if (requestId !== uiState.monthlyRequestId) {
      return;
    }

    renderMonthlySummary(data);

    const alunoSelecionadoAindaExiste = Array.isArray(data.alunos)
      && data.alunos.some((item) => Number(item.aluno_id) === Number(alunoSelecionadoId));

    if (alunoSelecionadoId && alunoSelecionadoAindaExiste) {
      await carregarDetalheAluno(alunoSelecionadoId, {
        alunoNome: alunoSelecionadoNome,
        showLoading: false,
      });
    }
  } catch (error) {
    if (requestId !== uiState.monthlyRequestId) {
      return;
    }

    mensalSummary.innerHTML = `<p class="responsavel-status responsavel-status-error">${escapeHtml(error.message)}</p>`;
    mensalAlunos.innerHTML = '';
    clearAlunoDetalhe();
  }
}

function updateProgressBar() {
  let presentes = 0;
  let faltas = 0;
  frequenciaAtual.forEach((status) => {
    if (status === 'presente') presentes++;
    else faltas++;
  });
  const total = presentes + faltas;
  const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
  if (countPresentesEl) countPresentesEl.textContent = presentes;
  if (countFaltasEl) countFaltasEl.textContent = faltas;
  if (countTotalEl) countTotalEl.textContent = `${total} aluno${total !== 1 ? 's' : ''}`;
  if (progressBarEl) progressBarEl.style.width = `${pct}%`;
}

function createResponsavelCard(responsavel) {
  const card = document.createElement('article');
  card.className = 'responsavel-card';

  const nome = document.createElement('strong');
  nome.textContent = responsavel.nome;

  const email = document.createElement('span');
  email.textContent = responsavel.email;

  const telefone = document.createElement('span');
  telefone.textContent = responsavel.telefone;

  const nascimento = document.createElement('span');
  if (responsavel.data_nascimento) {
    nascimento.textContent = `Nascimento: ${formatAttendanceDate(responsavel.data_nascimento).principal}`;
  } else {
    nascimento.textContent = 'Nascimento: Nao informado';
  }

  card.appendChild(nome);
  card.appendChild(email);
  card.appendChild(telefone);
  card.appendChild(nascimento);

  return card;
}

async function toggleResponsaveis(aluno, details, button) {
  const isOpen = !details.classList.contains('hidden');
  if (isOpen) {
    details.classList.add('hidden');
    button.textContent = 'Ver responsáveis';
    return;
  }

  details.classList.remove('hidden');
  button.textContent = 'Ocultar responsáveis';

  if (responsaveisCache.has(aluno.id)) {
    return;
  }

  details.innerHTML = '<p class="responsavel-status">Carregando responsaveis...</p>';

  try {
    const responsaveis = await get(`/responsaveis/aluno/${aluno.id}`);
    responsaveisCache.set(aluno.id, responsaveis);
    details.innerHTML = '';

    if (responsaveis.length === 0) {
      details.innerHTML = '<p class="responsavel-status">Nenhum responsavel cadastrado para este aluno.</p>';
      return;
    }

    responsaveis.forEach((responsavel) => {
      details.appendChild(createResponsavelCard(responsavel));
    });
  } catch (error) {
    details.innerHTML = `<p class="responsavel-status responsavel-status-error">${escapeHtml(error.message)}</p>`;
  }
}

function renderAluno(aluno, status = 'presente') {
  frequenciaAtual.set(aluno.id, status);

  const item = document.createElement('article');
  item.className = 'card aluno-card';

  const bar = document.createElement('div');
  bar.className = 'aluno-status-bar';

  const content = document.createElement('div');
  content.className = 'aluno-card-content';

  const info = document.createElement('div');
  info.className = 'aluno-info';

  const nomeEl = document.createElement('strong');
  nomeEl.className = 'aluno-nome';
  nomeEl.textContent = aluno.nome;

  const responsaveisBtn = document.createElement('button');
  responsaveisBtn.className = 'btn-ghost responsaveis-toggle';
  responsaveisBtn.textContent = 'Ver responsáveis';

  const responsaveisDetails = document.createElement('div');
  responsaveisDetails.className = 'responsaveis-details hidden';

  responsaveisBtn.addEventListener('click', async () => {
    responsaveisBtn.disabled = true;
    try {
      await toggleResponsaveis(aluno, responsaveisDetails, responsaveisBtn);
    } finally {
      responsaveisBtn.disabled = false;
    }
  });

  info.appendChild(nomeEl);
  info.appendChild(responsaveisBtn);
  info.appendChild(responsaveisDetails);

  const toggle = document.createElement('div');
  toggle.className = 'aluno-status-toggle';

  const presenteBtn = document.createElement('button');
  presenteBtn.className = 'status-btn status-btn-presente';
  presenteBtn.setAttribute('aria-label', `Marcar ${escapeHtml(aluno.nome)} como presente`);
  presenteBtn.textContent = '✓ Presente';

  const faltaBtn = document.createElement('button');
  faltaBtn.className = 'status-btn status-btn-falta';
  faltaBtn.setAttribute('aria-label', `Marcar ${escapeHtml(aluno.nome)} como falta`);
  faltaBtn.textContent = '✗ Falta';

  function applyCardState(s) {
    item.classList.toggle('aluno-presente', s === 'presente');
    item.classList.toggle('aluno-falta', s === 'falta');
    presenteBtn.classList.toggle('status-btn-active', s === 'presente');
    faltaBtn.classList.toggle('status-btn-active', s === 'falta');
  }

  applyCardState(status);

  presenteBtn.addEventListener('click', () => {
    frequenciaAtual.set(aluno.id, 'presente');
    applyCardState('presente');
    updateProgressBar();
  });

  faltaBtn.addEventListener('click', () => {
    frequenciaAtual.set(aluno.id, 'falta');
    applyCardState('falta');
    updateProgressBar();
  });

  toggle.appendChild(presenteBtn);
  toggle.appendChild(faltaBtn);

  content.appendChild(info);
  content.appendChild(toggle);

  item.appendChild(bar);
  item.appendChild(content);

  return item;
}

async function carregarAlunos() {
  try {
    const alunosResponse = await get(`/salas/${salaId}/alunos`);
    const alunos = normalizeItems(alunosResponse);
    const data = dataAula.value;
    let frequencias = [];

    if (data) {
      try {
        const result = await get(`/frequencia/sala/${salaId}/data/${data}`);
        frequencias = Array.isArray(result.registros) ? result.registros : [];
      } catch {
        // Se não existirem registros para a data, seguiremos com defaults.
        frequencias = [];
      }
    }

    const statusPorAluno = new Map(frequencias.map((registro) => [registro.aluno_id, registro.status || 'presente']));

    frequenciaAtual.clear();
    alunosList.innerHTML = '';

    if (alunos.length === 0) {
      alunosList.innerHTML = `
        <article class="card empty-state">
          <h3>Nenhum aluno encontrado</h3>
          <p>Cadastre alunos nessa turma para começar a chamada diária.</p>
        </article>
      `;
      updateProgressBar();
      return;
    }

    alunos.forEach((aluno) => {
      const status = statusPorAluno.get(aluno.id) || 'presente';
      alunosList.appendChild(renderAluno(aluno, status));
    });
    updateProgressBar();
  } catch (error) {
    showAlert(error.message);
  }
}

if (auth && hasSalaId) {
  salvarBtn.addEventListener('click', async () => {
    const data = dataAula.value;
    if (!data) {
      showAlert('Selecione a data da aula antes de salvar.');
      return;
    }

    salvarBtn.disabled = true;
    salvarLabel.textContent = 'Salvando...';
    salvarBtn.classList.add('fab-btn-saving');

    const registros = Array.from(frequenciaAtual.entries()).map(([alunoId, status]) => ({
      alunoId,
      status,
    }));

    try {
      const dataResponse = await post('/frequencia', {
        salaId: Number(salaId),
        data,
        registros,
      });
      salvarBtn.classList.remove('fab-btn-saving');
      salvarBtn.classList.add('fab-btn-saved');
      salvarLabel.textContent = 'Salvo!';
      showAlert(dataResponse.message, 'success');
      setTimeout(() => {
        salvarBtn.classList.remove('fab-btn-saved');
        salvarLabel.textContent = 'Salvar frequência';
        salvarBtn.disabled = false;
      }, 2000);
    } catch (error) {
      salvarBtn.classList.remove('fab-btn-saving');
      salvarLabel.textContent = 'Salvar frequência';
      salvarBtn.disabled = false;
      showAlert(error.message);
      return;
    }

    try {
      await carregarAlunos();
      await carregarResumoMensal();
    } catch (error) {
      console.error('Falha ao atualizar a tela apos salvar:', error);
    }
  });

  voltarBtn.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });

  dataAula.addEventListener('change', async () => {
    await carregarAlunos();
  });

  mesPesquisa.addEventListener('change', async () => {
    clearAlunoDetalhe();
    await carregarResumoMensal();
  });

  setupRealtime({
    onMessage: async (event) => {
      const eventSalaId = Number(event?.payload?.salaId || 0);
      if (['alunos.changed', 'frequencia.updated'].includes(event?.type) && eventSalaId === Number(salaId)) {
        await carregarAlunos();
        await carregarResumoMensal();
      }
    },
    onFallback: async () => {
      await carregarAlunos();
      await carregarResumoMensal();
    },
    pollIntervalMs: 30000,
  });

  carregarAlunos();
  carregarResumoMensal();
}
