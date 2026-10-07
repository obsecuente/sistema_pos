import React, { useState, useEffect, useRef } from 'react';

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

export default function DetalleVenta({ ventaId, alCerrar, alVentaAnulada }) {
  const [venta, setVenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [modalAnular, setModalAnular] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const contenedorRef = useRef(null);

  const cargarDetalle = async () => {
    setCargando(true);
    try {
      const data = await window.api.ventas.obtenerDetalle(ventaId);
      setVenta(data);
    } catch (err) {
      console.error('[DetalleVenta] Error al cargar venta:', err);
      setMensaje({ tipo: 'error', texto: 'Error al cargar el detalle del comprobante' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDetalle();
  }, [ventaId]);

  useEffect(() => {
    contenedorRef.current?.focus();
  }, [cargando]);

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 4000);
      return () => clearTimeout(t);
    }
  }, [mensaje]);

  const devolverFoco = () => setTimeout(() => contenedorRef.current?.focus(), 50);

  const manejarReimpresion = async () => {
    if (!venta || imprimiendo) return;
    setImprimiendo(true);

    const esAnulada = venta.estado === 'anulada';
    const rotulo = esAnulada ? '*** ANULADO ***' : '*** DUPLICADO ***';

    const items = (venta.items || []).map(it => ({
      nombre: it.nombre_snapshot,
      cantidad: parseFloat(it.cantidad || 1),
      precio: parseFloat(it.precio_unitario_snapshot || 0),
      subtotal: parseFloat(it.subtotal || 0),
    }));

    const datosTicket = {
      nombreNegocio: 'EL RINCON DEL GATO',
      rotulo,
      direccion: venta.cliente_nombre ? `Cliente: ${venta.cliente_nombre}` : 'Consumidor Final',
      fecha: formatearFechaHora(venta.creado_en),
      numeroVenta: venta.id,
      cajero: 'Caja Principal',
      items,
      subtotal: parseFloat(venta.subtotal || 0),
      recargo: parseFloat(venta.porcentaje_recargo || 0),
      total: parseFloat(venta.total || 0),
      medioPago: venta.medio_pago ? venta.medio_pago.toUpperCase().replace('_', ' ') : 'EFECTIVO',
    };

    try {
      const res = await window.api.hardware.imprimirTicket(datosTicket);
      if (res && res.exito === false) {
        setMensaje({ tipo: 'error', texto: res.error || 'No se pudo enviar la reimpresión a la ticketera' });
      } else {
        setMensaje({ tipo: 'exito', texto: `Comprobante ${esAnulada ? 'anulado' : 'duplicado'} enviado a la ticketera` });
      }
    } catch (err) {
      console.error('Error al reimprimir:', err);
      setMensaje({ tipo: 'error', texto: 'Error de comunicación con la impresora térmica' });
    } finally {
      setImprimiendo(false);
      devolverFoco();
    }
  };

  const ejecutarAnulacion = async () => {
    if (!venta || venta.estado === 'anulada') return;
    setAnulando(true);
    try {
      const res = await window.api.ventas.anular(venta.id, motivoAnulacion.trim());
      if (!res || !res.exito) {
        setMensaje({ tipo: 'error', texto: res?.error || 'No se pudo anular la venta' });
        setModalAnular(false);
        devolverFoco();
        return;
      }
      setModalAnular(false);
      setMensaje({ tipo: 'exito', texto: `Venta #${venta.id} anulada correctamente` });
      await cargarDetalle();
      if (alVentaAnulada) alVentaAnulada(venta.id);
    } catch (err) {
      console.error('Error al anular venta:', err);
      setMensaje({ tipo: 'error', texto: 'Error de base de datos al anular la venta' });
      setModalAnular(false);
    } finally {
      setAnulando(false);
      devolverFoco();
    }
  };

  // Teclado
  useEffect(() => {
    const manejar = (e) => {
      if (modalAnular) return;
      const el = document.activeElement;
      const enCampo = ['INPUT', 'TEXTAREA'].includes(el?.tagName);

      if (e.key === 'Escape') {
        e.preventDefault();
        alCerrar();
        return;
      }

      if (enCampo) return;

      if (e.key === 'F8') {
        e.preventDefault();
        manejarReimpresion();
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        if (venta && venta.estado !== 'anulada') {
          setModalAnular(true);
        }
      }
    };

    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [modalAnular, venta, alCerrar]);

  if (cargando) {
    return (
      <div className="absolute inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primario-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center p-6">
        <p className="text-gray-400 text-lg mb-4">No se pudo cargar el comprobante solicitado.</p>
        <button onClick={alCerrar} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium">
          Volver al listado
        </button>
      </div>
    );
  }

  const esAnulada = venta.estado === 'anulada';
  const numeroFormateado = String(venta.id).padStart(7, '0');

  return (
    <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col overflow-hidden">

      {/* CABECERA DE LA VENTA */}
      <div className="bg-gray-800 p-6 flex justify-between items-start gap-6 border-b border-gray-700 shrink-0">
        <div className="flex gap-5 items-start flex-1 min-w-0">
          <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center font-bold text-white border-2 shrink-0 ${esAnulada ? 'bg-peligro/20 border-peligro text-peligro' : 'bg-primario-900/60 border-primario-500 text-primario-300'}`}>
            <span className="text-xs uppercase tracking-wider">Ticket</span>
            <span className="text-xl font-black">#{venta.id}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-white">Comprobante N° {numeroFormateado}</h2>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${esAnulada ? 'bg-peligro/20 text-peligro border-peligro/40' : 'bg-exito/20 text-exito border-exito/40'}`}>
                {esAnulada ? 'Venta Anulada' : 'Venta Completada'}
              </span>
            </div>

            <p className="text-gray-400 text-sm mb-3">
              Emitido el {formatearFechaHora(venta.creado_en)}
            </p>

            <div className="grid grid-cols-3 gap-4 text-sm bg-gray-900/40 p-3 rounded-lg border border-gray-700">
              <div>
                <span className="text-xs text-gray-500 block">Cliente</span>
                <span className="text-white font-medium">{venta.cliente_nombre || 'Consumidor Final'}</span>
                {venta.cliente_cuit && <span className="text-xs text-gray-400 block">DNI {venta.cliente_cuit}</span>}
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Medio de pago</span>
                <span className="text-white font-medium capitalize">{venta.medio_pago ? venta.medio_pago.replace('_', ' ') : 'Efectivo'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Identificador de Venta</span>
                <span className="text-gray-300 font-mono">ID {venta.id}</span>
              </div>
            </div>

            {esAnulada && venta.motivo_anulacion && (
              <div className="mt-3 bg-peligro/10 border border-peligro/30 rounded px-3 py-1.5 text-xs text-peligro">
                <span className="font-bold">Motivo de anulación:</span> {venta.motivo_anulacion}
              </div>
            )}
          </div>
        </div>

        <div className="text-right bg-gray-900/60 p-4 rounded-xl border border-gray-700 shrink-0">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total del Ticket</p>
          <p className={`text-4xl font-black ${esAnulada ? 'text-gray-500 line-through' : 'text-white'}`}>
            {formatearPrecio(venta.total)}
          </p>
        </div>
      </div>

      {/* BOTONERA */}
      <div className="bg-gray-800/80 p-3 flex items-center gap-3 border-b border-gray-700 text-sm shrink-0">
        <button
          onClick={manejarReimpresion}
          disabled={imprimiendo}
          className="bg-primario-600 hover:bg-primario-500 text-white px-5 py-2.5 rounded-lg font-bold transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-primario-400 disabled:opacity-50"
        >
          <kbd className="bg-primario-800 px-2 py-1 rounded text-white mr-2">F8</kbd>
          {imprimiendo ? 'Imprimiendo...' : esAnulada ? 'Reimprimir Comprobante Anulado' : 'Reimprimir Duplicado'}
        </button>

        <button
          disabled={esAnulada}
          onClick={() => setModalAnular(true)}
          className="bg-gray-700 hover:bg-peligro/80 text-gray-300 hover:text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center border border-gray-600 hover:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700 disabled:hover:text-gray-300 disabled:hover:border-gray-600"
        >
          <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-300 mr-2">SUPR</kbd>
          Anular Venta
        </button>

        <div className="flex-1 text-right flex items-center justify-end gap-4 text-xs text-gray-400">
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">F8</kbd> Reimprimir</span>
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">SUPR</kbd> Anular venta</span>
          <span><kbd className="bg-gray-800 px-2 py-1 rounded mr-1 border border-gray-700 text-gray-300">ESC</kbd> Volver al listado</span>
        </div>
      </div>

      {mensaje && (
        <div className={`mx-6 mt-3 px-4 py-2 rounded-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-exito/10 border border-exito/30 text-exito' : 'bg-peligro/10 border border-peligro/30 text-peligro'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* TABLA DE ARTICULOS VENDIDOS */}
      <div ref={contenedorRef} tabIndex={0} className="flex-1 bg-gray-900 p-6 overflow-y-auto focus:outline-none">
        <h3 className="text-lg font-bold text-gray-200 mb-4">Artículos del Comprobante</h3>

        <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-750 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Cantidad</th>
                <th className="py-3 px-4">Descripción / Producto</th>
                <th className="py-3 px-4 text-right">Precio unitario</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {(venta.items || []).map((it) => (
                <tr key={it.id} className="hover:bg-gray-700/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                    {it.cantidad}
                  </td>
                  <td className="py-3 px-4 text-gray-200">
                    <span className="font-medium text-white">{it.nombre_snapshot}</span>
                    {it.codigo_barras && (
                      <span className="text-xs text-gray-400 block font-mono">{it.codigo_barras}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-300">
                    {formatearPrecio(it.precio_unitario_snapshot)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-white">
                    {formatearPrecio(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-750 border-t border-gray-700 text-white font-bold">
              <tr>
                <td colSpan="3" className="py-3 px-4 text-right text-gray-400">Total Facturado</td>
                <td className="py-3 px-4 text-right text-xl text-primario-400">
                  {formatearPrecio(venta.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* MODAL DE ANULACION */}
      {modalAnular && (
        <ModalAnularVenta
          numeroTicket={numeroFormateado}
          motivo={motivoAnulacion}
          alCambiarMotivo={setMotivoAnulacion}
          anulando={anulando}
          alConfirmar={ejecutarAnulacion}
          alCancelar={() => { setModalAnular(false); devolverFoco(); }}
        />
      )}
    </div>
  );
}

// ── Modal de Confirmación de Anulación (sin contraseña) ──────────────
function ModalAnularVenta({ numeroTicket, motivo, alCambiarMotivo, anulando, alConfirmar, alCancelar }) {
  const [opcion, setOpcion] = useState('cancelar');
  const inputRef = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        alCancelar();
      } else if (['ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key) && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setOpcion(o => (o === 'cancelar' ? 'anular' : 'cancelar'));
      } else if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        if (opcion === 'anular') alConfirmar();
        else alCancelar();
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [opcion, alConfirmar, alCancelar]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-md p-6 animacion-modal shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 text-center">Anular ticket de venta</h2>
        <p className="text-gray-300 text-sm text-center mb-4">
          ¿Está seguro de anular el ticket N° {numeroTicket}? Se repondrá el stock a los productos y se cancelará el saldo en cuenta corriente si corresponde.
        </p>

        <div className="mb-6">
          <label className="block text-xs text-gray-400 mb-1">Motivo de anulación opcional</label>
          <input
            ref={inputRef}
            type="text"
            value={motivo}
            onChange={(e) => alCambiarMotivo(e.target.value)}
            placeholder="Ejemplo: Devolución de mercadería o error de cobro"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-primario-500 focus:outline-none placeholder:text-gray-600"
          />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-700">
          <span className="text-xs text-gray-500">
            <kbd className="bg-gray-700 px-1 text-white rounded">ESC</kbd> para salir
          </span>
          <div className="flex gap-3">
            <button
              onClick={alCancelar}
              className={`px-4 py-2 rounded-lg font-medium text-white transition-all ${opcion === 'cancelar' ? 'bg-gray-600 ring-2 ring-gray-400' : 'bg-gray-700'}`}
            >
              Cancelar
            </button>
            <button
              disabled={anulando}
              onClick={alConfirmar}
              className={`px-4 py-2 rounded-lg font-bold text-white transition-all ${opcion === 'anular' ? 'bg-peligro ring-2 ring-red-400' : 'bg-peligro/80'}`}
            >
              {anulando ? 'Anulando...' : 'Confirmar Anulación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
