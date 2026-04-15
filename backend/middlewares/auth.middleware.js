import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function authenticateToken(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Configuracao de autenticacao indisponivel.' });
  }
  const authHeader = String(req.headers.authorization || '');

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de acesso ausente.' });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso invalido.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = {
      id: Number(payload.sub) || null,
      nome: payload.nome ? String(payload.nome) : '',
      usuario: payload.usuario ? String(payload.usuario) : '',
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Token expirado ou invalido.' });
  }
}
