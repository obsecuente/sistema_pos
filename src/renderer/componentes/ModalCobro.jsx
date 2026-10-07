import React, { useState, useEffect, useRef } from 'react';

const METODOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'cuenta_corriente', label: 'Cuenta Corriente' },
];

export default function ModalCobro({ total, onConfirmar, onCerrar }) {
  const [paso, setPaso] = useState('metodo');
  const [indiceMetodo, setIndiceMetodo] = useState(0);
  const [montoPaga, setMontoPaga] = useState('');
  
  const inputMontoRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (paso === 'monto') {
      setTimeout(() => inputMontoRef.current?.focus(), 50);
    } else {
      setTimeout(() => modalRef.current?.focus(), 50);
    }
  }, [paso]);

  const manejarKeyDownMetodo = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceMetodo(prev => Math.min(prev + 1, METODOS.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceMetodo(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      seleccionarMetodo(indiceMetodo);
    }
  };

  const seleccionarMetodo = (idx) => {
    const metodoElegido = METODOS[idx].id;
    if (metodoElegido === 'efectivo') {
      setPaso('monto');
    } else {
      onConfirmar(metodoElegido, total);
    }
  };

  const manejarKeyDownMonto = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setPaso('metodo');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmarEfectivo();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); // Evitar que suba/baje el número con flechas para que no confunda
    }
  };

  const confirmarEfectivo = (e) => {
    if (e) e.preventDefault();
    const pago = parseFloat(montoPaga);
    if (isNaN(pago) || pago < total) return; 
    onConfirmar('efectivo', pago);
  };

  const renderMetodo = () => (
    <div ref={modalRef}
         className="bg-gray-800 rounded-xl border border-primario-500 w-full max-w-md shadow-2xl animacion-modal outline-none" 
         tabIndex={-1} 
         onKeyDown={manejarKeyDownMetodo}>
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 rounded-t-xl">
        <h2 className="text-xl font-bold text-white text-center">Medio de Pago</h2>
      </div>
      
      <div className="p-6">
        <div className="mb-6 text-center">
          <p className="text-gray-400 text-sm mb-1">TOTAL A COBRAR</p>
          <p className="text-5xl font-black text-exito">${total.toFixed(2)}</p>
        </div>

        <div className="space-y-2 mb-6">
          {METODOS.map((metodo, idx) => {
            const seleccionado = idx === indiceMetodo;
            return (
              <div 
                key={metodo.id}
                className={`flex items-center px-4 py-3 rounded-lg border-2 transition-colors cursor-pointer
                  ${seleccionado 
                    ? 'border-primario-500 bg-primario-500/20 text-white shadow-[0_0_15px_rgba(var(--color-primario-500),0.3)]' 
                    : 'border-transparent bg-gray-700/50 text-gray-400'
                  }`}
                onClick={() => {
                  setIndiceMetodo(idx);
                  seleccionarMetodo(idx);
                }}
              >
                <span className={`text-lg font-medium ${seleccionado ? 'font-bold' : ''}`}>{metodo.label}</span>
                {seleccionado && <span className="ml-auto text-sm bg-primario-600 text-white px-2 py-1 rounded">ENTER</span>}
              </div>
            );
          })}
        </div>

        <div className="text-center text-xs text-gray-500">
          Usa las <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white mx-1">↑</kbd><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white mx-1">↓</kbd> para moverte y <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white mx-1">ENTER</kbd> para elegir. <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white mx-1">ESC</kbd> para cancelar.
        </div>
      </div>
    </div>
  );

  const renderMontoEfectivo = () => {
    const pago = parseFloat(montoPaga) || 0;
    const esValido = pago >= total;

    return (
      <div className="bg-gray-800 rounded-xl border border-primario-500 w-full max-w-sm shadow-2xl animacion-modal outline-none" >
        <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 rounded-t-xl">
          <h2 className="text-xl font-bold text-white text-center">Pago en Efectivo</h2>
        </div>
        
        <form onSubmit={confirmarEfectivo} className="p-6 text-center">
          <p className="text-gray-400 text-sm mb-1">TOTAL A COBRAR</p>
          <p className="text-4xl font-black text-gray-200 mb-6">${total.toFixed(2)}</p>

          <label className="block text-gray-400 text-sm mb-2 text-left">¿Con cuánto paga el cliente?</label>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
            <input
              ref={inputMontoRef}
              type="number"
              min={total}
              step="0.01"
              value={montoPaga}
              onChange={(e) => setMontoPaga(e.target.value)}
              onKeyDown={manejarKeyDownMonto}
              className="w-full bg-gray-700 border-2 border-primario-500 rounded-lg pl-10 pr-4 py-4 text-3xl font-bold text-white text-right focus:outline-none focus:ring-4 focus:ring-primario-500/30"
              placeholder="0.00"
            />
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
            <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white">ESC</kbd> volver</span>
            <button 
              type="button"
              onClick={confirmarEfectivo}
              disabled={!esValido}
              className={`px-6 py-3 rounded-lg font-bold text-lg transition-colors ${esValido ? 'bg-primario-600 hover:bg-primario-500 text-white shadow-lg' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
            >
              CONFIRMAR PAGO
            </button>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Presione <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white">ENTER</kbd> para confirmar
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]" onKeyDown={(e) => e.stopPropagation()}>
      {paso === 'metodo' ? renderMetodo() : renderMontoEfectivo()}
    </div>
  );
}
