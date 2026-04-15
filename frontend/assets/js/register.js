import { post } from './api.js';
import { showAlert } from './ui.js';

const form = document.getElementById('register-form');
const alertBox = document.getElementById('alert-box');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nome = document.getElementById('nome').value.trim();
  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  try {
    const data = await post('/auth/register', { nome, usuario, senha });
    showAlert(alertBox, data.message, 'success');
    form.reset();
  } catch (error) {
    showAlert(alertBox, error.message);
  }
});
