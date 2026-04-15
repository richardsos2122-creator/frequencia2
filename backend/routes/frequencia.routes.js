import { Router } from 'express';
import pool from '../config/db.js';
import {
  getMonthDateRange,
  isValidDate,
  isValidMonth,
  parsePositiveInt,
} from '../utils/validation.js';

const router = Router();

router.get('/sala/:salaId/data/:data', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.params.salaId);
    const { data } = req.params;

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    if (!isValidDate(data)) {
      return res.status(400).json({ message: 'Data invalida. Use o formato YYYY-MM-DD.' });
    }

    const [registros] = await pool.query(
      `SELECT a.id AS aluno_id, a.nome AS aluno_nome, f.status, f.data_aula, f.atualizado_em
       FROM alunos a
       LEFT JOIN frequencias f
         ON f.aluno_id = a.id
        AND f.sala_id = a.sala_id
        AND f.data_aula = ?
       WHERE a.sala_id = ?
       ORDER BY a.nome`,
      [data, salaId],
    );

    return res.json({ salaId, data, registros });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao consultar frequencia da sala.' });
  }
});

router.get('/sala/:salaId/historico', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.params.salaId);
    const inicio = String(req.query.inicio || '').trim();
    const fim = String(req.query.fim || '').trim();

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    if ((inicio && !isValidDate(inicio)) || (fim && !isValidDate(fim))) {
      return res.status(400).json({ message: 'Datas invalidas. Use o formato YYYY-MM-DD.' });
    }

    const params = [salaId];
    const clauses = ['f.sala_id = ?'];

    if (inicio) {
      clauses.push('f.data_aula >= ?');
      params.push(inicio);
    }

    if (fim) {
      clauses.push('f.data_aula <= ?');
      params.push(fim);
    }

    const [historico] = await pool.query(
      `SELECT f.data_aula,
              SUM(CASE WHEN f.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
              SUM(CASE WHEN f.status = 'falta' THEN 1 ELSE 0 END) AS faltas,
              COUNT(*) AS total_registros
       FROM frequencias f
       WHERE ${clauses.join(' AND ')}
       GROUP BY f.data_aula
       ORDER BY f.data_aula DESC`,
      params,
    );

    return res.json({ salaId, inicio: inicio || null, fim: fim || null, historico });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao consultar historico de frequencia.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.query.salaId);
    const mes = String(req.query.mes || '').trim();
    const inicio = String(req.query.inicio || '').trim();
    const fim = String(req.query.fim || '').trim();
    const filters = [];
    const params = [];

    if (salaId) {
      filters.push('a.sala_id = ?');
      params.push(salaId);
    }

    if (mes) {
      if (!isValidMonth(mes)) {
        return res.status(400).json({ message: 'Mês invalido. Use o formato YYYY-MM.' });
      }

      const { inicio, fim } = getMonthDateRange(mes);
      filters.push('f.data_aula BETWEEN ? AND ?');
      params.push(inicio, fim);
    } else if (inicio || fim) {
      if ((inicio && !isValidDate(inicio)) || (fim && !isValidDate(fim))) {
        return res.status(400).json({ message: 'Datas invalidas. Use o formato YYYY-MM-DD.' });
      }

      if (inicio && fim) {
        filters.push('f.data_aula BETWEEN ? AND ?');
        params.push(inicio, fim);
      } else if (inicio) {
        filters.push('f.data_aula >= ?');
        params.push(inicio);
      } else {
        filters.push('f.data_aula <= ?');
        params.push(fim);
      }
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT a.id AS aluno_id,
              a.nome AS aluno_nome,
              s.id AS sala_id,
              s.nome AS sala_nome,
              COALESCE(SUM(CASE WHEN f.status = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
              COALESCE(SUM(CASE WHEN f.status = 'falta' THEN 1 ELSE 0 END), 0) AS faltas
       FROM alunos a
       JOIN salas s ON s.id = a.sala_id
       LEFT JOIN frequencias f
         ON f.aluno_id = a.id
        AND f.sala_id = a.sala_id
       ${whereSql}
       GROUP BY a.id, a.nome, s.id, s.nome
       ORDER BY s.nome, a.nome`,
      params,
    );

    return res.json({
      salaId: salaId || null,
      mes: mes || null,
      inicio: inicio || null,
      fim: fim || null,
      alunos: rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao buscar lista de frequencia.' });
  }
});

router.get('/sala/:salaId/mensal', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.params.salaId);
    const mes = String(req.query.mes || '').trim();

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    if (!isValidMonth(mes)) {
      return res.status(400).json({ message: 'Mês invalido. Use o formato YYYY-MM.' });
    }

    const { inicio, fim: lastDay } = getMonthDateRange(mes);

    const [totaisRows] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
         COALESCE(SUM(CASE WHEN status = 'falta' THEN 1 ELSE 0 END), 0) AS faltas,
         COUNT(*) AS registros
       FROM frequencias
       WHERE sala_id = ?
         AND data_aula BETWEEN ? AND ?`,
      [salaId, inicio, lastDay],
    );

    const [alunosResumo] = await pool.query(
      `SELECT a.id AS aluno_id,
              a.nome AS aluno_nome,
              COALESCE(SUM(CASE WHEN f.status = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
              COALESCE(SUM(CASE WHEN f.status = 'falta' THEN 1 ELSE 0 END), 0) AS faltas,
              COALESCE(COUNT(f.id), 0) AS registros
       FROM alunos a
       LEFT JOIN frequencias f
         ON f.aluno_id = a.id
        AND f.sala_id = a.sala_id
        AND f.data_aula BETWEEN ? AND ?
       WHERE a.sala_id = ?
       GROUP BY a.id
       ORDER BY a.nome`,
      [inicio, lastDay, salaId],
    );

    return res.json({
      salaId,
      mes,
      totais: totaisRows[0] || { presentes: 0, faltas: 0, registros: 0 },
      alunos: alunosResumo,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao consultar relatorio mensal de frequencia.' });
  }
});

async function handleAlunoMensal(req, res) {
  try {
    const alunoId = parsePositiveInt(req.params.alunoId);
    const salaIdParam = req.params.salaId ? parsePositiveInt(req.params.salaId) : null;
    const mes = String(req.query.mes || '').trim();

    if (!alunoId) {
      return res.status(400).json({ message: 'Aluno invalido.' });
    }

    if (salaIdParam === null && req.params.salaId !== undefined && req.params.salaId !== '') {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    if (!isValidMonth(mes)) {
      return res.status(400).json({ message: 'Mês invalido. Use o formato YYYY-MM.' });
    }

    const [alunoRows] = await pool.query(
      `SELECT a.id AS aluno_id,
              a.nome AS aluno_nome,
              a.sala_id,
              s.nome AS sala_nome
       FROM alunos a
       JOIN salas s ON s.id = a.sala_id
       WHERE a.id = ?
       LIMIT 1`,
      [alunoId],
    );

    if (alunoRows.length === 0) {
      return res.status(404).json({ message: 'Aluno nao encontrado.' });
    }

    const aluno = alunoRows[0];
    if (salaIdParam && aluno.sala_id !== salaIdParam) {
      return res.status(400).json({ message: 'Aluno nao pertence a esta sala.' });
    }

    const { inicio, fim: lastDay } = getMonthDateRange(mes);

    const [dias] = await pool.query(
      `SELECT data_aula, status
       FROM frequencias
       WHERE aluno_id = ?
         AND sala_id = ?
         AND data_aula BETWEEN ? AND ?
       ORDER BY data_aula`,
      [alunoId, aluno.sala_id, inicio, lastDay],
    );

    const totais = dias.reduce(
      (acc, registro) => {
        if (registro.status === 'presente') acc.presentes += 1;
        if (registro.status === 'falta') acc.faltas += 1;
        acc.registros += 1;
        return acc;
      },
      { presentes: 0, faltas: 0, registros: 0 },
    );

    return res.json({
      alunoId,
      alunoNome: aluno.aluno_nome,
      salaId: aluno.sala_id,
      salaNome: aluno.sala_nome,
      mes,
      totais,
      dias,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao consultar frequencia individual mensal.' });
  }
}

router.get('/aluno/:alunoId/mensal', handleAlunoMensal);
router.get('/sala/:salaId/aluno/:alunoId/mensal', handleAlunoMensal);

router.post('/', async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    const salaId = parsePositiveInt(req.body?.salaId);
    const data = String(req.body?.data || '').trim();
    const registros = Array.isArray(req.body?.registros) ? req.body.registros : null;

    if (!salaId || !isValidDate(data) || !registros || registros.length === 0) {
      return res.status(400).json({ message: 'Envie sala, data e registros de frequencia.' });
    }

    if (registros.length > 500) {
      return res.status(400).json({ message: 'Quantidade de registros acima do limite permitido.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [alunosSala] = await connection.query('SELECT id FROM alunos WHERE sala_id = ?', [salaId]);
    const alunosPermitidos = new Set(alunosSala.map((aluno) => aluno.id));

    if (alunosPermitidos.size === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sala nao encontrada ou sem alunos.' });
    }

    const alunoIdsRecebidos = new Set();

    for (const registro of registros) {
      const alunoId = parsePositiveInt(registro?.alunoId);
      const status = String(registro?.status || '').trim();

      if (!alunoId || !alunosPermitidos.has(alunoId)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Lista de alunos invalida para a sala informada.' });
      }

      if (status !== 'presente' && status !== 'falta') {
        await connection.rollback();
        return res.status(400).json({ message: 'Status invalido. Use presente ou falta.' });
      }

      if (alunoIdsRecebidos.has(alunoId)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Aluno repetido na lista de frequencia.' });
      }

      alunoIdsRecebidos.add(alunoId);
    }

    const values = registros.map((reg) => [reg.alunoId, salaId, data, reg.status]);
    for (const [alunoId, sId, dataAula, status] of values) {
      await connection.query(
        `INSERT INTO frequencias (aluno_id, sala_id, data_aula, status)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), atualizado_em = CURRENT_TIMESTAMP`,
        [alunoId, sId, dataAula, status],
      );
    }

    await connection.commit();
    return res.status(201).json({ message: 'Frequencia salva com sucesso.' });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }
    console.error(error);
    return res.status(500).json({ message: 'Erro ao salvar frequencia.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;