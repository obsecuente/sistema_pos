import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './estilos.css';

// ─── Instalar mock API si no estamos en Electron ────────────────────────
// Cuando la app corre en el navegador (npm run dev), window.api no existe
// porque no hay preload.js. Instalamos un mock para desarrollo/demo.
if (!window.api) {
  import('./mockApi.js').then(({ default: mockApi }) => {
    window.api = mockApi;
    console.log('[App] Modo demo: usando API mock (sin base de datos)');
    montar();
  });
} else {
  montar();
}

function montar() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
