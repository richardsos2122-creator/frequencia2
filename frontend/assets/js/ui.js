export const SESSION_KEYS = {
  user: 'avanceUsuario',
  token: 'avanceToken',
  refreshToken: 'avanceRefreshToken',
};

export function showAlert(alertBox, message, type = 'error') {
  if (!alertBox) {
    return;
  }

  alertBox.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  alertBox.textContent = message;
}

export function getSessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEYS.user) || 'null');
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return sessionStorage.getItem(SESSION_KEYS.token);
}

export function clearSession() {
  Object.values(SESSION_KEYS).forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

export function redirectToLogin() {
  window.location.href = '/login.html';
}

export function clearSessionAndRedirect() {
  clearSession();
  redirectToLogin();
}

export function requireAuth() {
  const usuario = getSessionUser();
  const token = getAccessToken();

  if (!usuario || !token) {
    clearSessionAndRedirect();
    return null;
  }

  return { usuario, token };
}

export async function logoutUser(remoteLogout) {
  const refreshToken = sessionStorage.getItem(SESSION_KEYS.refreshToken);

  if (refreshToken && typeof remoteLogout === 'function') {
    try {
      await remoteLogout(refreshToken);
    } catch {
      // O encerramento local deve ocorrer mesmo se o backend falhar.
    }
  }

  clearSessionAndRedirect();
}
