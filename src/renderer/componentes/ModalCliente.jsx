import React, { useState, useEffect, useRef } from 'react';

export default function ModalCliente({ onCerrar, onConfirmar }) {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [buscando, setBuscando] = useState(false);
  
  const [modoCrear, setModoCrear] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');
  const [errorCrear, setErrorCrear] = useState('');

  const inputBuscarRef = useRef(null);
  const inputNombreRef = useRef(null);

  // Buscar clientes en BD
  useEffect(() => {
    if (modoCrear) return;
    const buscar = async () => {
      setBuscando(true);
      try {
        const res = await window.api.clientes.buscar(busqueda, 1, 15);
        setClientes(res.filas || []);
        setIndiceSeleccionado(0);
      } catch (e) {
        console.error('Error buscando clientes:', e);
      }
      setBuscando(false);
    };
    const timer = setTimeout(buscar, 120);
    return () => clearTimeout(timer);
  }, [busqueda, modoCrear]);

  // Foco inicial
  useEffect(() => {
    const t = setTimeout(() => {
      if (modoCrear) inputNombreRef.current?.focus();
      else inputBuscarRef.current?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [modoCrear]);

  const seleccionarCliente = () => {
    if (clientes.length > 0 && clientes[indiceSeleccionado]) {
      const c = clientes[indiceSeleccionado];
      onConfirmar(c.id, c.nombre);
    }
  };

  const manejarSubmitNuevo = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorCrear('');
    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio) {
      setErrorCrear('El nombre es obligatorio');
      inputNombreRef.current?.focus();
      return;
    }
    try {
      const res = await window.api.clientes.crear({ nombre: nombreLimpio, cuit: nuevoDni.trim() || null });
      if (res && res.exito) {
        onConfirmar(res.id, nombreLimpio);
      } else {
        setErrorCrear(res?.error || 'Error al crear cliente');
      }
    } catch (error) {
      console.error('Error al crear cliente:', error);
      setErrorCrear('Error al crear cliente');
    }
  };

  // Manejo de teclado a nivel DOM (document)
  useEffect(() => {
    const manejarKeyDown = (e) => {
      if (modoCrear) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setModoCrear(false);
          setErrorCrear('');
          setTimeout(() => inputBuscarRef.current?.focus(), 50);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndiceSeleccionado(prev => Math.min(prev + 1, Math.max(0, clientes.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndiceSeleccionado(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        seleccionarCliente();
      } else if (e.key === 'F2' || e.key === 'Insert') {
        e.preventDefault();
        setModoCrear(true);
      }
    };

    document.addEventListener('keydown', manejarKeyDown);
    return () => document.removeEventListener('keydown', manejarKeyDown);
  }, [modoCrear, clientes, indiceSeleccionado, onCerrar]);

  const manejarKeyDownInputCrear = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manejarSubmitNuevo(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setModoCrear(false);
      setErrorCrear('');
      setTimeout(() => inputBuscarRef.current?.focus(), 50);
    }
  };

  if (modoCrear) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110]">
        <div className="bg-gray-800 rounded-xl border border-primario-500 w-full max-w-sm shadow-2xl animacion-modal">
          <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 rounded-t-xl">
            <h2 className="text-xl font-bold text-white text-center">Nuevo Cliente</h2>
          </div>
          <form onSubmit={manejarSubmitNuevo} className="p-6">
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-1">Nombre y apellido</label>
              <input 
                ref={inputNombreRef} 
                type="text" 
                required
                value={nuevoNombre} 
                onChange={e => { setNuevoNombre(e.target.value); setErrorCrear(''); }}
                onKeyDown={manejarKeyDownInputCrear}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-primario-500"
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-1">DNI</label>
              <input 
                type="text" 
                value={nuevoDni} 
                onChange={e => setNuevoDni(e.target.value)}
                onKeyDown={manejarKeyDownInputCrear}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-primario-500"
                placeholder="Opcional"
              />
            </div>

            {errorCrear && (
              <div className="mb-4 text-peligro text-sm font-medium">
                {errorCrear}
              </div>
            )}

            <div className="flex justify-between items-center mt-6">
              <span className="text-xs text-gray-500"><kbd className="bg-gray-700 px-1 rounded text-white">ESC</kbd> para salir</span>
              <button type="submit" className="bg-primario-600 hover:bg-primario-500 px-6 py-2 rounded-lg text-white font-medium transition-colors">
                Crear Cliente
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110]">
      <div className="bg-gray-800 rounded-xl border border-primario-500 w-full max-w-lg shadow-2xl animacion-modal flex flex-col h-[70vh]">
        <div className="p-4 border-b border-gray-700 bg-gray-900 rounded-t-xl">
          <input 
            ref={inputBuscarRef}
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-gray-800 border-2 border-primario-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-primario-400"
            placeholder="Buscar cliente por nombre o DNI..."
          />
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {buscando ? (
            <p className="text-gray-500 text-center py-8">Cargando clientes...</p>
          ) : clientes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-lg mb-2">No se encontraron clientes.</p>
              <p className="text-sm text-gray-500">Presione <kbd className="bg-gray-700 px-1 rounded text-white">F2</kbd> para crear uno nuevo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {clientes.map((c, i) => (
                <div 
                  key={c.id} 
                  className={`p-4 rounded-lg cursor-pointer border ${i === indiceSeleccionado ? 'bg-primario-700 border-primario-500' : 'bg-gray-800 border-transparent hover:bg-gray-700'}`}
                  onClick={() => onConfirmar(c.id, c.nombre)}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-lg">{c.nombre}</span>
                    <span className={`font-bold ${c.saldo > 0.005 ? 'text-peligro' : c.saldo < -0.005 ? 'text-exito' : 'text-gray-400'}`}>
                      {c.saldo > 0.005 ? 'Debe: ' : c.saldo < -0.005 ? 'A favor: ' : 'Al día: '}$ {parseFloat(c.saldo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    {c.cuit && <span className="mr-4">DNI: {c.cuit}</span>}
                    {c.telefono && <span>Teléfono: {c.telefono}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border-t border-gray-700 p-4 rounded-b-xl flex justify-between items-center text-sm">
          <div className="text-gray-400 flex gap-4">
            <span><kbd className="bg-gray-700 px-1 text-white rounded mr-1">Flechas</kbd> Mover</span>
            <span><kbd className="bg-gray-700 px-1 text-white rounded mr-1">Enter</kbd> Seleccionar</span>
            <span><kbd className="bg-gray-700 px-1 text-white rounded mr-1">F2</kbd> Nuevo Cliente</span>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-white">
            <kbd className="bg-gray-700 px-1 text-white rounded mr-2">ESC</kbd> para salir
          </button>
        </div>
      </div>
    </div>
  );
}
