import React, { useState, useEffect, useCallback, useRef } from 'react';

function parsearFecha(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}
function formatearFechaHora(s) {
  const d = parsearFecha(s);
  return d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
}
function formatearPrecio(v) {
  return '$ ' + parseFloat(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function leerDetalle(mov) {
  try { return mov.detalle_items ? JSON.parse(mov.detalle_items) : []; } catch { return []; }
}

const CLASE_CAMPO = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none focus:ring-1 focus:ring-primario-500 placeholder:text-gray-600';

export default function DetalleCuentaCliente({ cliente, alCerrar, alEliminar, alActualizar }) {
  const [historial, setHistorial] = useState([]);
  const [saldo, setSaldo] = useState(parseFloat(cliente.saldo || 0));
  const [cargando, setCargando] = useState(true);
  const [modalPago, setModalPago] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // 'guardar' | 'descartar' | 'salir' | 'eliminar'
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editandoPerfil, setEditandoPerfil] = useState(false);

  // Recorrido e impresion de movimientos
  const [indiceMovimiento, setIndiceMovimiento] = useState(0);
  const [movimientoAImprimir, setMovimientoAImprimir] = useState(null);
  const movimientoRefs = useRef([]);

  const original = {
    nombre: cliente.nombre || '',
    cuit: cliente.cuit || '',
    telefono: cliente.telefono || '',
    notas: cliente.notas || '',
  };
  const [borrador, setBorrador] = useState(original);
  const hayCambios = Object.keys(original).some(k => original[k] !== borrador[k]);

  const contenedorRef = useRef(null);
  const refNombre = useRef(null);

  const cargarDatos = useCallback(async () => {
    try {
      const res = await window.api.libro.obtenerHistorial(cliente.id, 1, 50);
      setHistorial(res.filas || []);
      const resSaldo = await window.api.libro.obtenerSaldo(cliente.id);
      setSaldo(parseFloat(resSaldo.saldo || 0));
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, [cliente.id]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useEffect(() => { contenedorRef.current?.focus(); }, []);
  useEffect(() => {
    if (mensaje) { const t = setTimeout(() => setMensaje(null), 4000); return () => clearTimeout(t); }
  }, [mensaje]);

  // Mantener indice seleccionado dentro del rango
  useEffect(() => {
    if (historial.length > 0) {
      setIndiceMovimiento(prev => (prev >= 0 && prev < historial.length ? prev : 0));
    } else {
      setIndiceMovimiento(-1);
    }
  }, [historial]);

  // Auto-scroll al movimiento seleccionado
  useEffect(() => {
    if (indiceMovimiento >= 0 && movimientoRefs.current[indiceMovimiento]) {
      movimientoRefs.current[indiceMovimiento].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [indiceMovimiento]);

  const cambiar = (campo) => (e) => setBorrador(p => ({ ...p, [campo]: e.target.value }));

  const devolverFoco = () => setTimeout(() => contenedorRef.current?.focus(), 50);

  const guardarAjustes = async () => {
    if (!borrador.nombre.trim()) {
      setConfirmacion(null);
      setMensaje({ tipo: 'error', texto: 'El nombre y apellido es obligatorio' });
      refNombre.current?.focus();
      return;
    }
    setGuardando(true);
    try {
      const res = await window.api.clientes.actualizar(cliente.id, {
        nombre: borrador.nombre.trim(),
        cuit: borrador.cuit.trim(),
        telefono: borrador.telefono.trim(),
        notas: borrador.notas,
      });
      setConfirmacion(null);
      if (res && res.exito === false) {
        setMensaje({ tipo: 'error', texto: res.error || 'No se pudieron guardar los ajustes' });
        return;
      }
      alActualizar({ ...cliente, ...borrador, nombre: borrador.nombre.trim(), cuit: borrador.cuit.trim(), telefono: borrador.telefono.trim(), saldo });
      setMensaje({ tipo: 'exito', texto: 'Ajustes guardados correctamente' });
      setEditandoPerfil(false);
      devolverFoco();
    } catch (e) {
      console.error(e);
      setConfirmacion(null);
      setMensaje({ tipo: 'error', texto: 'Error al guardar los ajustes' });
    } finally {
      setGuardando(false);
    }
  };

  const descartarCambios = () => {
    setBorrador(original);
    setConfirmacion(null);
    setEditandoPerfil(false);
    devolverFoco();
  };

  const ejecutarEliminacion = async () => {
    setConfirmacion(null);
    try {
      const res = await window.api.clientes.eliminar(cliente.id);
      if (!res || !res.exito) {
        setMensaje({
          tipo: 'error',
          texto: res?.error || 'No se puede eliminar el cliente porque tiene una deuda activa. Debe saldarla primero.'
        });
        devolverFoco();
        return;
      }
      alEliminar(cliente);
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      setMensaje({ tipo: 'error', texto: 'Error de comunicación al intentar eliminar el cliente' });
      devolverFoco();
    }
  };

  const confirmarImpresion = async () => {
    if (!movimientoAImprimir) return;
    const mov = movimientoAImprimir;
    setMovimientoAImprimir(null);

    const items = leerDetalle(mov);
    const listaItems = items.length > 0 ? items.map(it => ({
      nombre: it.nombre || 'Artículo',
      cantidad: Number(it.cantidad) || 1,
      precio: Number(it.precioUnitario || (it.subtotal / (it.cantidad || 1))),
      subtotal: Number(it.subtotal || 0),
    })) : [{
      nombre: mov.concepto || (mov.tipo === 'cargo' ? 'Compra fiada' : 'Pago recibido'),
      cantidad: 1,
      precio: parseFloat(mov.monto || 0),
      subtotal: parseFloat(mov.monto || 0),
    }];

    const datosTicket = {
      nombreNegocio: 'EL RINCON DEL GATO',
      direccion: `Cliente: ${cliente.nombre}`,
      fecha: formatearFechaHora(mov.creado_en),
      numeroVenta: mov.id,
      cajero: mov.tipo === 'cargo' ? 'Cargo Cta Cte' : 'Pago Cta Cte',
      items: listaItems,
      subtotal: parseFloat(mov.monto || 0),
      recargo: 0,
      total: parseFloat(mov.monto || 0),
      medioPago: 'Cuenta Corriente',
    };

    try {
      const res = await window.api.hardware.imprimirTicket(datosTicket);
      if (res && res.exito === false) {
        setMensaje({ tipo: 'error', texto: res.error || 'No se pudo imprimir el comprobante' });
      } else {
        setMensaje({ tipo: 'exito', texto: 'Comprobante enviado a la impresora' });
      }
    } catch (err) {
      console.error('Error al imprimir comprobante:', err);
      setMensaje({ tipo: 'error', texto: 'Error de comunicación con la impresora' });
    } finally {
      devolverFoco();
    }
  };

  // Teclado de la ficha
  useEffect(() => {
    const manejar = (e) => {
      if (document.querySelector('.z-\\[110\\]')) return; // hay un modal encima
      const el = document.activeElement;
      const enCampo = ['INPUT', 'TEXTAREA'].includes(el?.tagName);

      if (e.key === 'Escape') {
        e.preventDefault();
        if (hayCambios) { setConfirmacion(enCampo ? 'descartar' : 'salir'); return; }
        if (enCampo) {
          el.blur();
          setEditandoPerfil(false);
          contenedorRef.current?.focus();
          return;
        }
        alCerrar();
        return;
      }

      if (enCampo) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const campos = Array.from(document.querySelectorAll('[data-campo]'));
          const i = campos.indexOf(el);
          if (i >= 0 && i < campos.length - 1) campos[i + 1].focus();
          else if (hayCambios) setConfirmacion('guardar');
          else {
            el.blur();
            setEditandoPerfil(false);
            contenedorRef.current?.focus();
          }
        }
        return;
      }

      if (e.key === 'F3') {
        e.preventDefault();
        setModalPago(true);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historial.length > 0) {
          setIndiceMovimiento(idx => Math.min(idx + 1, historial.length - 1));
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historial.length > 0) {
          setIndiceMovimiento(idx => Math.max(idx - 1, 0));
        }
        return;
      }

      if (e.key === 'Enter' && el?.tagName !== 'BUTTON') {
        e.preventDefault();
        if (historial.length > 0 && indiceMovimiento >= 0 && indiceMovimiento < historial.length) {
          setMovimientoAImprimir(historial[indiceMovimiento]);
        }
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        setConfirmacion('eliminar');
      }
    };
    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [hayCambios, alCerrar, cliente, historial, indiceMovimiento]);

  return (
    <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col overflow-hidden">

      {/* PERFIL EDITABLE */}
      <div className="bg-gray-800 p-6 flex justify-between items-start gap-6 border-b border-gray-700 shrink-0">
        <div className="flex gap-5 items-start flex-1 min-w-0">
          <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center text-3xl font-bold text-white border-4 border-gray-900 shrink-0">
            {(borrador.nombre || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Nombre y apellido</label>
              <input
                ref={refNombre}
                data-campo
                type="text"
                value={borrador.nombre}
                onChange={cambiar('nombre')}
                onFocus={() => setEditandoPerfil(true)}
                className={`${CLASE_CAMPO} text-xl font-bold`}
                placeholder="Nombre y apellido"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">DNI</label>
              <input
                data-campo
                type="text"
                value={borrador.cuit}
                onChange={cambiar('cuit')}
                onFocus={() => setEditandoPerfil(true)}
                className={CLASE_CAMPO}
                placeholder="Sin DNI"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Teléfono</label>
              <input
                data-campo
                type="text"
                value={borrador.telefono}
                onChange={cambiar('telefono')}
                onFocus={() => setEditandoPerfil(true)}
                className={CLASE_CAMPO}
                placeholder="Sin teléfono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Notas del cliente</label>
              <textarea
                data-campo
                value={borrador.notas}
                onChange={cambiar('notas')}
                onFocus={() => setEditandoPerfil(true)}
                rows={2}
                className={`${CLASE_CAMPO} resize-none`}
                placeholder="Dirección, aclaraciones, etc."
              />
            </div>
          </div>
        </div>

        <div className="text-right bg-gray-900/60 p-4 rounded-xl border border-gray-700 shrink-0">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Saldo Adeudado</p>
          <p className={`text-4xl font-black ${saldo > 0.005 ? 'text-peligro' : saldo < -0.005 ? 'text-exito' : 'text-white'}`}>
            {formatearPrecio(saldo)}
          </p>
        </div>
      </div>

      {/* BOTONERA */}
      <div className="bg-gray-800/80 p-3 flex items-center gap-3 border-b border-gray-700 text-sm shrink-0">
        <button onClick={() => setModalPago(true)} className="bg-primario-600 hover:bg-primario-500 text-white px-5 py-2.5 rounded-lg font-bold transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-primario-400">
          <kbd className="bg-primario-800 px-2 py-1 rounded text-white mr-2">F3</kbd>
          Registrar Pago
        </button>

        {(editandoPerfil || hayCambios) && (
          <>
            <button
              disabled={!hayCambios}
              onClick={() => setConfirmacion('guardar')}
              className="bg-exito/90 hover:bg-exito text-gray-900 px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-300"
            >
              Guardar ajustes
            </button>
            <button
              onClick={descartarCambios}
              className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primario-400"
            >
              Descartar cambios
            </button>
            {hayCambios && <span className="text-alerta text-xs">Hay cambios sin guardar</span>}
          </>
        )}

        <button
          onClick={() => setConfirmacion('eliminar')}
          className="bg-gray-700 hover:bg-peligro/80 text-gray-300 hover:text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center border border-gray-600 hover:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro"
        >
          <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-300 mr-2">SUPR</kbd>
          Eliminar
        </button>

        <div className="flex-1 text-right flex items-center justify-end gap-4 text-xs text-gray-400">
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">Flechas</kbd> Recorrer movimientos</span>
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">ENTER</kbd> Imprimir comprobante</span>
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">ESC</kbd> Volver al listado</span>
        </div>
      </div>

      {mensaje && (
        <div className={`mx-6 mt-3 px-4 py-2 rounded-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-exito/10 border border-exito/30 text-exito' : 'bg-peligro/10 border border-peligro/30 text-peligro'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* HISTORIAL */}
      <div ref={contenedorRef} tabIndex={0} className="flex-1 bg-gray-900 p-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus:outline-none">
        <h3 className="text-lg font-bold text-gray-200 mb-4">Historial de Movimientos</h3>

        {cargando ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-primario-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : historial.length === 0 ? (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-10 text-center">
            <p className="text-gray-400 text-lg mb-2">No hay movimientos registrados.</p>
            <p className="text-gray-500 text-sm">Las compras fiadas y los pagos aparecerán aquí cronológicamente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historial.map((mov, i) => {
              const esCargo = mov.tipo === 'cargo';
              const items = leerDetalle(mov);
              const estaSeleccionado = indiceMovimiento === i;
              return (
                <div
                  key={mov.id}
                  ref={el => (movimientoRefs.current[i] = el)}
                  onClick={() => setIndiceMovimiento(i)}
                  onDoubleClick={() => setMovimientoAImprimir(mov)}
                  className={`rounded-xl p-4 flex justify-between items-start cursor-pointer transition-all border ${
                    estaSeleccionado
                      ? 'bg-gray-700/80 border-primario-500 ring-2 ring-primario-500/50 shadow-lg'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-bold">{esCargo ? 'Compra fiada' : mov.tipo === 'pago' ? 'Pago recibido' : 'Ajuste'}</p>
                      {estaSeleccionado && (
                        <span className="text-[11px] bg-primario-900/60 text-primario-300 border border-primario-700 px-2 py-0.5 rounded font-medium">
                          Enter para imprimir
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm">{formatearFechaHora(mov.creado_en)}</p>
                    {mov.concepto && !esCargo && <p className="text-gray-400 text-sm mt-1">{mov.concepto}</p>}
                    {items.length > 0 && (
                      <ul className="mt-2 text-sm text-gray-400">
                        {items.map((it, idx) => (
                          <li key={idx}>{it.cantidad} x {it.nombre} — {formatearPrecio(it.subtotal)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className={`text-2xl font-black ${esCargo ? 'text-peligro' : 'text-exito'}`}>
                    {esCargo ? '+ ' : '- '}{formatearPrecio(mov.monto)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalPago && (
        <ModalRegistrarPago cliente={cliente}
          alGuardar={() => { setModalPago(false); cargarDatos(); setMensaje({ tipo: 'exito', texto: 'Pago registrado correctamente' }); devolverFoco(); }}
          alCerrar={() => { setModalPago(false); devolverFoco(); }} />
      )}

      {movimientoAImprimir && (
        <ModalConfirmar
          titulo="Imprimir ticket de cuenta corriente"
          texto="¿Está seguro de imprimir el ticket de cuenta corriente para este movimiento?"
          etiquetaAceptar="Imprimir"
          etiquetaCancelar="Cancelar"
          opcionInicial="cancelar"
          alAceptar={confirmarImpresion}
          alCancelar={() => { setMovimientoAImprimir(null); devolverFoco(); }}
        />
      )}

      {confirmacion === 'eliminar' && (
        <ModalConfirmar
          titulo="Eliminar cliente"
          texto={`¿Está seguro de eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`}
          etiquetaAceptar="Eliminar"
          etiquetaCancelar="Cancelar"
          opcionInicial="cancelar"
          alAceptar={ejecutarEliminacion}
          alCancelar={() => { setConfirmacion(null); devolverFoco(); }}
        />
      )}

      {confirmacion === 'guardar' && (
        <ModalConfirmar titulo="Guardar ajustes" texto="Se actualizarán los datos del cliente."
          etiquetaAceptar={guardando ? 'Guardando...' : 'Guardar ajustes'} etiquetaCancelar="Seguir editando" opcionInicial="aceptar"
          alAceptar={guardarAjustes} alCancelar={() => setConfirmacion(null)} />
      )}
      {confirmacion === 'descartar' && (
        <ModalConfirmar titulo="Descartar cambios" texto="Se perderán los cambios que no guardaste."
          etiquetaAceptar="Descartar" etiquetaCancelar="Seguir editando" opcionInicial="cancelar"
          alAceptar={descartarCambios} alCancelar={() => setConfirmacion(null)} />
      )}
      {confirmacion === 'salir' && (
        <ModalConfirmar titulo="Salir sin guardar" texto="Hay cambios sin guardar en el perfil."
          etiquetaAceptar="Salir sin guardar" etiquetaCancelar="Seguir editando" opcionInicial="cancelar"
          alAceptar={() => { setConfirmacion(null); alCerrar(); }} alCancelar={() => setConfirmacion(null)} />
      )}
    </div>
  );
}

// ── Confirmación genérica con foco en la opción indicada ─────────────
function ModalConfirmar({ titulo, texto, etiquetaAceptar, etiquetaCancelar, opcionInicial, alAceptar, alCancelar }) {
  const [opcion, setOpcion] = useState(opcionInicial);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); alCancelar(); }
      else if (['ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
        e.preventDefault();
        setOpcion(o => (o === 'cancelar' ? 'aceptar' : 'cancelar'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (opcion === 'aceptar') alAceptar(); else alCancelar();
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [opcion, alAceptar, alCancelar]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-sm p-6 animacion-modal shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 text-center">{titulo}</h2>
        <p className="text-gray-300 text-center mb-6">{texto}</p>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500"><kbd className="bg-gray-700 px-1 text-white">ESC</kbd> para salir</span>
          <div className="flex gap-3">
            <button onClick={alCancelar}
              className={`px-4 py-2 rounded font-medium text-white ${opcion === 'cancelar' ? 'bg-primario-600 ring-2 ring-primario-400' : 'bg-gray-700'}`}>{etiquetaCancelar}</button>
            <button onClick={alAceptar}
              className={`px-4 py-2 rounded font-bold text-white ${opcion === 'aceptar' ? 'bg-primario-600 ring-2 ring-primario-400' : 'bg-gray-700'}`}>{etiquetaAceptar}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Registrar Pago ─────────────────────────────────────────────
function ModalRegistrarPago({ cliente, alGuardar, alCerrar }) {
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('Pago en efectivo');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.preventDefault(); alCerrar(); } };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [alCerrar]);

  const manejarSubmit = async (e) => {
    e.preventDefault();
    const valor = parseFloat(String(monto).replace(',', '.'));
    if (isNaN(valor) || valor <= 0) { setError('Ingresá un monto mayor a cero'); return; }
    setGuardando(true);
    try {
      const res = await window.api.libro.agregarMovimiento({
        cuentaId: cliente.id,
        usuarioId: 1,
        tipo: 'pago',
        monto: valor,
        concepto: concepto || 'Pago',
      });
      if (res && res.exito === false) { setError(res.error || 'No se pudo registrar el pago'); return; }
      alGuardar();
    } catch (err) {
      console.error('Error al guardar pago', err);
      setError('Error al registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 shadow-2xl w-full max-w-sm animacion-modal">
        <h2 className="text-xl font-bold text-white mb-4">Registrar Pago</h2>
        <form onSubmit={manejarSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Monto a abonar</label>
            <input ref={inputRef} type="text" inputMode="decimal" value={monto} onChange={e => { setMonto(e.target.value); setError(''); }}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-2xl text-white font-bold focus:border-primario-500 focus:outline-none" placeholder="0,00" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Concepto</label>
            <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-primario-500 focus:outline-none" />
          </div>
          {error && <div className="text-peligro text-sm font-medium">{error}</div>}
          <div className="flex justify-between items-center pt-4 border-t border-gray-700">
            <span className="text-xs text-gray-500"><kbd className="bg-gray-700 px-1 text-white">ESC</kbd> para salir</span>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-4 py-2 text-white bg-gray-700 rounded-lg font-medium hover:bg-gray-600">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-5 py-2 text-white bg-primario-600 rounded-lg font-bold hover:bg-primario-500">
                {guardando ? 'Guardando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
