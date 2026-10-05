import React, { useState, useEffect, useRef, useCallback } from 'react';
import DetalleCuentaCliente from './DetalleCuentaCliente';

const LIMITE_POR_PAGINA = 15;

const FILTROS = [
  { id: 'nombre',      etiqueta: 'Todos',                clases: 'bg-primario-600 border-primario-500 text-white',  inactivo: 'text-gray-400' },
  { id: 'mayor-deuda', etiqueta: 'Mayor deuda',          clases: 'bg-alerta text-gray-900 border-alerta',           inactivo: 'text-alerta' },
  { id: 'antiguedad',  etiqueta: 'Deuda más antigua',    clases: 'bg-peligro text-white border-peligro',            inactivo: 'text-peligro' },
];

// Las fechas de SQLite (CURRENT_TIMESTAMP) vienen en UTC sin zona
function parsearFecha(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}
function diasDesde(s) {
  const d = parsearFecha(s);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function formatearFecha(s) {
  const d = parsearFecha(s);
  return d ? d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
}
function formatearPrecio(v) {
  return '$ ' + parseFloat(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// COMPONENTE PRINCIPAL: SECCIÓN CUENTAS CORRIENTES
// ============================================================================
export default function SeccionCuentas() {
  const [clientes, setClientes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('nombre');
  const [cargando, setCargando] = useState(false);

  const [mostrarModalAlta, setMostrarModalAlta] = useState(false);
  const [clienteAEliminar, setClienteAEliminar] = useState(null);
  const [clienteDetalle, setClienteDetalle] = useState(null);

  const [mensaje, setMensaje] = useState(null);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);

  const inputBusquedaRef = useRef(null);
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE_POR_PAGINA));

  const cargarClientes = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.clientes.buscar(textoBusqueda, pagina, LIMITE_POR_PAGINA, filtroActivo);
      setClientes(r.filas || []);
      setTotal(r.total || 0);
      setIndiceSeleccionado(0);
    } catch (error) {
      console.error('[Cuentas] Error al cargar:', error);
      setMensaje({ tipo: 'error', texto: 'Error al cargar clientes' });
    } finally {
      setCargando(false);
    }
  }, [textoBusqueda, pagina, filtroActivo]);

  useEffect(() => {
    const timer = setTimeout(cargarClientes, 250);
    return () => clearTimeout(timer);
  }, [cargarClientes]);

  useEffect(() => { inputBusquedaRef.current?.focus(); }, []);

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 4000);
      return () => clearTimeout(t);
    }
  }, [mensaje]);

  const manejarBusqueda = (e) => { setTextoBusqueda(e.target.value); setPagina(1); };
  const manejarFiltro = (id) => { setFiltroActivo(id); setPagina(1); inputBusquedaRef.current?.focus(); };

  const abrirModalCrear = () => setMostrarModalAlta(true);
  const cerrarModalAlta = () => {
    setMostrarModalAlta(false);
    setTimeout(() => inputBusquedaRef.current?.focus(), 100);
  };
  const alCrearCliente = () => {
    cerrarModalAlta();
    cargarClientes();
    setMensaje({ tipo: 'exito', texto: 'Cliente creado correctamente' });
  };

  const pedirConfirmacionEliminar = useCallback((cliente) => { if (cliente) setClienteAEliminar(cliente); }, []);

  const procesarEliminacion = async (cliente) => {
    try {
      const res = await window.api.clientes.eliminar(cliente.id);
      setClienteAEliminar(null);
      if (!res.exito) {
        setMensaje({ tipo: 'error', texto: res.error || 'No se puede eliminar el cliente' });
        return;
      }
      setClienteDetalle(null);
      cargarClientes();
      setMensaje({ tipo: 'exito', texto: `"${cliente.nombre}" eliminado` });
      setTimeout(() => inputBusquedaRef.current?.focus(), 100);
    } catch (e) {
      console.error(e);
      setClienteAEliminar(null);
      setMensaje({ tipo: 'error', texto: 'Error al eliminar cliente' });
    }
  };

  // Navegación a nivel document
  useEffect(() => {
    const manejar = (e) => {
      if (mostrarModalAlta || clienteDetalle || clienteAEliminar) return;
      const enInput = document.activeElement?.tagName === 'INPUT';
      const enBoton = document.activeElement?.tagName === 'BUTTON';

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (!enInput || textoBusqueda === '')) {
        e.preventDefault();
        const idx = FILTROS.findIndex(f => f.id === filtroActivo);
        const sig = e.key === 'ArrowRight' ? Math.min(idx + 1, FILTROS.length - 1) : Math.max(idx - 1, 0);
        if (sig !== idx) manejarFiltro(FILTROS[sig].id);
        return;
      }
      if (cargando || clientes.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndiceSeleccionado(p => (p < clientes.length - 1 ? p + 1 : p));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndiceSeleccionado(p => (p > 0 ? p - 1 : p));
      } else if (e.key === 'Enter' && !enBoton) {
        e.preventDefault();
        setClienteDetalle(clientes[indiceSeleccionado]);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        setPagina(p => Math.min(totalPaginas, p + 1));
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        setPagina(p => Math.max(1, p - 1));
      }
    };
    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [mostrarModalAlta, clienteDetalle, clienteAEliminar, cargando, clientes, indiceSeleccionado, filtroActivo, textoBusqueda, totalPaginas]);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input ref={inputBusquedaRef} type="text" value={textoBusqueda} onChange={manejarBusqueda}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:border-primario-500 focus:outline-none focus:ring-1 focus:ring-primario-500 placeholder:text-gray-500"
              placeholder="Buscar por nombre o DNI..." />
          </div>
          <button onClick={abrirModalCrear}
            className="px-5 py-2.5 bg-primario-600 hover:bg-primario-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap focus:ring-2 focus:ring-primario-400 focus:outline-none">
            <span className="text-lg">+</span> Agregar Cliente
          </button>
        </div>
        <div className="flex gap-2">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => manejarFiltro(f.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-primario-400 ${filtroActivo === f.id ? f.clases : `bg-gray-800 border-gray-700 hover:bg-gray-700 ${f.inactivo}`}`}>
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {mensaje && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-exito/10 border border-exito/30 text-exito' : 'bg-peligro/10 border border-peligro/30 text-peligro'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
              <th className="py-3 px-4">Nombre</th>
              <th className="py-3 px-4">Teléfono</th>
              <th className="py-3 px-4">DNI</th>
              <th className="py-3 px-4">Deuda desde</th>
              <th className="py-3 px-4 text-right">Saldo Adeudado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan="5" className="text-center py-12 text-gray-500">Cargando clientes...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-12 text-gray-500"><p className="text-lg">No hay clientes que coincidan</p></td></tr>
            ) : clientes.map((cliente, idx) => {
              const sel = indiceSeleccionado === idx;
              const saldo = parseFloat(cliente.saldo || 0);
              const dias = saldo > 0.005 ? diasDesde(cliente.deuda_desde) : null;
              let rc = 'border-b border-gray-700/50 hover:bg-gray-700 cursor-pointer transition-colors';
              if (sel) rc += ' bg-primario-900 border-primario-600';
              const colorMora = dias === null ? 'text-gray-600' : dias >= 30 ? 'text-peligro font-medium' : dias >= 15 ? 'text-alerta' : 'text-gray-400';

              return (
                <tr key={cliente.id} className={rc} onClick={() => setIndiceSeleccionado(idx)} onDoubleClick={() => setClienteDetalle(cliente)}>
                  <td className="py-2.5 px-4 text-white">{cliente.nombre}</td>
                  <td className="py-2.5 px-4 text-gray-300">{cliente.telefono || '—'}</td>
                  <td className="py-2.5 px-4 text-gray-300">{cliente.cuit || '—'}</td>
                  <td className={`py-2.5 px-4 ${colorMora}`}>{dias === null ? '—' : formatearFecha(cliente.deuda_desde)}</td>
                  <td className={`py-2.5 px-4 text-right font-medium ${saldo > 0.005 ? 'text-peligro' : saldo < -0.005 ? 'text-exito' : 'text-white'}`}>
                    {formatearPrecio(saldo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
        <span>{total === 0 ? 'Sin resultados' : `${total} cliente${total !== 1 ? 's' : ''} en total`}</span>

        <div className="text-xs text-gray-400 flex gap-4 ml-4">
          <span><kbd className="bg-gray-800 px-1 text-white border border-gray-600 rounded mr-1">Flechas</kbd> Navegar y cambiar filtro</span>
          <span><kbd className="bg-gray-800 px-1 text-white border border-gray-600 rounded mr-1">Enter</kbd> Ver ficha del cliente</span>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}
              className="px-3 py-1 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-30 focus:ring-2 focus:ring-primario-400 focus:outline-none">Anterior</button>
            <span className="px-3">Página {pagina} de {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
              className="px-3 py-1 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-30 focus:ring-2 focus:ring-primario-400 focus:outline-none">Siguiente</button>
          </div>
        )}
      </div>

      {mostrarModalAlta && <ModalClienteForm alGuardar={alCrearCliente} alCerrar={cerrarModalAlta} />}

      {clienteAEliminar && (
        <ModalConfirmacionEliminar cliente={clienteAEliminar}
          alConfirmar={procesarEliminacion} alCancelar={() => setClienteAEliminar(null)} />
      )}

      {clienteDetalle && (
        <DetalleCuentaCliente
          cliente={clienteDetalle}
          alCerrar={() => { setClienteDetalle(null); cargarClientes(); setTimeout(() => inputBusquedaRef.current?.focus(), 50); }}
          alEliminar={pedirConfirmacionEliminar}
          alActualizar={(c) => setClienteDetalle(c)}
        />
      )}
    </div>
  );
}

// ── Modal de Alta ─────────────────────────────────────────────
function ModalClienteForm({ alGuardar, alCerrar }) {
  const inputNombreRef = useRef(null);
  const [form, setForm] = useState({ nombre: '', cuit: '', telefono: '', notas: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setTimeout(() => inputNombreRef.current?.focus(), 100); }, []);

  const c = (campo) => (e) => { setForm(p => ({ ...p, [campo]: e.target.value })); setError(''); };

  const manejarGuardar = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true);
    try {
      const res = await window.api.clientes.crear(form);
      if (res.exito === false) { setError(res.error || 'Error al guardar'); return; }
      alGuardar();
    } catch (err) { setError(err.message || 'Error inesperado'); } finally { setGuardando(false); }
  };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') alCerrar(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [alCerrar]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-lg p-6 animacion-modal shadow-xl">
        <h2 className="text-xl font-bold text-white mb-4">Nuevo Cliente</h2>
        <form onSubmit={manejarGuardar} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre y apellido <span className="text-peligro">*</span></label>
            <input ref={inputNombreRef} type="text" value={form.nombre} onChange={c('nombre')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Ej: Juan Pérez" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">DNI</label>
              <input type="text" value={form.cuit} onChange={c('cuit')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Opcional" />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
              <input type="text" value={form.telefono} onChange={c('telefono')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Opcional" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notas</label>
            <textarea value={form.notas} onChange={c('notas')} rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Dirección, detalles, etc." />
          </div>

          {error && <div className="text-peligro text-sm font-medium">{error}</div>}

          <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-6">
            <div className="text-xs text-gray-500"><kbd className="bg-gray-700 px-1 text-white">ESC</kbd> para salir</div>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-6 py-2 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-6 py-2 rounded-lg font-medium bg-primario-600 hover:bg-primario-500 text-white transition-colors">
                {guardando ? 'Guardando...' : 'Crear Cliente'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirmación de eliminación (foco en la opción segura) ─────────────
function ModalConfirmacionEliminar({ cliente, alConfirmar, alCancelar }) {
  const [opcion, setOpcion] = useState('cancelar');

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); alCancelar(); }
      else if (['ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
        e.preventDefault();
        setOpcion(o => (o === 'cancelar' ? 'eliminar' : 'cancelar'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (opcion === 'eliminar') alConfirmar(cliente); else alCancelar();
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [alCancelar, alConfirmar, cliente, opcion]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
      <div className="bg-gray-800 rounded-xl border border-peligro/50 w-full max-w-sm p-6 animacion-modal shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 text-center">Eliminar cliente</h2>
        <p className="text-gray-300 text-center mb-6">
          Se dará de baja a <span className="font-bold text-white">{cliente.nombre}</span>. Si tiene deuda pendiente, el sistema no lo permitirá.
        </p>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500"><kbd className="bg-gray-700 px-1 text-white">ESC</kbd> para salir</span>
          <div className="flex gap-3">
            <button onClick={alCancelar}
              className={`px-4 py-2 rounded font-medium text-white ${opcion === 'cancelar' ? 'bg-primario-600 ring-2 ring-primario-400' : 'bg-gray-700'}`}>Cancelar</button>
            <button onClick={() => alConfirmar(cliente)}
              className={`px-4 py-2 rounded font-bold text-white ${opcion === 'eliminar' ? 'bg-peligro ring-2 ring-red-300' : 'bg-gray-700'}`}>Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
