export function normalizeText(value) {
  return String(value || '').trim();
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
