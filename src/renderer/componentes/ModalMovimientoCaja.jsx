// ============================================================================
// ModalMovimientoCaja.jsx — Ingreso y Egreso de Efectivo en Caja Chica (F8)
//
// Responsabilidades:
//   - Registrar ingresos manuales de efectivo (aporte de cambio adicional)
//   - Registrar egresos manuales de efectivo (retiros, gastos, pagos varios)
//   - Monto obligatorio (> 0) y motivo opcional
//   - Operabilidad 100% por teclado (Enter, Flechas, Tab, Escape)
//   - Cumplimiento estricto: sin emojis y sin paréntesis
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';

export default function ModalMovimientoCaja({ alConfirmar, alCerrar }) {
  const [tipo, setTipo] = useState('egreso'); // 'ingreso' | 'egreso'
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const inputMontoRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputMontoRef.current?.focus(), 80);
  }, [tipo]);

  const manejarSubmit = async (e) => {
    if (e) e.preventDefault();
    if (guardando) return;

    const valor = parseFloat(monto || 0);
    if (isNaN(valor) || valor <= 0) {
      setError('El monto debe ser mayor a cero');
      inputMontoRef.current?.focus();
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await window.api.caja.registrarMovimiento({
        tipo,
        monto: valor,
        motivo: motivo.trim() || null,
        usuarioId: 1,
      });

      if (res && res.exito) {
        alConfirmar({ tipo, monto: valor, motivo: motivo.trim() });
      } else {
        setError(res?.error || 'No se pudo registrar el movimiento de caja');
        setGuardando(false);
      }
    } catch (err) {
      console.error('[ModalMovimientoCaja] Error al registrar:', err);
      setError('Error de comunicación con la base de datos');
      setGuardando(false);
    }
  };

  const manejarKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      alCerrar();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4" onKeyDown={manejarKeyDown}>
      <div className="bg-gray-800 border-2 border-primario-500 rounded-2xl max-w-md w-full p-6 shadow-2xl animacion-modal">
        <div className="bg-gray-900 border-b border-gray-700 -mx-6 -mt-6 px-6 py-4 rounded-t-2xl mb-6">
          <h2 className="text-xl font-bold text-white text-center">Movimiento de Efectivo en Caja</h2>
        </div>

        {/* SELECTOR DE TIPO: INGRESO O EGRESO */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setTipo('egreso')}
            className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
              tipo === 'egreso'
                ? 'bg-peligro/20 border-peligro text-peligro shadow-lg shadow-red-950/40'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            Egreso o Retiro
          </button>
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
            className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
              tipo === 'ingreso'
                ? 'bg-exito/20 border-exito text-exito shadow-lg shadow-green-950/40'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            Ingreso de Dinero
          </button>
        </div>

        <form onSubmit={manejarSubmit}>
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
              Importe de efectivo obligatorio
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-400">$</span>
              <input
                ref={inputMontoRef}
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-900 border-2 border-primario-500 rounded-xl pl-10 pr-4 py-3 text-3xl font-black text-white text-right focus:outline-none focus:ring-2 focus:ring-primario-400"
                autoFocus
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
              Motivo o concepto opcional
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={tipo === 'egreso' ? 'Ejemplo: Pago de flete, compra menor, retiro' : 'Ejemplo: Cambio adicional aportado'}
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primario-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-peligro/10 border border-peligro/30 rounded-xl text-peligro text-xs font-medium text-center">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-700">
            <span className="text-xs text-gray-500">ESC para cancelar</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={alCerrar}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-colors flex items-center gap-2 ${
                  tipo === 'egreso'
                    ? 'bg-peligro hover:bg-red-600'
                    : 'bg-exito hover:bg-green-600'
                } disabled:opacity-50`}
              >
                <kbd className="bg-black/30 px-2 py-0.5 rounded text-white text-xs">Enter</kbd>
                {guardando ? 'Registrando...' : tipo === 'egreso' ? 'Confirmar Egreso' : 'Confirmar Ingreso'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
