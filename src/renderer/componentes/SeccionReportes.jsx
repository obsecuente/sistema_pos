// ============================================================================
// SeccionReportes.jsx — Módulo de Reportes Contables y Auditoría (F10)
//
// Responsabilidades:
//   - Router de 3 vistas navegables por teclado y ratón:
//       1. [ Historial de Ventas ]
//       2. [ Cuentas Corrientes ]
//       3. [ Cierres de Caja ]
//   - Vista en detalle in-place de comprobantes (DetalleVenta)
//   - Métricas financieras en tiempo real
//   - Purga histórica de ventas con presets y calendario
//   - Cierre de turno integrado (F9)
//   - Cumplimiento estricto: sin emojis, sin abreviaturas, sin paréntesis en textos
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useTiendaApp, { SECCIONES } from '../store/useTiendaApp';
import DetalleVenta from './DetalleVenta';

function parsearFecha(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function formatearFechaHora(s) {
  const d = parsearFecha(s);
  return d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '-';
}

function formatearPrecio(v) {
  return '$ ' + parseFloat(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obtenerFechaHoy() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function obtenerFechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

const PESTANAS = [
  { id: 'ventas', label: 'Historial de Ventas' },
  { id: 'cuentas', label: 'Cuentas Corrientes' },
  { id: 'cajas', label: 'Cierres de Caja' },
];

export default function SeccionReportes() {
  const irASeccion = useTiendaApp((s) => s.irASeccion);

  // Navegación de pestañas: inicialmente sin cargar vista hasta que el usuario elija
  const [indicePestana, setIndicePestana] = useState(0);
  const [pestanaActiva, setPestanaActiva] = useState(null);
  const [focoEnPestanas, setFocoEnPestanas] = useState(true);

  // Venta seleccionada para ver in-place
  const [ventaDetalleId, setVentaDetalleId] = useState(null);

  // Modal de purga
  const [modalPurgaAbierto, setModalPurgaAbierto] = useState(false);

  // Referencias
  const barraPestanasRef = useRef(null);

  // Manejo de teclado para la barra de pestañas principal
  useEffect(() => {
    const manejarTecladoPestanas = (e) => {
      if (ventaDetalleId || modalPurgaAbierto) return;

      const tag = document.activeElement?.tagName;
      const enInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if (e.key === 'Escape') {
        if (!focoEnPestanas) {
          e.preventDefault();
          setFocoEnPestanas(true);
          barraPestanasRef.current?.focus();
        }
        return;
      }

      if (focoEnPestanas && !enInput) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setIndicePestana((prev) => (prev + 1) % PESTANAS.length);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setIndicePestana((prev) => (prev - 1 + PESTANAS.length) % PESTANAS.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setPestanaActiva(indicePestana);
          setFocoEnPestanas(false);
        } else if (e.key === 'ArrowDown') {
          if (pestanaActiva !== null) {
            e.preventDefault();
            setFocoEnPestanas(false);
          }
        }
      }
    };

    window.addEventListener('keydown', manejarTecladoPestanas);
    return () => window.removeEventListener('keydown', manejarTecladoPestanas);
  }, [indicePestana, pestanaActiva, focoEnPestanas, ventaDetalleId, modalPurgaAbierto]);

  const seleccionarPestana = (indice) => {
    setIndicePestana(indice);
    setPestanaActiva(indice);
    setFocoEnPestanas(false);
  };

  if (ventaDetalleId) {
    return (
      <DetalleVenta
        ventaId={ventaDetalleId}
        alCerrar={() => setVentaDetalleId(null)}
        alVentaAnulada={() => {
          // Si se anula la venta, volver al listado de ventas
        }}
      />
    );
  }

  return (
    <div className="flex-1 bg-gray-900 flex flex-col overflow-hidden select-none">
      {/* BARRA SUPERIOR DE PESTANAS */}
      <div
        ref={barraPestanasRef}
        tabIndex={0}
        className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between shrink-0 focus:outline-none"
      >
        <div className="flex items-center gap-2">
          {PESTANAS.map((pestana, idx) => {
            const estaSeleccionada = indicePestana === idx;
            const estaActiva = pestanaActiva === idx;

            return (
              <button
                key={pestana.id}
                type="button"
                onClick={() => seleccionarPestana(idx)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  estaActiva
                    ? 'bg-primario-600 text-white shadow-lg shadow-primario-900/50'
                    : estaSeleccionada && focoEnPestanas
                    ? 'bg-gray-700 text-white ring-2 ring-primario-400'
                    : 'bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <span>[ {pestana.label} ]</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>
            <kbd className="bg-gray-700 px-2 py-0.5 rounded text-gray-300 mr-1 border border-gray-600">Flechas</kbd>
            Navegar vistas
          </span>
          <span>
            <kbd className="bg-gray-700 px-2 py-0.5 rounded text-gray-300 mr-1 border border-gray-600">Enter</kbd>
            Seleccionar
          </span>
          <span>
            <kbd className="bg-gray-700 px-2 py-0.5 rounded text-gray-300 mr-1 border border-gray-600">ESC</kbd>
            Volver a pestañas
          </span>
        </div>
      </div>

      {/* CUERPO DE LA SECCION */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {pestanaActiva === null ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Módulo de Reportes Contables</h2>
            <p className="text-gray-400 text-sm max-w-md mb-8">
              Seleccione una de las tres vistas utilizando las flechas del teclado o el ratón para comenzar la consulta.
            </p>

            <div className="grid grid-cols-3 gap-6 max-w-3xl w-full">
              {PESTANAS.map((pestana, idx) => {
                const enfocado = indicePestana === idx;
                return (
                  <div
                    key={pestana.id}
                    onClick={() => seleccionarPestana(idx)}
                    className={`cursor-pointer rounded-2xl p-6 border-2 transition-all text-left ${
                      enfocado
                        ? 'bg-gray-800 border-primario-500 shadow-xl scale-105'
                        : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-primario-400 mb-2">
                      Vista {idx + 1}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{pestana.label}</h3>
                    <p className="text-xs text-gray-400">
                      {idx === 0 && 'Consultas de comprobantes emitidos, métricas de facturación y purga histórica.'}
                      {idx === 1 && 'Auditoría de deuda en la calle, clientes deudores y rangos de morosidad.'}
                      {idx === 2 && 'Historial de arqueos de caja, diferencias de dinero y acceso al cierre de turno.'}
                    </p>
                    <div className="mt-4 pt-4 border-t border-gray-700/60 flex items-center justify-between text-xs text-gray-400">
                      <span>Presione Enter para abrir</span>
                      {enfocado && <span className="text-primario-400 font-bold">Seleccionado</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : pestanaActiva === 0 ? (
          <VistaHistorialVentas
            alAbrirDetalle={(id) => setVentaDetalleId(id)}
            alAbrirPurga={() => setModalPurgaAbierto(true)}
            focoEnPestanas={focoEnPestanas}
            alDevolverFoco={() => setFocoEnPestanas(true)}
          />
        ) : pestanaActiva === 1 ? (
          <VistaCuentasCorrientes
            alIrACuentas={() => irASeccion(SECCIONES.CUENTAS_CORRIENTES)}
            focoEnPestanas={focoEnPestanas}
            alDevolverFoco={() => setFocoEnPestanas(true)}
          />
        ) : (
          <VistaCierresCaja
            alIrACierreTurno={() => irASeccion(SECCIONES.CIERRE_CAJA)}
            focoEnPestanas={focoEnPestanas}
            alDevolverFoco={() => setFocoEnPestanas(true)}
          />
        )}
      </div>

      {/* MODAL DE PURGA HISTORICA */}
      {modalPurgaAbierto && (
        <ModalPurgarVentas alCerrar={() => setModalPurgaAbierto(false)} />
      )}
    </div>
  );
}

// ============================================================================
// 1. VISTA: HISTORIAL DE VENTAS
// ============================================================================
function VistaHistorialVentas({ alAbrirDetalle, alAbrirPurga, focoEnPestanas, alDevolverFoco }) {
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState({
    totalFacturado: 0,
    totalEfectivo: 0,
    totalTarjeta: 0,
    totalTransferencia: 0,
    totalCuentaCorriente: 0,
    totalAnulado: 0,
  });
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [pagina, setPagina] = useState(1);
  const limite = 50;
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [periodo, setPeriodo] = useState('hoy');
  const [fechaDesde, setFechaDesde] = useState(obtenerFechaHoy());
  const [fechaHasta, setFechaHasta] = useState(obtenerFechaHoy());
  const [medioPago, setMedioPago] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  // Navegación de tabla por teclado
  const [filaSeleccionada, setFilaSeleccionada] = useState(0);
  const tablaRef = useRef(null);

  const cargarVentas = useCallback(async () => {
    setCargando(true);
    try {
      let desde = fechaDesde;
      let hasta = fechaHasta;

      if (periodo === 'hoy') {
        desde = obtenerFechaHoy();
        hasta = obtenerFechaHoy();
      } else if (periodo === '7dias') {
        desde = obtenerFechaHaceDias(7);
        hasta = obtenerFechaHoy();
      } else if (periodo === 'mes') {
        const d = new Date();
        desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        hasta = obtenerFechaHoy();
      }

      const res = await window.api.ventas.obtenerHistorial({
        fechaDesde: desde,
        fechaHasta: hasta,
        medioPago: medioPago === 'todos' ? null : medioPago,
        estado: estado === 'todos' ? null : estado,
        busqueda: busqueda.trim() || null,
        pagina,
        limite,
      });

      if (res) {
        setVentas(res.filas || []);
        setTotalRegistros(res.total || 0);
        setResumen(res.resumen || {});
      }
    } catch (err) {
      console.error('[VistaHistorialVentas] Error al cargar ventas:', err);
    } finally {
      setCargando(false);
    }
  }, [periodo, fechaDesde, fechaHasta, medioPago, estado, busqueda, pagina]);

  useEffect(() => {
    cargarVentas();
  }, [cargarVentas]);

  // Teclado dentro de la vista
  useEffect(() => {
    const manejarKeyDown = (e) => {
      if (focoEnPestanas) return;
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFilaSeleccionada((prev) => Math.min(ventas.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filaSeleccionada === 0) {
          alDevolverFoco();
        } else {
          setFilaSeleccionada((prev) => Math.max(0, prev - 1));
        }
      } else if (e.key === 'Enter') {
        if (ventas[filaSeleccionada]) {
          e.preventDefault();
          alAbrirDetalle(ventas[filaSeleccionada].id);
        }
      } else if (e.key === 'F8') {
        if (ventas[filaSeleccionada]) {
          e.preventDefault();
          reimprimirVentaDirecta(ventas[filaSeleccionada]);
        }
      }
    };

    window.addEventListener('keydown', manejarKeyDown);
    return () => window.removeEventListener('keydown', manejarKeyDown);
  }, [focoEnPestanas, ventas, filaSeleccionada, alAbrirDetalle, alDevolverFoco]);

  const reimprimirVentaDirecta = async (v) => {
    try {
      const detalle = await window.api.ventas.obtenerDetalle(v.id);
      if (!detalle) return;

      const esAnulada = detalle.estado === 'anulada';
      const rotulo = esAnulada ? '*** ANULADO ***' : '*** DUPLICADO ***';

      const items = (detalle.items || []).map((it) => ({
        nombre: it.nombre_snapshot,
        cantidad: parseFloat(it.cantidad || 1),
        precio: parseFloat(it.precio_unitario_snapshot || 0),
        subtotal: parseFloat(it.subtotal || 0),
      }));

      await window.api.hardware.imprimirTicket({
        nombreNegocio: 'EL RINCON DEL GATO',
        rotulo,
        direccion: detalle.cliente_nombre ? `Cliente: ${detalle.cliente_nombre}` : 'Consumidor Final',
        fecha: formatearFechaHora(detalle.creado_en),
        numeroVenta: detalle.id,
        cajero: 'Caja Principal',
        items,
        subtotal: parseFloat(detalle.subtotal || 0),
        recargo: parseFloat(detalle.porcentaje_recargo || 0),
        total: parseFloat(detalle.total || 0),
        medioPago: detalle.medio_pago ? detalle.medio_pago.toUpperCase().replace('_', ' ') : 'EFECTIVO',
      });
    } catch (err) {
      console.error('Error al reimprimir:', err);
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / limite));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* TARJETAS DE RESUMEN FINANCIERO */}
      <div className="bg-gray-850 p-4 border-b border-gray-700 shrink-0">
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase font-medium block">Total Facturado</span>
            <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(resumen.totalFacturado)}</span>
            <span className="text-xs text-gray-500 block">Ventas completadas</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase font-medium block">Efectivo</span>
            <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(resumen.totalEfectivo)}</span>
            <span className="text-xs text-gray-500 block">Cobros en mano</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase font-medium block">Tarjeta</span>
            <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(resumen.totalTarjeta)}</span>
            <span className="text-xs text-gray-500 block">Débito y Crédito</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase font-medium block">Transferencia</span>
            <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(resumen.totalTransferencia)}</span>
            <span className="text-xs text-gray-500 block">Bancos y billeteras</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 uppercase font-medium block">Cuenta Corriente</span>
            <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(resumen.totalCuentaCorriente)}</span>
            <span className="text-xs text-gray-500 block">Fiado acumulado</span>
          </div>

          <div className="bg-peligro/10 border border-peligro/30 rounded-xl p-3">
            <span className="text-xs text-peligro uppercase font-bold block">Total Anulado</span>
            <span className="text-xl font-black text-peligro mt-0.5 block">{formatearPrecio(resumen.totalAnulado)}</span>
            <span className="text-xs text-peligro/70 block">Ventas canceladas</span>
          </div>
        </div>
      </div>

      {/* FILTROS Y ACCIONES */}
      <div className="bg-gray-800 px-6 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-4 shrink-0 text-sm">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Período de consulta</label>
            <select
              value={periodo}
              onChange={(e) => {
                setPeriodo(e.target.value);
                setPagina(1);
              }}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:border-primario-500 focus:outline-none"
            >
              <option value="hoy">Hoy</option>
              <option value="7dias">Últimos 7 días</option>
              <option value="mes">Este mes</option>
              <option value="personalizado">Rango personalizado</option>
            </select>
          </div>

          {periodo === 'personalizado' && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => { setFechaDesde(e.target.value); setPagina(1); }}
                  className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:border-primario-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => { setFechaHasta(e.target.value); setPagina(1); }}
                  className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:border-primario-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-1">Medio de pago</label>
            <select
              value={medioPago}
              onChange={(e) => { setMedioPago(e.target.value); setPagina(1); }}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:border-primario-500 focus:outline-none"
            >
              <option value="todos">Todos los medios</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="cuenta_corriente">Cuenta Corriente</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Estado</label>
            <select
              value={estado}
              onChange={(e) => { setEstado(e.target.value); setPagina(1); }}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:border-primario-500 focus:outline-none"
            >
              <option value="todos">Todos los estados</option>
              <option value="completada">Completadas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>

          <div className="w-56">
            <label className="text-xs text-gray-400 block mb-1">Buscar ticket o cliente</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Número o nombre..."
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:border-primario-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={alAbrirPurga}
            className="bg-gray-700 hover:bg-peligro/80 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors border border-gray-600 hover:border-peligro"
          >
            Purgar ventas antiguas
          </button>
        </div>
      </div>

      {/* TABLA DE VENTAS */}
      <div ref={tablaRef} className="flex-1 overflow-y-auto">
        {cargando ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-primario-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : ventas.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No se encontraron comprobantes para el filtro seleccionado
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-800 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Número de ticket</th>
                <th className="py-3 px-4">Fecha y hora</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Medio de pago</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {ventas.map((v, idx) => {
                const seleccionada = idx === filaSeleccionada;
                const esAnulada = v.estado === 'anulada';

                return (
                  <tr
                    key={v.id}
                    onClick={() => {
                      setFilaSeleccionada(idx);
                      alAbrirDetalle(v.id);
                    }}
                    className={`cursor-pointer transition-colors ${
                      seleccionada
                        ? 'bg-primario-800/80 text-white'
                        : 'hover:bg-gray-800/60 text-gray-200'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold">
                      #{String(v.id).padStart(7, '0')}
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {formatearFechaHora(v.creado_en)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-white">{v.cliente_nombre || 'Consumidor Final'}</span>
                      {v.cliente_cuit && <span className="text-xs text-gray-400 block">DNI {v.cliente_cuit}</span>}
                    </td>
                    <td className="py-3 px-4 capitalize">
                      {v.medio_pago ? v.medio_pago.replace('_', ' ') : 'Efectivo'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          esAnulada
                            ? 'bg-peligro/20 text-peligro border border-peligro/30'
                            : 'bg-exito/20 text-exito border border-exito/30'
                        }`}
                      >
                        {esAnulada ? 'Anulada' : 'Completada'}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${esAnulada ? 'line-through text-gray-500' : 'text-white'}`}>
                      {formatearPrecio(v.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PIE DE TABLA CON PAGINACION */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-2.5 flex items-center justify-between text-xs text-gray-400 shrink-0">
        <div>
          <span>Total de comprobantes: <strong className="text-white">{totalRegistros}</strong></span>
          <span className="mx-3">|</span>
          <span>Página <strong className="text-white">{pagina}</strong> de <strong className="text-white">{totalPaginas}</strong></span>
        </div>

        <div className="flex items-center gap-4">
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300 mr-1 border border-gray-600">Enter</kbd> Ver detalle</span>
          <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300 mr-1 border border-gray-600">F8</kbd> Reimprimir</span>

          <div className="flex items-center gap-2 ml-4">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. VISTA: CARTERA DE CUENTAS CORRIENTES
// ============================================================================
function VistaCuentasCorrientes({ alIrACuentas, focoEnPestanas, alDevolverFoco }) {
  const [datos, setDatos] = useState({
    totalDeuda: 0,
    totalClientesDeudores: 0,
    alDia: 0,
    mora15: 0,
    mora30: 0,
    deudores: [],
  });
  const [cargando, setCargando] = useState(true);
  const [filaSeleccionada, setFilaSeleccionada] = useState(0);

  const cargarCartera = async () => {
    setCargando(true);
    try {
      const res = await window.api.reportes.carteraCuentas();
      if (res) setDatos(res);
    } catch (err) {
      console.error('[VistaCuentasCorrientes] Error al cargar cartera:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCartera();
  }, []);

  // Teclado
  useEffect(() => {
    const manejarKeyDown = (e) => {
      if (focoEnPestanas) return;
      const deudores = datos.deudores || [];
      if (deudores.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFilaSeleccionada((prev) => Math.min(deudores.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filaSeleccionada === 0) {
          alDevolverFoco();
        } else {
          setFilaSeleccionada((prev) => Math.max(0, prev - 1));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        alIrACuentas();
      }
    };

    window.addEventListener('keydown', manejarKeyDown);
    return () => window.removeEventListener('keydown', manejarKeyDown);
  }, [focoEnPestanas, datos.deudores, filaSeleccionada, alDevolverFoco, alIrACuentas]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* TARJETAS RESUMEN DE CARTERA */}
      <div className="bg-gray-850 p-4 border-b border-gray-700 shrink-0">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <span className="text-xs text-gray-400 uppercase font-medium block">Total Deuda en la Calle</span>
            <span className="text-2xl font-black text-white mt-1 block">{formatearPrecio(datos.totalDeuda)}</span>
            <span className="text-xs text-gray-500 mt-1 block">Saldo acumulado por cobrar</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <span className="text-xs text-gray-400 uppercase font-medium block">Clientes Deudores</span>
            <span className="text-2xl font-black text-white mt-1 block">{datos.totalClientesDeudores}</span>
            <span className="text-xs text-gray-500 mt-1 block">Cuentas con saldo activo</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <span className="text-xs text-gray-400 uppercase font-medium block">Cuentas al Día</span>
            <span className="text-2xl font-black text-exito mt-1 block">{datos.alDia}</span>
            <span className="text-xs text-gray-500 mt-1 block">Menos de 15 días de antigüedad</span>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <span className="text-xs text-gray-400 uppercase font-medium block">Mora Mayor a 15 Días</span>
            <span className="text-2xl font-black text-alerta mt-1 block">{datos.mora15}</span>
            <span className="text-xs text-gray-500 mt-1 block">Entre 15 y 30 días de mora</span>
          </div>

          <div className="bg-peligro/10 border border-peligro/30 rounded-xl p-4">
            <span className="text-xs text-peligro uppercase font-bold block">Mora Mayor a 30 Días</span>
            <span className="text-2xl font-black text-peligro mt-1 block">{datos.mora30}</span>
            <span className="text-xs text-peligro/70 mt-1 block">Atención requerida urgente</span>
          </div>
        </div>
      </div>

      {/* CABECERA DE LA TABLA */}
      <div className="bg-gray-800 px-6 py-3 border-b border-gray-700 flex justify-between items-center shrink-0">
        <h3 className="text-sm font-bold text-white">Detalle de Clientes con Deuda Activa</h3>
        <button
          type="button"
          onClick={alIrACuentas}
          className="bg-primario-600 hover:bg-primario-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
        >
          Gestionar en Cuentas Corrientes
        </button>
      </div>

      {/* TABLA DE DEUDORES */}
      <div className="flex-1 overflow-y-auto">
        {cargando ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-primario-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (datos.deudores || []).length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No hay clientes con saldo deudor en este momento
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-800 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">DNI / CUIT</th>
                <th className="py-3 px-4">Teléfono</th>
                <th className="py-3 px-4">Antigüedad de deuda</th>
                <th className="py-3 px-4">Estado de mora</th>
                <th className="py-3 px-4 text-right">Deuda acumulada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {(datos.deudores || []).map((c, idx) => {
                const seleccionada = idx === filaSeleccionada;
                let dias = 0;
                if (c.deuda_desde) {
                  const fm = new Date(String(c.deuda_desde).replace(' ', 'T') + 'Z').getTime();
                  dias = Math.floor((Date.now() - fm) / 86400000);
                }

                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setFilaSeleccionada(idx);
                      alIrACuentas();
                    }}
                    className={`cursor-pointer transition-colors ${
                      seleccionada
                        ? 'bg-primario-800/80 text-white'
                        : 'hover:bg-gray-800/60 text-gray-200'
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-white">{c.nombre}</td>
                    <td className="py-3 px-4 text-gray-400 font-mono">{c.cuit || '-'}</td>
                    <td className="py-3 px-4 text-gray-400">{c.telefono || '-'}</td>
                    <td className="py-3 px-4 text-gray-300">
                      {c.deuda_desde ? `${dias} días` : 'Al día'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          dias >= 30
                            ? 'bg-peligro/20 text-peligro border border-peligro/30'
                            : dias >= 15
                            ? 'bg-alerta/20 text-alerta border border-alerta/30'
                            : 'bg-exito/20 text-exito border border-exito/30'
                        }`}
                      >
                        {dias >= 30 ? 'Mora grave' : dias >= 15 ? 'Mora media' : 'Al día'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-white text-base">
                      {formatearPrecio(c.saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 3. VISTA: CIERRES DE CAJA
// ============================================================================
function VistaCierresCaja({ alIrACierreTurno, focoEnPestanas, alDevolverFoco }) {
  const [cierres, setCierres] = useState([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [pagina, setPagina] = useState(1);
  const limite = 50;
  const [cargando, setCargando] = useState(true);
  const [filaSeleccionada, setFilaSeleccionada] = useState(0);

  const cargarCierres = async () => {
    setCargando(true);
    try {
      const res = await window.api.caja.obtenerHistorial(pagina, limite);
      if (res) {
        setCierres(res.filas || []);
        setTotalRegistros(res.total || 0);
      }
    } catch (err) {
      console.error('[VistaCierresCaja] Error al cargar cierres:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCierres();
  }, [pagina]);

  // Teclado
  useEffect(() => {
    const manejarKeyDown = (e) => {
      if (focoEnPestanas) return;
      if (cierres.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFilaSeleccionada((prev) => Math.min(cierres.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filaSeleccionada === 0) {
          alDevolverFoco();
        } else {
          setFilaSeleccionada((prev) => Math.max(0, prev - 1));
        }
      }
    };

    window.addEventListener('keydown', manejarKeyDown);
    return () => window.removeEventListener('keydown', manejarKeyDown);
  }, [focoEnPestanas, cierres, filaSeleccionada, alDevolverFoco]);

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / limite));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* BARRA SUPERIOR DE ACCION */}
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700 flex justify-between items-center shrink-0">
        <div>
          <h3 className="text-base font-bold text-white">Historial de Cierres de Turno y Arqueos</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Registro inmutable de arqueos realizados con diferencias de dinero y montos rendidos
          </p>
        </div>

        <button
          type="button"
          onClick={alIrACierreTurno}
          className="bg-primario-600 hover:bg-primario-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-primario-900/40"
        >
          <kbd className="bg-primario-800 px-2 py-0.5 rounded text-white text-xs">F9</kbd>
          Realizar cierre de turno
        </button>
      </div>

      {/* TABLA DE CIERRES */}
      <div className="flex-1 overflow-y-auto">
        {cargando ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-primario-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : cierres.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No se han registrado cierres de caja aún
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-800 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Identificador de cierre</th>
                <th className="py-3 px-4">Fecha y hora de cierre</th>
                <th className="py-3 px-4">Período abarcado</th>
                <th className="py-3 px-4 text-right">Efectivo sistema</th>
                <th className="py-3 px-4 text-right">Tarjeta</th>
                <th className="py-3 px-4 text-right">Transferencia</th>
                <th className="py-3 px-4 text-right">Cuenta corriente</th>
                <th className="py-3 px-4 text-right">Efectivo contado</th>
                <th className="py-3 px-4 text-right">Diferencia de caja</th>
                <th className="py-3 px-4">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {cierres.map((c, idx) => {
                const seleccionada = idx === filaSeleccionada;
                const dif = parseFloat(c.diferencia || 0);

                return (
                  <tr
                    key={c.id}
                    onClick={() => setFilaSeleccionada(idx)}
                    className={`transition-colors ${
                      seleccionada
                        ? 'bg-primario-800/80 text-white'
                        : 'hover:bg-gray-800/60 text-gray-200'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold">
                      #{String(c.id).padStart(6, '0')}
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {formatearFechaHora(c.periodo_hasta || c.creado_en)}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400">
                      Desde {formatearFechaHora(c.periodo_desde)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatearPrecio(c.total_efectivo)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatearPrecio(c.total_tarjeta)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatearPrecio(c.total_transferencia)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {formatearPrecio(c.total_fiado)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-white">
                      {formatearPrecio(c.monto_en_caja)}
                    </td>
                    <td className="py-3 px-4 text-right font-black">
                      <span
                        className={`${
                          Math.abs(dif) < 0.01
                            ? 'text-gray-400'
                            : dif > 0
                            ? 'text-exito'
                            : 'text-peligro'
                        }`}
                      >
                        {Math.abs(dif) < 0.01
                          ? 'Exacto'
                          : (dif > 0 ? '+ ' : '') + formatearPrecio(dif)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 max-w-xs truncate">
                      {c.notas || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PIE DE TABLA CON PAGINACION */}
      <div className="bg-gray-800 border-t border-gray-700 px-6 py-2.5 flex items-center justify-between text-xs text-gray-400 shrink-0">
        <div>
          <span>Total de registros: <strong className="text-white">{totalRegistros}</strong></span>
          <span className="mx-3">|</span>
          <span>Página <strong className="text-white">{pagina}</strong> de <strong className="text-white">{totalPaginas}</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: PURGA HISTORICA DE VENTAS
// ============================================================================
function ModalPurgarVentas({ alCerrar }) {
  const [modo, setModo] = useState('30dias');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState(obtenerFechaHaceDias(30));
  const [conteo, setConteo] = useState(0);
  const [cargandoConteo, setCargandoConteo] = useState(true);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  const btnCancelarRef = useRef(null);

  useEffect(() => {
    btnCancelarRef.current?.focus();
  }, []);

  const actualizarConteo = useCallback(async () => {
    setCargandoConteo(true);
    setError(null);
    try {
      let fDesde = null;
      let fHasta = null;

      if (modo === '30dias') {
        fHasta = obtenerFechaHaceDias(30);
      } else {
        fDesde = fechaDesde || null;
        fHasta = fechaHasta || null;
      }

      const res = await window.api.ventas.purgar({
        fechaDesde: fDesde,
        fechaHasta: fHasta,
        soloConteo: true,
      });

      setConteo(res?.total || 0);
    } catch (err) {
      console.error('Error al obtener conteo de purga:', err);
    } finally {
      setCargandoConteo(false);
    }
  }, [modo, fechaDesde, fechaHasta]);

  useEffect(() => {
    actualizarConteo();
  }, [actualizarConteo]);

  const ejecutarPurga = async () => {
    if (ejecutando) return;
    setEjecutando(true);
    setError(null);
    try {
      let fDesde = null;
      let fHasta = null;

      if (modo === '30dias') {
        fHasta = obtenerFechaHaceDias(30);
      } else {
        fDesde = fechaDesde || null;
        fHasta = fechaHasta || null;
      }

      const res = await window.api.ventas.purgar({
        fechaDesde: fDesde,
        fechaHasta: fHasta,
        soloConteo: false,
      });

      if (res && res.exito) {
        setResultado(res.eliminados);
        setTimeout(() => {
          alCerrar();
          window.location.reload();
        }, 1500);
      } else {
        setError(res?.error || 'No se pudo completar la purga de ventas');
      }
    } catch (err) {
      console.error('Error al ejecutar purga:', err);
      setError('Error al purgar los registros');
    } finally {
      setEjecutando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-peligro/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl animacion-modal">
        <h3 className="text-xl font-bold text-white mb-1">Purga Histórica de Comprobantes</h3>
        <p className="text-xs text-gray-400 mb-6">
          Esta acción eliminará de forma irreversible los comprobantes de venta y sus artículos del almacenamiento local.
        </p>

        {resultado !== null ? (
          <div className="bg-exito/10 border border-exito/30 rounded-xl p-4 text-center my-4">
            <p className="text-exito font-bold text-lg">Purga completada con éxito</p>
            <p className="text-xs text-gray-300 mt-1">Se eliminaron {resultado} comprobantes.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-300 block mb-2">
                  Criterio de eliminación
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModo('30dias');
                      setFechaHasta(obtenerFechaHaceDias(30));
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      modo === '30dias'
                        ? 'bg-primario-900/60 border-primario-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400'
                    }`}
                  >
                    Más de 30 días de antigüedad
                  </button>

                  <button
                    type="button"
                    onClick={() => setModo('personalizado')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${
                      modo === 'personalizado'
                        ? 'bg-primario-900/60 border-primario-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400'
                    }`}
                  >
                    Rango personalizado por calendario
                  </button>
                </div>
              </div>

              {modo === 'personalizado' && (
                <div className="grid grid-cols-2 gap-4 bg-gray-900/60 p-4 rounded-xl border border-gray-700">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fecha inicial desde</label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => setFechaDesde(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs focus:border-primario-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fecha final hasta</label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => setFechaHasta(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs focus:border-primario-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                <span className="text-xs text-gray-400">Comprobantes a eliminar según criterio:</span>
                <span className="text-2xl font-black text-peligro">
                  {cargandoConteo ? '...' : conteo}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 mb-4 bg-peligro/10 border border-peligro/30 rounded-xl text-peligro text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
              <span className="text-xs text-gray-500">ESC para cancelar</span>
              <div className="flex gap-3">
                <button
                  ref={btnCancelarRef}
                  type="button"
                  onClick={alCerrar}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={conteo === 0 || ejecutando}
                  onClick={ejecutarPurga}
                  className="px-5 py-2 bg-peligro hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ejecutando ? 'Purgando...' : 'Confirmar Purga'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
