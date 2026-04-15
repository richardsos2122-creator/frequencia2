import { post } from './api.js';
import { showAlert } from './ui.js';

const form = document.getElementById('forgot-form');
const alertBox = document.getElementById('alert-box');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const usuario = document.getElementById('usuario').value.trim();

  try {
    const data = await post('/auth/forgot-password', { usuario });
    showAlert(alertBox, data.message, 'success');
  } catch (error) {
    showAlert(alertBox, error.message);
  }
});
