import { clearSessionAndRedirect, SESSION_KEYS } from './ui.js';

const LOCAL_API_BASE = 'http://localhost:3000/api';

function isLocalHost(hostname = '') {
  const normalized = String(hostname || '').toLowerCase();

  return /^(localhost|0\.0\.0\.0)$/i.test(normalized)
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(normalized)
    || /^10(?:\.\d{1,3}){3}$/.test(normalized)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(normalized)
    || normalized.endsWith('.local')
    || (!normalized.includes('.') && /^[a-z0-9-]+$/i.test(normalized));
}

function resolveApiBases() {
  const { protocol, hostname, origin, port } = window.location;
  const isWebProtocol = protocol === 'http:' || protocol === 'https:';

  if (!isWebProtocol) {
    return [LOCAL_API_BASE];
  }

  const normalizedHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
  const candidates = [];

  if (isLocalHost(hostname)) {
    if (port === '3000') {
      candidates.push(`${origin}/api`);
    }

    candidates.push(`http://${normalizedHost}:3000/api`);
    candidates.push(LOCAL_API_BASE);
  } else {
    candidates.push(`${origin}/api`);
    candidates.push(LOCAL_API_BASE);
  }

  return [...new Set(candidates.filter(Boolean))];
}

const API_BASES = resolveApiBases();
let activeApiBase = API_BASES[0] || LOCAL_API_BASE;
let refreshPromise = null;

async function fetchWithApiFallback(path, options = {}) {
  for (const apiBase of [activeApiBase, ...API_BASES.filter((base) => base !== activeApiBase)]) {
    try {
      const response = await fetch(`${apiBase}${path}`, options);
      activeApiBase = apiBase;
      return response;
    } catch {
      // tenta a proxima base automaticamente
    }
  }

  throw new Error('Nao foi possivel conectar ao servidor. Verifique se a API esta ativa.');
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = sessionStorage.getItem(SESSION_KEYS.token);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  const data = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => '');

  if (!response.ok) {
    if (isJson && data?.message) {
      throw new Error(data.message);
    }

    if (isJson && typeof data === 'object' && Object.keys(data).length > 0) {
      throw new Error(`Erro HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    if (typeof data === 'string' && data.trim()) {
      const htmlLike = /<!doctype|<html|<body/i.test(data);
      if (htmlLike && response.status >= 500) {
        throw new Error('A API está indisponível no momento. Verifique se o backend foi iniciado com npm start.');
      }

      throw new Error(`Erro HTTP ${response.status}: ${data.trim()}`);
    }

    if (response.status >= 500) {
      throw new Error('A API está indisponível no momento. Verifique se o backend foi iniciado com npm start.');
    }

    throw new Error(`Erro na requisicao (HTTP ${response.status}).`);
  }

  return data;
}

async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = sessionStorage.getItem(SESSION_KEYS.refreshToken);
  if (!refreshToken) {
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  refreshPromise = (async () => {
    const response = await fetchWithApiFallback('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {
      throw new Error('Nao foi possivel conectar ao servidor para renovar a sessao.');
    });

    if (!response.ok) {
      throw new Error('Nao foi possivel renovar a sessao.');
    }

    const data = await response.json();
    sessionStorage.setItem(SESSION_KEYS.token, data.token);
    sessionStorage.setItem(SESSION_KEYS.refreshToken, data.refreshToken);

    if (data.usuario) {
      sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(data.usuario));
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request(path, options = {}, shouldRetry = true) {
  const response = await fetchWithApiFallback(path, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && !String(path).startsWith('/auth') && shouldRetry) {
    try {
      await refreshAccessToken();
      return request(path, options, false);
    } catch {
      clearSessionAndRedirect();
      throw new Error('Sessao expirada. Faca login novamente.');
    }
  }

  return parseResponse(response);
}

export async function post(path, payload) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function get(path) {
  return request(path, {
    method: 'GET',
  });
}

