import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { normalizeText } from '../utils/validation.js';

const router = Router();

router.get('/', (_req, res) => {
  return res.json({
    message: 'Auth API: use POST /register, /login, /refresh, /logout, /forgot-password.',
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

function isValidUsername(value) {
  return value.length >= 4 && value.length <= 50 && !/\s/.test(value);
}

function isValidPassword(value) {
  return value.length >= 8 && /[0-9]/.test(value);
}

function buildAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      nome: user.nome,
      usuario: user.usuario,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' },
  );
}

function buildRefreshToken(userId) {
  return jwt.sign(
    {
      sub: String(userId),
      type: 'refresh',
    },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN, algorithm: 'HS256' },
  );
}

async function persistRefreshToken(userId, refreshToken) {
  const decoded = jwt.decode(refreshToken);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (usuario_id, token, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), atualizado_em = CURRENT_TIMESTAMP`,
    [userId, refreshToken, expiresAt],
  );
}

router.post('/register', async (req, res) => {
  try {
    const { nome, usuario, senha } = req.body;
    const nomeNormalizado = normalizeText(nome);
    const usuarioNormalizado = normalizeText(usuario);
    const senhaNormalizada = normalizeText(senha);

    if (!nomeNormalizado || !usuarioNormalizado || !senhaNormalizada) {
      return res.status(400).json({ message: 'Preencha nome, usuario e senha.' });
    }

    if (!isValidUsername(usuarioNormalizado)) {
      return res.status(400).json({ message: 'O usuario deve ter entre 4 e 50 caracteres e sem espacos.' });
    }

    if (!isValidPassword(senhaNormalizada)) {
      return res.status(400).json({ message: 'A senha deve ter ao menos 8 caracteres e incluir numeros.' });
    }

    const [exists] = await pool.query('SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER(?)', [usuarioNormalizado]);

    if (exists.length > 0) {
      return res.status(409).json({
        message: 'Este usuario de login ja existe. O nome pode se repetir; escolha outro usuario.',
      });
    }

    const senhaHash = await bcrypt.hash(senhaNormalizada, BCRYPT_SALT_ROUNDS);
    await pool.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash) VALUES (?, ?, ?)',
      [nomeNormalizado, usuarioNormalizado, senhaHash],
    );

    return res.status(201).json({ message: 'Usuario cadastrado com sucesso.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao cadastrar usuario.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const usuarioNormalizado = String(usuario || '').trim();
    const senhaNormalizada = String(senha || '').trim();

    if (!usuarioNormalizado || !senhaNormalizada) {
      return res.status(400).json({ message: 'Informe usuario e senha.' });
    }

    const [rows] = await pool.query(
      'SELECT id, nome, usuario, senha_hash FROM usuarios WHERE LOWER(usuario) = LOWER(?)',
      [usuarioNormalizado],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Usuario ou senha invalidos.' });
    }

    const user = rows[0];
    const passwordOk = await bcrypt.compare(senhaNormalizada, user.senha_hash);

    if (!passwordOk) {
      return res.status(401).json({ message: 'Usuario ou senha invalidos.' });
    }

    const token = buildAccessToken(user);
    const refreshToken = buildRefreshToken(user.id);
    await persistRefreshToken(user.id, refreshToken);

    return res.json({
      message: 'Login realizado com sucesso.',
      token,
      refreshToken,
      usuario: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao realizar login.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { usuario } = req.body;

  if (!usuario) {
    return res.status(400).json({ message: 'Informe o usuario para recuperar a senha.' });
  }

  return res.json({ message: 'Solicitacao recebida. Procure a secretaria do apoio escolar Avance.' });
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token ausente.' });
    }

    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    if (payload?.type !== 'refresh') {
      return res.status(401).json({ message: 'Refresh token invalido.' });
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Refresh token invalido.' });
    }

    const [tokenRows] = await pool.query(
      `SELECT token, expires_at
       FROM refresh_tokens
       WHERE usuario_id = ?
       LIMIT 1`,
      [userId],
    );

    if (tokenRows.length === 0 || tokenRows[0].token !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token nao reconhecido.' });
    }

    if (tokenRows[0].expires_at && new Date(tokenRows[0].expires_at) <= new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = ?', [userId]);
      return res.status(401).json({ message: 'Refresh token expirado.' });
    }

    const [userRows] = await pool.query(
      'SELECT id, nome, usuario FROM usuarios WHERE id = ? LIMIT 1',
      [userId],
    );

    if (userRows.length === 0) {
      await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = ?', [userId]);
      return res.status(401).json({ message: 'Usuario nao encontrado para renovar sessao.' });
    }

    const user = userRows[0];
    const newToken = buildAccessToken(user);
    const newRefreshToken = buildRefreshToken(user.id);
    await persistRefreshToken(user.id, newRefreshToken);

    return res.json({
      message: 'Sessao renovada com sucesso.',
      token: newToken,
      refreshToken: newRefreshToken,
      usuario: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
      },
    });
  } catch {
    return res.status(401).json({ message: 'Refresh token invalido ou expirado.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token ausente.' });
    }

    await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

    return res.json({ message: 'Logout realizado com sucesso.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao realizar logout.' });
  }
});

export default router;
