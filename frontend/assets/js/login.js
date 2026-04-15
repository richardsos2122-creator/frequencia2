import { post } from './api.js';
import { SESSION_KEYS, showAlert } from './ui.js';

const form = document.getElementById('login-form');
const alertBox = document.getElementById('alert-box');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  try {
    const data = await post('/auth/login', { usuario, senha });
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(data.usuario));
    sessionStorage.setItem(SESSION_KEYS.token, data.token);
    sessionStorage.setItem(SESSION_KEYS.refreshToken, data.refreshToken);
    window.location.href = '/dashboard.html';
  } catch (error) {
    showAlert(alertBox, error.message);
  }
});
