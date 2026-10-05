// ============================================================================
// SeccionProductos.jsx — ABM completo de productos con paginación
//
// - Flechas SIEMPRE mueven la selección de la tabla (listener a nivel document)
// - Tab recorre: Buscador > Agregar Producto > Filtros > Paginación
// - Enter abre edición solo si NO estás en un input/botón
// - Modales de confirmación navegables con flechas/Tab
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

const LIMITE_POR_PAGINA = 15;

function diasHastaVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const str = typeof fechaVencimiento === 'string' ? fechaVencimiento.split('T')[0] : fechaVencimiento;
  const partes = str.split('-'); // YYYY-MM-DD
  const venc = new Date(partes[0], partes[1] - 1, partes[2]);
  venc.setHours(0,0,0,0);
  return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
}

function formatearFecha(fecha) {
  if (!fecha) return '—';
  const str = typeof fecha === 'string' ? fecha.split('T')[0] : fecha;
  const partes = str.split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatearPrecio(precio) {
  return parseFloat(precio).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

// ── Modal de Confirmación (navegable con flechas) ───────────────────────
function ModalConfirmacion({ producto, alConfirmar, alCancelar }) {
  const [indiceFoco, setIndiceFoco] = useState(0);
  const btnCancelarRef = useRef(null);
  const btnEliminarRef = useRef(null);

  useEffect(() => { btnCancelarRef.current?.focus(); }, []);
  useEffect(() => {
    if (indiceFoco === 0) btnCancelarRef.current?.focus();
    else btnEliminarRef.current?.focus();
  }, [indiceFoco]);

  const manejarKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); alCancelar(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault(); setIndiceFoco(p => p === 0 ? 1 : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault(); indiceFoco === 0 ? alCancelar() : alConfirmar(producto);
    }
  };

  if (!producto) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onKeyDown={manejarKeyDown}>
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-sm p-6 animacion-modal shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">Eliminar Producto</h2>
        <p className="text-gray-300 mb-6">
          ¿Seguro que desea eliminar el producto <span className="font-bold text-white">"{producto.nombre}"</span>?
        </p>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">ESC para salir</span>
          <div className="flex gap-3">
            <button ref={btnCancelarRef} type="button" onClick={alCancelar}
              className={`px-4 py-2 rounded-lg transition-colors ${indiceFoco === 0 ? 'bg-gray-600 text-white ring-2 ring-primario-500' : 'text-gray-400 hover:text-white'}`}>
              Cancelar
            </button>
            <button ref={btnEliminarRef} type="button" onClick={() => alConfirmar(producto)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${indiceFoco === 1 ? 'bg-peligro text-white ring-2 ring-red-400' : 'bg-peligro/60 text-white hover:bg-peligro'}`}>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Alta / Edición ─────────────────────────────────────────────
function ModalProducto({ productoEditar, alGuardar, alCerrar, alEliminar }) {
  const esEdicion = !!productoEditar;
  const inputNombreRef = useRef(null);
  const [form, setForm] = useState({ nombre:'', codigoBarras:'', precioVenta:'', stockActual:'0', stockMinimo:'5', rubro:'', fechaVencimiento:'' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (productoEditar) {
      setForm({
        nombre: productoEditar.nombre || '', codigoBarras: productoEditar.codigo_barras || '',
        precioVenta: productoEditar.precio_venta?.toString() || '', stockActual: productoEditar.stock_actual?.toString() || '0',
        stockMinimo: productoEditar.stock_minimo?.toString() || '5',
        rubro: productoEditar.rubro || '', fechaVencimiento: productoEditar.fecha_vencimiento || '',
      });
    }
    setTimeout(() => inputNombreRef.current?.focus(), 100);
  }, [productoEditar]);

  const c = (campo) => (e) => { setForm(p => ({ ...p, [campo]: e.target.value })); setError(''); };

  const manejarGuardar = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.codigoBarras.trim()) { setError('El código de barras es obligatorio'); return; }
    const precio = parseFloat(form.precioVenta);
    if (isNaN(precio) || precio <= 0) { setError('El precio debe ser mayor a 0'); return; }
    setGuardando(true);
    try {
      const datos = { nombre: form.nombre.trim(), codigoBarras: form.codigoBarras.trim(), precioVenta: precio,
        stockActual: parseFloat(form.stockActual) || 0, stockMinimo: parseFloat(form.stockMinimo) || 0, tipoVenta: 'unidad',
        rubro: form.rubro.trim() || null, fechaVencimiento: form.fechaVencimiento || null };
      const res = esEdicion ? await window.api.productos.actualizar(productoEditar.id, datos) : await window.api.productos.crear(datos);
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-lg p-6 animacion-modal shadow-xl">
        <h2 className="text-xl font-bold text-white mb-4">{esEdicion ? 'Editar Producto' : 'Nuevo Producto'}</h2>
        <form onSubmit={manejarGuardar} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nombre <span className="text-peligro">*</span></label>
            <input ref={inputNombreRef} type="text" value={form.nombre} onChange={c('nombre')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Ej: Coca Cola 500ml" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Código de barras <span className="text-peligro">*</span></label>
            <input type="text" value={form.codigoBarras} onChange={c('codigoBarras')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Escanear o tipear código" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Precio <span className="text-peligro">*</span></label>
              <input type="number" step="0.01" min="0" value={form.precioVenta} onChange={c('precioVenta')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="0.00" />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Stock actual</label>
              <input type="number" min="0" value={form.stockActual} onChange={c('stockActual')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="0" />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Stock mínimo</label>
              <input type="number" min="0" value={form.stockMinimo} onChange={c('stockMinimo')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="5" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Rubro</label>
              <input type="text" value={form.rubro} onChange={c('rubro')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" placeholder="Ej: Bebidas, Almacén..." />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Vencimiento <span className="text-gray-600">(opcional)</span></label>
              <input type="date" value={form.fechaVencimiento} onChange={c('fechaVencimiento')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" />
            </div>
          </div>
          {error && <div className="bg-peligro/10 border border-peligro/30 rounded-lg px-4 py-2 text-peligro text-sm">{error}</div>}
          <div className="flex justify-between pt-2">
            <div>{esEdicion && <button type="button" onClick={(e) => { e.preventDefault(); alEliminar(productoEditar); }}
              className="px-4 py-2 bg-peligro hover:bg-red-700 text-white font-medium rounded-lg">Eliminar Producto</button>}</div>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button type="submit" disabled={guardando}
                className="px-6 py-2 bg-primario-600 hover:bg-primario-700 text-white font-medium rounded-lg disabled:opacity-50">
                {guardando ? 'Guardando...' : (esEdicion ? 'Guardar cambios' : 'Crear producto')}
              </button>
            </div>
          </div>
          <div className="text-right"><span className="text-xs text-gray-600">ESC para salir</span></div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL: SECCIÓN PRODUCTOS
// ============================================================================
export default function SeccionProductos() {
  const [productos, setProductos] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const [cargando, setCargando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [productoAEliminar, setProductoAEliminar] = useState(null);

  const inputBusquedaRef = useRef(null);
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE_POR_PAGINA));

  const cargarProductos = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.productos.buscar(textoBusqueda, pagina, LIMITE_POR_PAGINA, filtroActivo);
      setProductos(r.filas || []); setTotal(r.total || 0); setIndiceSeleccionado(0);
    } catch (error) {
      console.error('[Productos] Error al cargar:', error);
      setMensaje({ tipo: 'error', texto: 'Error al cargar productos' });
    } finally { setCargando(false); }
  }, [textoBusqueda, pagina, filtroActivo]);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);
  useEffect(() => { inputBusquedaRef.current?.focus(); }, []);
  useEffect(() => { if (mensaje) { const t = setTimeout(() => setMensaje(null), 4000); return () => clearTimeout(t); } }, [mensaje]);

  const manejarBusqueda = (e) => { setTextoBusqueda(e.target.value); setPagina(1); };
  const manejarFiltro = (f) => { setFiltroActivo(f); setPagina(1); inputBusquedaRef.current?.focus(); };

  const abrirModalCrear = () => { setProductoEditando(null); setMostrarModal(true); };
  const abrirModalEditar = useCallback((producto) => { if (!producto) return; setProductoEditando(producto); setMostrarModal(true); }, []);

  const cerrarModal = () => { setMostrarModal(false); setProductoEditando(null); setTimeout(() => inputBusquedaRef.current?.focus(), 100); };
  const alGuardarProducto = () => { cerrarModal(); cargarProductos(); setMensaje({ tipo: 'exito', texto: productoEditando ? 'Producto actualizado correctamente' : 'Producto creado correctamente' }); };

  const pedirConfirmacionEliminar = (producto) => { if (producto) setProductoAEliminar(producto); };
  const procesarEliminacion = async (producto) => {
    try {
      await window.api.productos.eliminar(producto.id);
      setProductoAEliminar(null); if (mostrarModal) cerrarModal();
      cargarProductos(); setMensaje({ tipo: 'exito', texto: `"${producto.nombre}" eliminado` });
    } catch { setMensaje({ tipo: 'error', texto: 'Error al eliminar producto' }); setProductoAEliminar(null); }
  };

  // Navegación a nivel document — flechas SIEMPRE mueven la tabla
  useEffect(() => {
    const manejar = (e) => {
      if (mostrarModal || productoAEliminar || cargando || productos.length === 0) return;
      const enInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const enBoton = document.activeElement?.tagName === 'BUTTON';

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndiceSeleccionado(p => (p < productos.length - 1 ? p + 1 : p));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndiceSeleccionado(p => (p > 0 ? p - 1 : p));
      } else if (e.key === 'Enter' && !enBoton) {
        e.preventDefault();
        abrirModalEditar(productos[indiceSeleccionado]);
      } else if (e.key === 'Delete' && !enInput) {
        e.preventDefault();
        pedirConfirmacionEliminar(productos[indiceSeleccionado]);
      }
    };
    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [mostrarModal, productoAEliminar, cargando, productos, indiceSeleccionado, abrirModalEditar]);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input ref={inputBusquedaRef} type="text" value={textoBusqueda} onChange={manejarBusqueda}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:border-primario-500 focus:outline-none focus:ring-1 focus:ring-primario-500 placeholder:text-gray-500"
              placeholder="Buscar por nombre, código o rubro..." />
          </div>
          <button onClick={abrirModalCrear}
            className="px-5 py-2.5 bg-primario-600 hover:bg-primario-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap focus:ring-2 focus:ring-primario-400 focus:outline-none">
            <span className="text-lg">+</span> Agregar Producto
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => manejarFiltro('todos')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-primario-400 ${filtroActivo === 'todos' ? 'bg-primario-600 border-primario-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
            Todos
          </button>
          <button onClick={() => manejarFiltro('bajo-stock')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-alerta ${filtroActivo === 'bajo-stock' ? 'bg-alerta text-gray-900 border-alerta' : 'bg-gray-800 border-gray-700 text-alerta hover:bg-gray-700'}`}>
            Menor Stock
          </button>
          <button onClick={() => manejarFiltro('por-vencer')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-peligro ${filtroActivo === 'por-vencer' ? 'bg-peligro text-white border-peligro' : 'bg-gray-800 border-gray-700 text-peligro hover:bg-gray-700'}`}>
            Próximos a Vencer
          </button>
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
              <th className="py-3 px-4">Código</th>
              <th className="py-3 px-4">Nombre</th>
              <th className="py-3 px-4 text-right">Precio</th>
              <th className="py-3 px-4 text-right">Stock</th>
              <th className="py-3 px-4">Rubro</th>
              <th className="py-3 px-4">Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan="5" className="text-center py-12 text-gray-500">Cargando productos...</td></tr>
            ) : productos.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-12 text-gray-500"><p className="text-lg">No hay productos que coincidan</p></td></tr>
            ) : productos.map((producto, idx) => {
              const dv = diasHastaVencimiento(producto.fecha_vencimiento);
              const vencido = dv !== null && dv <= 0;
              const porVencer = dv !== null && dv > 0 && dv <= 10;
              const sel = indiceSeleccionado === idx;
              let rc = "border-b border-gray-700/50 hover:bg-gray-700 cursor-pointer transition-colors";
              if (sel) rc += " bg-primario-900 border-primario-600";
              else if (vencido) rc += " bg-peligro/5";
              else if (porVencer) rc += " bg-alerta/5";

              return (
                <tr key={producto.id} className={rc} onClick={() => setIndiceSeleccionado(idx)} onDoubleClick={() => abrirModalEditar(producto)}>
                  <td className="py-2.5 px-4 text-gray-300 font-mono text-sm">{producto.codigo_barras || '—'}</td>
                  <td className="py-2.5 px-4 text-white">{producto.nombre}</td>
                  <td className="py-2.5 px-4 text-right text-white font-medium">{formatearPrecio(producto.precio_venta)}</td>
                  <td className={`py-2.5 px-4 text-right ${parseFloat(producto.stock_actual) <= parseFloat(producto.stock_minimo || 0) ? 'text-alerta' : 'text-gray-300'}`}>
                    {parseFloat(producto.stock_actual).toFixed(0)}
                  </td>
                  <td className="py-2.5 px-4 text-gray-300">
                    {producto.rubro || '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    {producto.fecha_vencimiento ? (
                      <span className={`inline-flex items-center gap-1 ${vencido ? 'text-peligro font-medium' : porVencer ? 'text-alerta' : 'text-gray-400'}`}>
                        {formatearFecha(producto.fecha_vencimiento)}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
        <span>{total === 0 ? 'Sin resultados' : `${total} producto${total !== 1 ? 's' : ''} en total`}</span>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina <= 1}
              className="px-3 py-1 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-30 focus:ring-2 focus:ring-primario-400 focus:outline-none">Anterior</button>
            <span className="px-3">Página {pagina} de {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p+1))} disabled={pagina >= totalPaginas}
              className="px-3 py-1 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-30 focus:ring-2 focus:ring-primario-400 focus:outline-none">Siguiente</button>
          </div>
        )}
      </div>

      {mostrarModal && <ModalProducto productoEditar={productoEditando} alGuardar={alGuardarProducto} alCerrar={cerrarModal} alEliminar={pedirConfirmacionEliminar} />}
      {productoAEliminar && <ModalConfirmacion producto={productoAEliminar} alConfirmar={procesarEliminacion} alCancelar={() => setProductoAEliminar(null)} />}
    </div>
  );
}
