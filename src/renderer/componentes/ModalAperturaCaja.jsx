// ============================================================================
// ModalAperturaCaja.jsx — Apertura de Caja al Inicio del Día / Turno
//
// Responsabilidades:
//   - Solicitar al usuario el monto inicial de efectivo en gaveta para dar cambio
//   - Bloquear operaciones hasta que la caja quede formalmente abierta
//   - Registrar el movimiento de apertura en base de datos
//   - Operabilidad 100% por teclado (Enter para confirmar)
//   - Cumplimiento estricto: sin emojis y sin paréntesis
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';

export default function ModalAperturaCaja({ alConfirmar }) {
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const manejarSubmit = async (e) => {
    if (e) e.preventDefault();
    if (guardando) return;

    const valor = parseFloat(monto || 0);
    if (isNaN(valor) || valor < 0) {
      setError('Ingrese un monto válido');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await window.api.caja.abrirTurno({ montoInicial: valor, usuarioId: 1 });
      if (res && res.exito) {
        alConfirmar(valor);
      } else {
        setError(res?.error || 'No se pudo abrir el turno de caja');
        setGuardando(false);
      }
    } catch (err) {
      console.error('[ModalAperturaCaja] Error al abrir turno:', err);
      setError('Error de comunicación con la base de datos');
      setGuardando(false);
    }
  };

  const manejarKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manejarSubmit();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
      <div className="bg-gray-800 border-2 border-primario-500 rounded-2xl max-w-md w-full p-6 shadow-2xl animacion-modal">
        <div className="bg-gray-900 border-b border-gray-700 -mx-6 -mt-6 px-6 py-4 rounded-t-2xl mb-6">
          <h2 className="text-xl font-bold text-white text-center">Apertura de Caja e Inicio de Turno</h2>
        </div>

        <p className="text-gray-300 text-sm mb-6 text-center">
          Ingrese el importe de efectivo disponible en la gaveta para entregar cambio a los clientes:
        </p>

        <form onSubmit={manejarSubmit}>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-gray-400">$</span>
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onKeyDown={manejarKeyDown}
              placeholder="0.00"
              className="w-full bg-gray-900 border-2 border-primario-500 rounded-xl pl-12 pr-4 py-4 text-3xl font-black text-white text-right focus:outline-none focus:ring-4 focus:ring-primario-500/30"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-peligro/10 border border-peligro/30 rounded-xl text-peligro text-xs font-medium text-center">
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={guardando}
              className="w-full bg-primario-600 hover:bg-primario-500 text-white py-3.5 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primario-900/50 disabled:opacity-50"
            >
              <kbd className="bg-primario-800 px-2 py-0.5 rounded text-white text-xs">Enter</kbd>
              {guardando ? 'Iniciando turno...' : 'Confirmar Apertura de Caja'}
            </button>
          </div>

          <p className="text-center text-xs text-gray-500 mt-4">
            Presione la tecla Enter para confirmar e ingresar al sistema
          </p>
        </form>
      </div>
    </div>
  );
}
