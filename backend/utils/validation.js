const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
const SAFE_NAME_REGEX = /^[\p{L}\p{N} .,'-]+$/u;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{4,50}$/;
const PHONE_REGEX = /^[0-9+() -]{8,25}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function normalizeText(value, maxLength = 255) {
  return String(value ?? '')
    .replace(CONTROL_CHARS_REGEX, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeSearchTerm(value, maxLength = 60) {
  return normalizeText(value, maxLength).replace(/[%_]/g, '');
}

export function normalizeEmail(value) {
  return normalizeText(value, 120).toLowerCase();
}

export function normalizePhone(value) {
  return normalizeText(value, 25);
}

export function isSafeDisplayName(value, { min = 2, max = 120 } = {}) {
  const normalized = normalizeText(value, max);
  return normalized.length >= min && normalized.length <= max && SAFE_NAME_REGEX.test(normalized);
}

export function isValidUsername(value) {
  return USERNAME_REGEX.test(normalizeText(value, 50));
}

export function isValidPassword(value) {
  const password = String(value ?? '');
  return password.length >= 10
    && /[a-z]/i.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 120 && EMAIL_REGEX.test(email);
}

export function isValidPhone(value) {
  return PHONE_REGEX.test(normalizePhone(value));
}

export function isValidTurno(value) {
  const turno = normalizeText(value, 30);
  return turno.length >= 2 && /^[\p{L} ]+$/u.test(turno);
}

export function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function parsePagination(query = {}) {
  const page = Number(query.page);
  const limit = Number(query.limit);

  if (!Number.isInteger(page) || page <= 0 || !Number.isInteger(limit) || limit <= 0) {
    return null;
  }

  const safeLimit = Math.min(limit, 100);

  return {
    page,
    limit: safeLimit,
    offset: (page - 1) * safeLimit,
  };
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function isValidMonth(value) {
  return /^[0-9]{4}-[0-9]{2}$/.test(normalizeText(value));
}

export function getMonthDateRange(monthValue) {
  if (!isValidMonth(monthValue)) {
    return null;
  }

  const inicio = `${monthValue}-01`;
  const [year, month] = monthValue.split('-').map(Number);
  const fim = new Date(year, month, 0).toISOString().slice(0, 10);

  return { inicio, fim };
}
