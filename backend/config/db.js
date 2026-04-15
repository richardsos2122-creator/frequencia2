import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbPort = Number(process.env.DB_PORT || 3306);
const dbName = process.env.DB_NAME || 'avance_frequencia';
const useInMemoryDb = process.env.USE_IN_MEMORY_DB === 'true'
  || (process.env.VERCEL === '1' && ['localhost', '127.0.0.1'].includes(String(dbHost).toLowerCase()));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function likeMatch(value, pattern) {
  const normalizedValue = String(value ?? '').toLowerCase();
  const normalizedPattern = String(pattern ?? '').replace(/%/g, '').toLowerCase();
  return normalizedValue.includes(normalizedPattern);
}

function sortByName(items, field = 'nome') {
  return [...items].sort((a, b) => String(a[field] || '').localeCompare(String(b[field] || ''), 'pt-BR'));
}

function buildInitialMemoryState() {
  return {
    usuarios: [],
    salas: [
      { id: 1, nome: 'Sala 1 - Fundamental', turno: 'Manha', criado_em: nowIso() },
      { id: 2, nome: 'Sala 2 - Reforco Matematica', turno: 'Tarde', criado_em: nowIso() },
      { id: 3, nome: 'Sala 3 - Linguagens', turno: 'Noite', criado_em: nowIso() },
    ],
    alunos: [
      { id: 1, nome: 'Ana Clara', sala_id: 1, criado_em: nowIso() },
      { id: 2, nome: 'Bruno Silva', sala_id: 1, criado_em: nowIso() },
      { id: 3, nome: 'Carlos Henrique', sala_id: 1, criado_em: nowIso() },
      { id: 4, nome: 'Daniela Souza', sala_id: 2, criado_em: nowIso() },
      { id: 5, nome: 'Eduardo Lima', sala_id: 2, criado_em: nowIso() },
      { id: 6, nome: 'Fernanda Rocha', sala_id: 2, criado_em: nowIso() },
      { id: 7, nome: 'Gabriel Martins', sala_id: 3, criado_em: nowIso() },
      { id: 8, nome: 'Helena Costa', sala_id: 3, criado_em: nowIso() },
      { id: 9, nome: 'Igor Nascimento', sala_id: 3, criado_em: nowIso() },
    ],
    responsaveis: [
      { id: 1, nome: 'Marina Clara', email: 'marina.ana@example.com', telefone: '(11) 99999-1111', aluno_id: 1, criado_em: nowIso() },
      { id: 2, nome: 'Paulo Silva', email: 'paulo.bruno@example.com', telefone: '(11) 99999-2222', aluno_id: 2, criado_em: nowIso() },
    ],
    frequencias: [],
    refresh_tokens: [],
    counters: {
      usuario: 0,
      sala: 3,
      aluno: 9,
      responsavel: 2,
      frequencia: 0,
      refreshToken: 0,
    },
  };
}

let memoryState = buildInitialMemoryState();

function createDuplicateError(message) {
  const error = new Error(message);
  error.code = 'ER_DUP_ENTRY';
  return error;
}

function parseDateFilters(normalizedSql, params, startIndex = 0) {
  let cursor = startIndex;
  let inicio = null;
  let fim = null;

  if (normalizedSql.includes('between ? and ?')) {
    inicio = params[cursor++];
    fim = params[cursor++];
  } else {
    if (normalizedSql.includes('>= ?')) {
      inicio = params[cursor++];
    }
    if (normalizedSql.includes('<= ?')) {
      fim = params[cursor++];
    }
  }

  return { inicio, fim, cursor };
}

function withinDateRange(dateValue, inicio, fim) {
  if (!dateValue) {
    return false;
  }

  if (inicio && dateValue < inicio) {
    return false;
  }

  if (fim && dateValue > fim) {
    return false;
  }

  return true;
}

async function handleMemoryQuery(sql, params = []) {
  const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalizedSql.startsWith('select id from usuarios where lower(usuario) = lower(?)')) {
    const usuario = String(params[0] || '').toLowerCase();
    const rows = memoryState.usuarios
      .filter((item) => item.usuario.toLowerCase() === usuario)
      .map((item) => ({ id: item.id }));
    return [rows];
  }

  if (normalizedSql.startsWith('select id, nome, usuario, senha_hash from usuarios where lower(usuario) = lower(?)')) {
    const usuario = String(params[0] || '').toLowerCase();
    const rows = memoryState.usuarios
      .filter((item) => item.usuario.toLowerCase() === usuario)
      .map((item) => ({
        id: item.id,
        nome: item.nome,
        usuario: item.usuario,
        senha_hash: item.senha_hash,
      }));
    return [rows];
  }

  if (normalizedSql.startsWith('select id, nome, usuario from usuarios where id = ?')) {
    const userId = Number(params[0]);
    const user = memoryState.usuarios.find((item) => item.id === userId);
    return [[user ? { id: user.id, nome: user.nome, usuario: user.usuario } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('insert into usuarios (nome, usuario, senha_hash) values (?, ?, ?)')) {
    const [nome, usuario, senhaHash] = params;
    const exists = memoryState.usuarios.some((item) => item.usuario.toLowerCase() === String(usuario).toLowerCase());
    if (exists) {
      throw createDuplicateError('Usuario duplicado.');
    }

    const id = ++memoryState.counters.usuario;
    memoryState.usuarios.push({ id, nome, usuario, senha_hash: senhaHash, criado_em: nowIso() });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (normalizedSql.startsWith('insert into refresh_tokens (usuario_id, token, expires_at)')) {
    const [usuarioId, token, expiresAt] = params;
    const existing = memoryState.refresh_tokens.find((item) => item.usuario_id === Number(usuarioId));

    if (existing) {
      existing.token = token;
      existing.expires_at = expiresAt;
      existing.atualizado_em = nowIso();
      return [{ insertId: existing.id, affectedRows: 1 }];
    }

    const id = ++memoryState.counters.refreshToken;
    memoryState.refresh_tokens.push({
      id,
      usuario_id: Number(usuarioId),
      token,
      expires_at: expiresAt,
      criado_em: nowIso(),
      atualizado_em: nowIso(),
    });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (normalizedSql.startsWith('select token, expires_at from refresh_tokens where usuario_id = ?')) {
    const usuarioId = Number(params[0]);
    const token = memoryState.refresh_tokens.find((item) => item.usuario_id === usuarioId);
    return [[token ? { token: token.token, expires_at: token.expires_at } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('delete from refresh_tokens where usuario_id = ?')) {
    const usuarioId = Number(params[0]);
    const before = memoryState.refresh_tokens.length;
    memoryState.refresh_tokens = memoryState.refresh_tokens.filter((item) => item.usuario_id !== usuarioId);
    return [{ affectedRows: before - memoryState.refresh_tokens.length }];
  }

  if (normalizedSql.startsWith('delete from refresh_tokens where token = ?')) {
    const token = String(params[0] || '');
    const before = memoryState.refresh_tokens.length;
    memoryState.refresh_tokens = memoryState.refresh_tokens.filter((item) => item.token !== token);
    return [{ affectedRows: before - memoryState.refresh_tokens.length }];
  }

  if (normalizedSql.startsWith('select count(*) as total from salas s')) {
    let salas = [...memoryState.salas];
    let cursor = 0;

    if (normalizedSql.includes('s.nome like ?')) {
      salas = salas.filter((item) => likeMatch(item.nome, params[cursor++]));
    }

    if (normalizedSql.includes('s.turno = ?')) {
      salas = salas.filter((item) => item.turno === params[cursor++]);
    }

    return [[{ total: salas.length }]];
  }

  if (normalizedSql.startsWith('select s.id, s.nome, s.turno, count(a.id) as total_alunos from salas s') && normalizedSql.includes('where s.id = ?')) {
    const salaId = Number(params[0]);
    const sala = memoryState.salas.find((item) => item.id === salaId);
    if (!sala) {
      return [[]];
    }

    return [[{
      id: sala.id,
      nome: sala.nome,
      turno: sala.turno,
      total_alunos: memoryState.alunos.filter((aluno) => aluno.sala_id === sala.id).length,
    }]];
  }

  if (normalizedSql.startsWith('select s.id, s.nome, s.turno, count(a.id) as total_alunos from salas s')) {
    const hasPagination = normalizedSql.includes('limit ? offset ?');
    const baseParams = hasPagination ? params.slice(0, -2) : params;
    let salas = [...memoryState.salas];
    let cursor = 0;

    if (normalizedSql.includes('s.nome like ?')) {
      salas = salas.filter((item) => likeMatch(item.nome, baseParams[cursor++]));
    }

    if (normalizedSql.includes('s.turno = ?')) {
      salas = salas.filter((item) => item.turno === baseParams[cursor++]);
    }

    let rows = sortByName(salas).map((sala) => ({
      id: sala.id,
      nome: sala.nome,
      turno: sala.turno,
      total_alunos: memoryState.alunos.filter((aluno) => aluno.sala_id === sala.id).length,
    }));

    if (hasPagination) {
      const limit = Number(params.at(-2));
      const offset = Number(params.at(-1));
      rows = rows.slice(offset, offset + limit);
    }

    return [rows];
  }

  if (normalizedSql.startsWith('select id from salas where id = ?')) {
    const salaId = Number(params[0]);
    const sala = memoryState.salas.find((item) => item.id === salaId);
    return [[sala ? { id: sala.id } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('insert into salas (nome, turno) values (?, ?)')) {
    const [nome, turno] = params;
    const id = ++memoryState.counters.sala;
    memoryState.salas.push({ id, nome, turno, criado_em: nowIso() });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (normalizedSql.startsWith('select count(*) as total from alunos')) {
    let alunos = [...memoryState.alunos];
    let cursor = 0;

    if (normalizedSql.includes('sala_id = ?')) {
      alunos = alunos.filter((item) => item.sala_id === Number(params[cursor++]));
    }

    if (normalizedSql.includes('nome like ?')) {
      alunos = alunos.filter((item) => likeMatch(item.nome, params[cursor++]));
    }

    return [[{ total: alunos.length }]];
  }

  if (normalizedSql.startsWith('select id, nome from alunos where nome = ?')) {
    const nome = String(params[0] || '').toLowerCase();
    const aluno = memoryState.alunos.find((item) => item.nome.toLowerCase() === nome);
    return [[aluno ? { id: aluno.id } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('select id from alunos where id = ?')) {
    const alunoId = Number(params[0]);
    const aluno = memoryState.alunos.find((item) => item.id === alunoId);
    return [[aluno ? { id: aluno.id } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('select id from alunos where sala_id = ?')) {
    const salaId = Number(params[0]);
    const rows = memoryState.alunos.filter((item) => item.sala_id === salaId).map((item) => ({ id: item.id }));
    return [rows];
  }

  if (normalizedSql.startsWith('select id, nome from alunos')) {
    const hasPagination = normalizedSql.includes('limit ? offset ?');
    const baseParams = hasPagination ? params.slice(0, -2) : params;
    let alunos = [...memoryState.alunos];
    let cursor = 0;

    if (normalizedSql.includes('sala_id = ?')) {
      alunos = alunos.filter((item) => item.sala_id === Number(baseParams[cursor++]));
    }

    if (normalizedSql.includes('nome like ?')) {
      alunos = alunos.filter((item) => likeMatch(item.nome, baseParams[cursor++]));
    }

    let rows = sortByName(alunos).map((item) => ({ id: item.id, nome: item.nome }));

    if (hasPagination) {
      const limit = Number(params.at(-2));
      const offset = Number(params.at(-1));
      rows = rows.slice(offset, offset + limit);
    }

    return [rows];
  }

  if (normalizedSql.startsWith('insert into alunos (nome, sala_id) values (?, ?)')) {
    const [nome, salaId] = params;
    const id = ++memoryState.counters.aluno;
    memoryState.alunos.push({ id, nome, sala_id: Number(salaId), criado_em: nowIso() });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (normalizedSql.startsWith('select id, nome, email, telefone from responsaveis where aluno_id = ?')) {
    const alunoId = Number(params[0]);
    const rows = sortByName(memoryState.responsaveis.filter((item) => item.aluno_id === alunoId))
      .map((item) => ({ id: item.id, nome: item.nome, email: item.email, telefone: item.telefone }));
    return [rows];
  }

  if (normalizedSql.startsWith('insert into responsaveis (nome, email, telefone, aluno_id) values (?, ?, ?, ?)')) {
    const [nome, email, telefone, alunoId] = params;
    const exists = memoryState.responsaveis.some(
      (item) => item.aluno_id === Number(alunoId) && item.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (exists) {
      throw createDuplicateError('Responsavel duplicado.');
    }

    const id = ++memoryState.counters.responsavel;
    memoryState.responsaveis.push({ id, nome, email, telefone, aluno_id: Number(alunoId), criado_em: nowIso() });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (normalizedSql.startsWith('select a.id as aluno_id, a.nome as aluno_nome, f.status, f.data_aula, f.atualizado_em from alunos a')) {
    const [data, salaId] = params;
    const rows = sortByName(memoryState.alunos.filter((item) => item.sala_id === Number(salaId)))
      .map((aluno) => {
        const freq = memoryState.frequencias.find(
          (item) => item.aluno_id === aluno.id && item.sala_id === Number(salaId) && item.data_aula === data,
        );
        return {
          aluno_id: aluno.id,
          aluno_nome: aluno.nome,
          status: freq?.status || null,
          data_aula: freq?.data_aula || null,
          atualizado_em: freq?.atualizado_em || null,
        };
      });
    return [rows];
  }

  if (normalizedSql.startsWith('select f.data_aula,')) {
    const salaId = Number(params[0]);
    const { inicio, fim } = parseDateFilters(normalizedSql, params, 1);
    const grouped = new Map();

    memoryState.frequencias
      .filter((item) => item.sala_id === salaId && withinDateRange(item.data_aula, inicio, fim))
      .forEach((item) => {
        const current = grouped.get(item.data_aula) || { data_aula: item.data_aula, presentes: 0, faltas: 0, total_registros: 0 };
        if (item.status === 'presente') current.presentes += 1;
        if (item.status === 'falta') current.faltas += 1;
        current.total_registros += 1;
        grouped.set(item.data_aula, current);
      });

    const rows = [...grouped.values()].sort((a, b) => String(b.data_aula).localeCompare(String(a.data_aula)));
    return [rows];
  }

  if (normalizedSql.startsWith('select a.id as aluno_id, a.nome as aluno_nome, s.id as sala_id,')) {
    let cursor = 0;
    let salaId = null;

    if (normalizedSql.includes('where a.sala_id = ?')) {
      salaId = Number(params[cursor++]);
    }

    const { inicio, fim } = parseDateFilters(normalizedSql, params, cursor);
    const hasDateFilter = Boolean(inicio || fim);

    const rows = sortByName(memoryState.alunos.filter((aluno) => !salaId || aluno.sala_id === salaId))
      .map((aluno) => {
        const sala = memoryState.salas.find((item) => item.id === aluno.sala_id);
        const frequencias = memoryState.frequencias.filter((item) => item.aluno_id === aluno.id && item.sala_id === aluno.sala_id);
        const filteredFreqs = hasDateFilter
          ? frequencias.filter((item) => withinDateRange(item.data_aula, inicio, fim))
          : frequencias;

        return {
          aluno_id: aluno.id,
          aluno_nome: aluno.nome,
          sala_id: aluno.sala_id,
          sala_nome: sala?.nome || 'Sala',
          presentes: filteredFreqs.filter((item) => item.status === 'presente').length,
          faltas: filteredFreqs.filter((item) => item.status === 'falta').length,
          __total: filteredFreqs.length,
        };
      })
      .filter((item) => !hasDateFilter || item.__total > 0)
      .map(({ __total, ...item }) => item);

    return [rows];
  }

  if (normalizedSql.startsWith('select coalesce(sum(case when status = \'presente\' then 1 else 0 end), 0) as presentes,')) {
    const [salaId, inicio, fim] = params;
    const filtered = memoryState.frequencias.filter(
      (item) => item.sala_id === Number(salaId) && withinDateRange(item.data_aula, inicio, fim),
    );

    return [[{
      presentes: filtered.filter((item) => item.status === 'presente').length,
      faltas: filtered.filter((item) => item.status === 'falta').length,
      registros: filtered.length,
    }]];
  }

  if (normalizedSql.startsWith('select a.id as aluno_id, a.nome as aluno_nome, coalesce(sum(case when f.status = \'presente\' then 1 else 0 end), 0) as presentes,')) {
    const [inicio, fim, salaId] = params;
    const rows = sortByName(memoryState.alunos.filter((item) => item.sala_id === Number(salaId)))
      .map((aluno) => {
        const frequencias = memoryState.frequencias.filter(
          (item) => item.aluno_id === aluno.id && item.sala_id === aluno.sala_id && withinDateRange(item.data_aula, inicio, fim),
        );

        return {
          aluno_id: aluno.id,
          aluno_nome: aluno.nome,
          presentes: frequencias.filter((item) => item.status === 'presente').length,
          faltas: frequencias.filter((item) => item.status === 'falta').length,
          registros: frequencias.length,
        };
      });

    return [rows];
  }

  if (normalizedSql.startsWith('select a.id as aluno_id, a.nome as aluno_nome, a.sala_id, s.nome as sala_nome from alunos a')) {
    const alunoId = Number(params[0]);
    const aluno = memoryState.alunos.find((item) => item.id === alunoId);
    const sala = memoryState.salas.find((item) => item.id === aluno?.sala_id);

    return [[aluno ? {
      aluno_id: aluno.id,
      aluno_nome: aluno.nome,
      sala_id: aluno.sala_id,
      sala_nome: sala?.nome || 'Sala',
    } : undefined].filter(Boolean)];
  }

  if (normalizedSql.startsWith('select data_aula, status from frequencias where aluno_id = ?')) {
    const [alunoId, salaId, inicio, fim] = params;
    const rows = memoryState.frequencias
      .filter((item) => item.aluno_id === Number(alunoId) && item.sala_id === Number(salaId) && withinDateRange(item.data_aula, inicio, fim))
      .sort((a, b) => String(a.data_aula).localeCompare(String(b.data_aula)))
      .map((item) => ({ data_aula: item.data_aula, status: item.status }));
    return [rows];
  }

  if (normalizedSql.startsWith('insert into frequencias (aluno_id, sala_id, data_aula, status)')) {
    const [alunoId, salaId, dataAula, status] = params;
    const existing = memoryState.frequencias.find(
      (item) => item.aluno_id === Number(alunoId) && item.data_aula === String(dataAula),
    );

    if (existing) {
      existing.sala_id = Number(salaId);
      existing.status = status;
      existing.atualizado_em = nowIso();
      return [{ insertId: existing.id, affectedRows: 1 }];
    }

    const id = ++memoryState.counters.frequencia;
    memoryState.frequencias.push({
      id,
      aluno_id: Number(alunoId),
      sala_id: Number(salaId),
      data_aula: String(dataAula),
      status,
      atualizado_em: nowIso(),
    });
    return [{ insertId: id, affectedRows: 1 }];
  }

  throw new Error(`[MemoryDB] Query nao suportada: ${normalizedSql}`);
}

function createMemoryConnection() {
  let snapshot = null;

  return {
    async query(sql, params = []) {
      return handleMemoryQuery(sql, params);
    },
    async beginTransaction() {
      snapshot = cloneValue(memoryState);
    },
    async commit() {
      snapshot = null;
    },
    async rollback() {
      if (snapshot) {
        memoryState = cloneValue(snapshot);
        snapshot = null;
      }
    },
    async ping() {
      return true;
    },
    release() {
      return undefined;
    },
  };
}

function createMemoryPool() {
  return {
    async query(sql, params = []) {
      return handleMemoryQuery(sql, params);
    },
    async getConnection() {
      return createMemoryConnection();
    },
    on() {
      return undefined;
    },
  };
}

const pool = useInMemoryDb
  ? createMemoryPool()
  : mysql.createPool({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: false,
      connectTimeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
    });

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.code, err.message);
});

export async function testConnection() {
  if (useInMemoryDb) {
    return true;
  }

  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function initializeDatabase(retries = 3, delayMs = 2000) {
  if (useInMemoryDb) {
    console.log('[DB] Ambiente iniciado com armazenamento em memoria.');
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    let connection;
    try {
      connection = await mysql.createConnection({
        host: dbHost,
        user: dbUser,
        password: dbPassword,
        port: dbPort,
        multipleStatements: true,
        connectTimeout: 10000,
      });

      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await connection.query(`USE \`${dbName}\``);

      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schemaSql = await fs.readFile(schemaPath, 'utf8');
      await connection.query(schemaSql);
      return;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[DB] Tentativa ${attempt}/${retries} falhou: ${err.message}. Nova tentativa em ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    } finally {
      if (connection) {
        await connection.end().catch(() => {});
      }
    }
  }
}

export default pool;
