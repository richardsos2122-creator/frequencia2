import { Router } from 'express';
import pool from '../config/db.js';
import {
  isSafeDisplayName,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  parsePagination,
  parsePositiveInt,
  sanitizeSearchTerm,
} from '../utils/validation.js';

const router = Router();

router.get('/alunos', async (req, res) => {
  try {
    const salaId = parsePositiveInt(req.query.salaId);
    const search = sanitizeSearchTerm(req.query.search, 60);
    const includeMeta = String(req.query.includeMeta || '').toLowerCase() === 'true';
    const pagination = parsePagination(req.query);

    const where = [];
    const params = [];

    if (salaId) {
      where.push('sala_id = ?');
      params.push(salaId);
    }

    if (search) {
      where.push('nome LIKE ?');
      params.push(`%${search}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const paginationSql = pagination ? 'LIMIT ? OFFSET ?' : '';
    const listParams = pagination ? [...params, pagination.limit, pagination.offset] : params;

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
    return res.status(500).json({ message: 'Erro ao carregar alunos.' });
  }
});

router.get('/aluno/:alunoId', async (req, res) => {
  try {
    const alunoId = parsePositiveInt(req.params.alunoId);

    if (!alunoId) {
      return res.status(400).json({ message: 'Aluno invalido.' });
    }

    const [alunoRows] = await pool.query('SELECT id FROM alunos WHERE id = ? LIMIT 1', [alunoId]);
    if (alunoRows.length === 0) {
      return res.status(404).json({ message: 'Aluno nao encontrado.' });
    }

    const [responsaveis] = await pool.query(
      `SELECT id, nome, email, telefone
       FROM responsaveis
       WHERE aluno_id = ?
       ORDER BY nome`,
      [alunoId],
    );

    return res.json(responsaveis);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao carregar responsaveis do aluno.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const alunoId = parsePositiveInt(req.body?.alunoId);
    const nomeResponsavel = normalizeText(req.body?.nomeResponsavel, 120);
    const email = normalizeEmail(req.body?.email);
    const nomeAluno = normalizeText(req.body?.nomeAluno, 120);
    const telefone = normalizePhone(req.body?.telefone);

    if (!nomeResponsavel || !email || !telefone || (!alunoId && !nomeAluno)) {
      return res.status(400).json({ message: 'Preencha todos os campos do responsavel (nome, email, telefone e alunoId ou nomeAluno).' });
    }

    if (!isSafeDisplayName(nomeResponsavel, { min: 2, max: 120 }) || !isValidEmail(email) || !isValidPhone(telefone)) {
      return res.status(400).json({ message: 'Os dados do responsavel contem valores invalidos.' });
    }

    let alunoIdFinal = alunoId;

    if (!alunoIdFinal && nomeAluno) {
      const [alunoRows] = await pool.query(
        'SELECT id FROM alunos WHERE nome = ? LIMIT 1',
        [nomeAluno],
      );

      if (alunoRows.length === 0) {
        return res.status(404).json({ message: 'Aluno nao encontrado. Use o nome listado no sistema ou forneça o alunoId.' });
      }

      alunoIdFinal = alunoRows[0].id;
    }

    if (!alunoIdFinal) {
      return res.status(400).json({ message: 'Aluno invalido.' });
    }

    await pool.query(
      `INSERT INTO responsaveis (nome, email, telefone, aluno_id)
       VALUES (?, ?, ?, ?)`,
      [nomeResponsavel, email, telefone, alunoIdFinal],
    );

    return res.status(201).json({ message: 'Responsavel cadastrado com sucesso.' });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ja existe responsavel com este e-mail para este aluno.' });
    }

    console.error(error);
    return res.status(500).json({ message: 'Erro ao cadastrar responsavel.' });
  }
});

export default router;
