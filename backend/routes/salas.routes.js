import { Router } from 'express';
import pool from '../config/db.js';
import { parsePagination, parsePositiveInt } from '../utils/validation.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const turno = String(req.query.turno || '').trim();
    const includeMeta = String(req.query.includeMeta || '').toLowerCase() === 'true';
    const pagination = parsePagination(req.query);
    const params = [];
    const where = [];

    if (search) {
      where.push('s.nome LIKE ?');
      params.push(`%${search}%`);
    }

    if (turno) {
      where.push('s.turno = ?');
      params.push(turno);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    let total = null;
    if (includeMeta || pagination) {
      const [totalRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM salas s
         ${whereSql}`,
        params,
      );
      total = Number(totalRows[0]?.total || 0);
    }

    const paginationSql = pagination ? 'LIMIT ? OFFSET ?' : '';
    const listParams = pagination ? [...params, pagination.limit, pagination.offset] : params;

    const [salas] = await pool.query(
      `SELECT s.id, s.nome, s.turno, COUNT(a.id) AS total_alunos
       FROM salas s
       LEFT JOIN alunos a ON a.sala_id = s.id
       ${whereSql}
       GROUP BY s.id
       ORDER BY s.nome
       ${paginationSql}`,
      listParams,
    );

    if (!includeMeta && !pagination) {
      return res.json(salas);
    }

    return res.json({
      items: salas,
      meta: {
        total,
        page: pagination?.page || 1,
        limit: pagination?.limit || salas.length || 0,
        hasNextPage: pagination ? pagination.offset + salas.length < total : false,
      },
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao buscar salas.' });
  }
});

router.get('/:salaId', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.params.salaId);

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    const [rows] = await pool.query(
      `SELECT s.id, s.nome, s.turno, COUNT(a.id) AS total_alunos
       FROM salas s
       LEFT JOIN alunos a ON a.sala_id = s.id
       WHERE s.id = ?
       GROUP BY s.id
       LIMIT 1`,
      [salaId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Sala nao encontrada.' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao buscar detalhes da sala.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    const turno = String(req.body?.turno || '').trim();

    if (!nome || !turno) {
      return res.status(400).json({ message: 'Informe nome e turno da sala.' });
    }

    if (nome.length > 80 || turno.length > 30) {
      return res.status(400).json({ message: 'Nome ou turno da sala excede o limite permitido.' });
    }

    const [result] = await pool.query(
      'INSERT INTO salas (nome, turno) VALUES (?, ?)',
      [nome, turno],
    );

    return res.status(201).json({
      message: 'Sala criada com sucesso.',
      salaId: result.insertId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao criar sala.' });
  }
});

router.post('/:salaId/alunos', async (req, res) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();

    const salaId = parsePositiveInt(req.params.salaId);
    const nome = String(req.body?.nome || '').trim();
    const responsaveis = Array.isArray(req.body?.responsaveis)
      ? req.body.responsaveis
      : [];

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    if (!nome) {
      return res.status(400).json({ message: 'Informe o nome do aluno.' });
    }

    if (nome.length > 120) {
      return res.status(400).json({ message: 'Nome do aluno excede o limite permitido.' });
    }

    const [salaRows] = await connection.query('SELECT id FROM salas WHERE id = ? LIMIT 1', [salaId]);
    if (salaRows.length === 0) {
      return res.status(404).json({ message: 'Sala nao encontrada.' });
    }

    const responsaveisNormalizados = [];
    const emailsNormalizados = new Set();

    for (const responsavel of responsaveis) {
      const nomeResponsavel = String(responsavel?.nome || '').trim();
      const email = String(responsavel?.email || '').trim();
      const telefone = String(responsavel?.telefone || '').trim();

      if (!nomeResponsavel || !email || !telefone) {
        return res.status(400).json({ message: 'Cada responsavel precisa ter nome, email e telefone.' });
      }

      if (nomeResponsavel.length > 120 || email.length > 120 || telefone.length > 25) {
        return res.status(400).json({ message: 'Dados do responsavel excedem o limite permitido.' });
      }

      const emailKey = email.toLowerCase();
      if (emailsNormalizados.has(emailKey)) {
        return res.status(400).json({ message: 'Nao repita o mesmo email na lista de responsaveis.' });
      }

      emailsNormalizados.add(emailKey);
      responsaveisNormalizados.push({ nome: nomeResponsavel, email, telefone });
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const [result] = await connection.query(
      'INSERT INTO alunos (nome, sala_id) VALUES (?, ?)',
      [nome, salaId],
    );

    for (const responsavel of responsaveisNormalizados) {
      await connection.query(
        `INSERT INTO responsaveis (nome, email, telefone, aluno_id)
         VALUES (?, ?, ?, ?)`,
        [responsavel.nome, responsavel.email, responsavel.telefone, result.insertId],
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: responsaveisNormalizados.length > 0
        ? 'Aluno e responsaveis cadastrados com sucesso.'
        : 'Aluno cadastrado com sucesso.',
      alunoId: result.insertId,
      salaId,
      totalResponsaveis: responsaveisNormalizados.length,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ja existe responsavel com este e-mail para este aluno.' });
    }

    console.error(error);
    return res.status(500).json({ message: 'Erro ao cadastrar aluno.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get('/:salaId/alunos', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.params.salaId);
    const search = String(req.query.search || '').trim();
    const includeMeta = String(req.query.includeMeta || '').toLowerCase() === 'true';
    const pagination = parsePagination(req.query);

    if (!salaId) {
      return res.status(400).json({ message: 'Sala invalida.' });
    }

    const [salaRows] = await pool.query('SELECT id FROM salas WHERE id = ? LIMIT 1', [salaId]);
    if (salaRows.length === 0) {
      return res.status(404).json({ message: 'Sala nao encontrada.' });
    }

    const params = [salaId];
    const where = ['sala_id = ?'];

    if (search) {
      where.push('nome LIKE ?');
      params.push(`%${search}%`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    let total = null;
    if (includeMeta || pagination) {
      const [totalRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM alunos
         ${whereSql}`,
        params,
      );
      total = Number(totalRows[0]?.total || 0);
    }

    const paginationSql = pagination ? 'LIMIT ? OFFSET ?' : '';
    const listParams = pagination ? [...params, pagination.limit, pagination.offset] : params;

    const [alunos] = await pool.query(
      `SELECT id, nome
       FROM alunos
       ${whereSql}
       ORDER BY nome
       ${paginationSql}`,
      listParams,
    );

    if (!includeMeta && !pagination) {
      return res.json(alunos);
    }

    return res.json({
      items: alunos,
      meta: {
        total,
        page: pagination?.page || 1,
        limit: pagination?.limit || alunos.length || 0,
        hasNextPage: pagination ? pagination.offset + alunos.length < total : false,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao buscar alunos da sala.' });
  }
});

export default router;
