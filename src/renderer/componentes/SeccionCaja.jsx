// ============================================================================
// SeccionCaja.jsx — Arqueo y Cierre de Turno de Caja (F4)
//
// Responsabilidades:
//   - Obtener el resumen de ventas del turno actual desde el último cierre
//   - Mostrar totales discriminados por medio de pago (Efectivo, Tarjeta, Transferencia, Fiado)
//   - Desglosar el flujo de caja chica (Monto inicial + Ventas + Ingresos - Egresos)
//   - Calcular en tiempo real el efectivo esperado y la diferencia de caja (sobrante o faltante)
//   - Permitir registrar ingresos y egresos de efectivo manuales (F8)
//   - Registrar el cierre de caja de forma transaccional e imprimir comprobante térmico
//   - Operabilidad total con teclado (Enter, Escape, Tab, flechas)
//   - Cumplimiento estricto: sin emojis, sin paréntesis, sin textos secundarios redundantes
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import useTiendaApp, { SECCIONES } from '../store/useTiendaApp';
import ModalMovimientoCaja from './ModalMovimientoCaja';

function parsearFecha(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function formatearFechaHora(s) {
  const d = parsearFecha(s);
  return d ? d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'Inicio histórico';
}

function formatearPrecio(v) {
  return '$ ' + parseFloat(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SeccionCaja() {
  const irASeccion = useTiendaApp((s) => s.irASeccion);

  const [cargando, setCargando] = useState(true);
  const [datosTurno, setDatosTurno] = useState({ desde: null, resumen: [], montoInicial: 0, totalIngresos: 0, totalEgresos: 0 });
  const [montoEnCaja, setMontoEnCaja] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cierreExitoso, setCierreExitoso] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [modalMovimientoAbierto, setModalMovimientoAbierto] = useState(false);

  const inputMontoRef = useRef(null);
  const textareaNotasRef = useRef(null);

  const cargarResumenTurno = async () => {
    setCargando(true);
    setMensajeError(null);
    try {
      const data = await window.api.caja.resumenTurno();
      setDatosTurno(data || { desde: null, resumen: [], montoInicial: 0, totalIngresos: 0, totalEgresos: 0 });
    } catch (err) {
      console.error('[SeccionCaja] Error al cargar resumen de turno:', err);
      setMensajeError('Error al comunicarse con la base de datos para obtener el resumen');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarResumenTurno();
  }, []);

  useEffect(() => {
    if (!cargando && !modalMovimientoAbierto && inputMontoRef.current) {
      inputMontoRef.current.focus();
    }
  }, [cargando, modalMovimientoAbierto]);

  useEffect(() => {
    if (mensajeExito) {
      const t = setTimeout(() => setMensajeExito(null), 3000);
      return () => clearTimeout(t);
    }
  }, [mensajeExito]);

  // Cálculos contables del turno
  let totalEfectivo = 0;
  let totalTarjeta = 0;
  let totalTransferencia = 0;
  let totalFiado = 0;
  let totalComprobantes = 0;

  (datosTurno.resumen || []).forEach((r) => {
    const total = parseFloat(r.total || 0);
    const cantidad = parseInt(r.cantidad_ventas || 0, 10);
    totalComprobantes += cantidad;

    if (r.medio_pago === 'efectivo') totalEfectivo += total;
    else if (r.medio_pago === 'tarjeta') totalTarjeta += total;
    else if (r.medio_pago === 'transferencia' || r.medio_pago === 'billetera') totalTransferencia += total;
    else if (r.medio_pago === 'cuenta_corriente') totalFiado += total;
  });

  const montoInicial = parseFloat(datosTurno.montoInicial || 0);
  const totalIngresos = parseFloat(datosTurno.totalIngresos || 0);
  const totalEgresos = parseFloat(datosTurno.totalEgresos || 0);

  const totalGeneral = totalEfectivo + totalTarjeta + totalTransferencia + totalFiado;
  const efectivoEsperado = montoInicial + totalEfectivo + totalIngresos - totalEgresos;

  const montoContado = parseFloat(montoEnCaja || 0);
  const hayMontoIngresado = montoEnCaja.trim() !== '';
  const diferencia = hayMontoIngresado ? montoContado - efectivoEsperado : 0;

  // Manejo de confirmación de cierre
  const ejecutarCierre = async () => {
    if (guardando || cierreExitoso || modalMovimientoAbierto) return;
    setGuardando(true);
    setMensajeError(null);

    try {
      const usuarioActual = await window.api.usuarios.obtenerActual().catch(() => ({ id: 1 }));
      const usuarioId = usuarioActual?.id || 1;

      const datosCierre = {
        usuarioId,
        totalEfectivo,
        totalTarjeta,
        totalTransferencia,
        totalFiado,
        montoEnCaja: montoContado,
        diferencia,
        montoInicial,
        totalIngresos,
        totalEgresos,
        notas: notas.trim() || null,
        periodoDesde: datosTurno.desde || '2000-01-01 00:00:00',
      };

      const res = await window.api.caja.cerrar(datosCierre);
      if (!res || !res.exito) {
        setMensajeError(res?.error || 'No se pudo guardar el cierre de caja en la base de datos');
        setGuardando(false);
        return;
      }

      // Enviar comprobante térmico a la ticketera
      const fechaActualTexto = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      await window.api.hardware.imprimirTicket({
        tipo: 'cierre_caja',
        nombreNegocio: 'EL RINCON DEL GATO',
        fecha: fechaActualTexto,
        numeroCierre: res.id,
        periodoDesde: formatearFechaHora(datosTurno.desde),
        periodoHasta: fechaActualTexto,
        totalEfectivo,
        totalTarjeta,
        totalTransferencia,
        totalFiado,
        totalGeneral,
        montoInicial,
        totalIngresos,
        totalEgresos,
        efectivoEsperado,
        montoEnCaja: montoContado,
        diferencia,
        notas: notas.trim() || null,
      }).catch(err => {
        console.warn('[SeccionCaja] Advertencia al imprimir cierre:', err);
      });

      setCierreExitoso({
        id: res.id,
        diferencia,
        totalGeneral,
      });
    } catch (err) {
      console.error('[SeccionCaja] Error al ejecutar cierre:', err);
      setMensajeError('Error inesperado durante el cierre de caja');
    } finally {
      setGuardando(false);
    }
  };

  // Atajos de teclado
  useEffect(() => {
    const manejarKeyDown = (e) => {
      if (modalMovimientoAbierto) return;

      if (cierreExitoso) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          irASeccion(SECCIONES.VENTAS);
        }
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        setModalMovimientoAbierto(true);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        irASeccion(SECCIONES.VENTAS);
        return;
      }

      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        ejecutarCierre();
      }
    };

    window.addEventListener('keydown', manejarKeyDown);
    return () => window.removeEventListener('keydown', manejarKeyDown);
  }, [cierreExitoso, ejecutarCierre, irASeccion, modalMovimientoAbierto]);

  if (cargando) {
    return (
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primario-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Calculando movimientos del turno actual...</p>
        </div>
      </div>
    );
  }

  if (cierreExitoso) {
    return (
      <div className="flex-1 bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl">
          <div className="w-16 h-16 bg-exito/20 border-2 border-exito text-exito rounded-full flex items-center justify-center mx-auto mb-5 font-black text-2xl">
            OK
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Cierre de Caja Registrado</h2>
          <p className="text-gray-400 text-sm mb-6">
            Comprobante N° {String(cierreExitoso.id).padStart(6, '0')} impreso y almacenado correctamente en el sistema.
          </p>

          <div className="bg-gray-900/80 rounded-xl p-4 border border-gray-700/60 mb-6 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total facturado en el turno:</span>
              <span className="text-white font-bold">{formatearPrecio(cierreExitoso.totalGeneral)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Resultado del arqueo:</span>
              <span className={`font-bold ${Math.abs(cierreExitoso.diferencia) < 0.01 ? 'text-gray-300' : cierreExitoso.diferencia > 0 ? 'text-exito' : 'text-peligro'}`}>
                {Math.abs(cierreExitoso.diferencia) < 0.01
                  ? 'Caja exacta'
                  : cierreExitoso.diferencia > 0
                    ? `Sobrante de ${formatearPrecio(cierreExitoso.diferencia)}`
                    : `Faltante de ${formatearPrecio(Math.abs(cierreExitoso.diferencia))}`
                }
              </span>
            </div>
          </div>

          <button
            onClick={() => irASeccion(SECCIONES.VENTAS)}
            className="w-full bg-primario-600 hover:bg-primario-500 text-white py-3 rounded-xl font-bold transition-colors"
          >
            Presione Enter para volver a Ventas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-900 flex flex-col overflow-hidden">
      {/* ENCABEZADO */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">Cierre de Turno y Arqueo de Caja</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Período actual desde: <span className="text-gray-200 font-medium">{formatearFechaHora(datosTurno.desde)}</span> hasta este momento
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setModalMovimientoAbierto(true)}
            className="bg-primario-700 hover:bg-primario-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <kbd className="bg-primario-900 px-2 py-0.5 rounded text-white text-xs">F8</kbd>
            Ingreso o Egreso
          </button>
          <button
            type="button"
            onClick={() => irASeccion(SECCIONES.VENTAS)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <kbd className="bg-gray-800 px-2 py-0.5 rounded text-gray-400 mr-1.5 border border-gray-600">ESC</kbd>
            Volver a Ventas
          </button>
        </div>
      </div>

      {mensajeError && (
        <div className="mx-6 mt-4 p-3 bg-peligro/10 border border-peligro/30 rounded-xl text-peligro text-sm font-medium shrink-0">
          {mensajeError}
        </div>
      )}

      {mensajeExito && (
        <div className="mx-6 mt-4 p-3 bg-exito/10 border border-exito/30 rounded-xl text-exito text-sm font-medium shrink-0">
          {mensajeExito}
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TARJETAS DE TOTALES DEL SISTEMA (Sin textos secundarios debajo de los montos) */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Movimientos Registrados por el Sistema en este Turno
          </h3>
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <span className="text-xs text-gray-400 uppercase font-medium block">Efectivo</span>
              <span className="text-2xl font-black text-white mt-1 block">{formatearPrecio(totalEfectivo)}</span>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <span className="text-xs text-gray-400 uppercase font-medium block">Tarjeta</span>
              <span className="text-2xl font-black text-white mt-1 block">{formatearPrecio(totalTarjeta)}</span>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <span className="text-xs text-gray-400 uppercase font-medium block">Transferencia</span>
              <span className="text-2xl font-black text-white mt-1 block">{formatearPrecio(totalTransferencia)}</span>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <span className="text-xs text-gray-400 uppercase font-medium block">Cuenta Corriente</span>
              <span className="text-2xl font-black text-white mt-1 block">{formatearPrecio(totalFiado)}</span>
            </div>

            <div className="bg-primario-900/40 border border-primario-500/50 rounded-xl p-4">
              <span className="text-xs text-primario-300 uppercase font-bold block">Total Facturado</span>
              <span className="text-2xl font-black text-primario-300 mt-1 block">{formatearPrecio(totalGeneral)}</span>
            </div>
          </div>
        </div>

        {/* DESGLOSE DE FLUJO DE CAJA CHICA */}
        <div className="bg-gray-800/90 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <span className="text-xs text-gray-400 block font-bold uppercase">Apertura Inicial</span>
                <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(montoInicial)}</span>
              </div>
              <span className="text-gray-500 font-bold text-lg">+</span>
              <div>
                <span className="text-xs text-gray-400 block font-bold uppercase">Ventas Efectivo</span>
                <span className="text-xl font-black text-white mt-0.5 block">{formatearPrecio(totalEfectivo)}</span>
              </div>
              <span className="text-gray-500 font-bold text-lg">+</span>
              <div>
                <span className="text-xs text-gray-400 block font-bold uppercase">Ingresos Manuales</span>
                <span className="text-xl font-black text-exito mt-0.5 block">+{formatearPrecio(totalIngresos)}</span>
              </div>
              <span className="text-gray-500 font-bold text-lg">-</span>
              <div>
                <span className="text-xs text-gray-400 block font-bold uppercase">Egresos o Retiros</span>
                <span className="text-xl font-black text-peligro mt-0.5 block">-{formatearPrecio(totalEgresos)}</span>
              </div>
            </div>

            <div className="text-right border-l border-gray-700 pl-6">
              <span className="text-xs text-primario-400 block font-bold uppercase">Efectivo Esperado en Gaveta</span>
              <span className="text-3xl font-black text-primario-300 mt-0.5 block">{formatearPrecio(efectivoEsperado)}</span>
            </div>
          </div>
        </div>

        {/* ARQUEO DE EFECTIVO FISICO */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Arqueo de Efectivo Físico</h3>
              <p className="text-sm text-gray-400 mb-5">
                Cuente los billetes y monedas presentes en la gaveta e ingrese el total exacto.
              </p>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                Monto Físico Contado en Caja
              </label>
              <div className="relative mb-5">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">$</span>
                <input
                  ref={inputMontoRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoEnCaja}
                  onChange={(e) => setMontoEnCaja(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      textareaNotasRef.current?.focus();
                    }
                  }}
                  placeholder="0.00"
                  className="w-full bg-gray-900 border-2 border-primario-500 rounded-xl pl-10 pr-4 py-3 text-3xl font-black text-white focus:outline-none focus:ring-2 focus:ring-primario-400"
                />
              </div>

              {/* BALANCE Y DIFERENCIA */}
              <div className={`p-4 rounded-xl border transition-colors ${!hayMontoIngresado
                ? 'bg-gray-900/50 border-gray-700 text-gray-400'
                : Math.abs(diferencia) < 0.01
                  ? 'bg-exito/10 border-exito/40 text-exito'
                  : diferencia > 0
                    ? 'bg-exito/10 border-exito/40 text-exito'
                    : 'bg-peligro/10 border-peligro/40 text-peligro'
                }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    {!hayMontoIngresado
                      ? 'Ingrese el monto para calcular la diferencia contra el efectivo esperado'
                      : Math.abs(diferencia) < 0.01
                        ? 'Caja exacta sin diferencias'
                        : diferencia > 0
                          ? 'Sobrante de caja a favor'
                          : 'Faltante de caja'
                    }
                  </span>
                  <span className="text-2xl font-black">
                    {hayMontoIngresado ? (diferencia > 0 ? '+ ' : '') + formatearPrecio(diferencia) : '$ 0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Observaciones del Turno</h3>
              <p className="text-sm text-gray-400 mb-5">
                Opcional: detalle retiros de dinero, gastos menores o motivos de cualquier diferencia detectada.
              </p>

              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
                Notas del Cierre
              </label>
              <textarea
                ref={textareaNotasRef}
                rows={4}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Escriba aquí cualquier aclaración relevante para este turno..."
                className="w-full bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm text-white focus:border-primario-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 pt-6 border-t border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Al confirmar se imprimirá el ticket de cierre de turno.
              </span>
              <button
                type="button"
                disabled={guardando}
                onClick={ejecutarCierre}
                className="bg-primario-600 hover:bg-primario-500 text-white px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <kbd className="bg-primario-800 px-2 py-0.5 rounded text-white text-xs">Enter</kbd>
                {guardando ? 'Guardando...' : 'Confirmar y Cerrar Turno'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL INGRESO Y EGRESO DE EFECTIVO */}
      {modalMovimientoAbierto && (
        <ModalMovimientoCaja
          alConfirmar={({ tipo, monto }) => {
            setModalMovimientoAbierto(false);
            setMensajeExito(`Movimiento de ${tipo === 'egreso' ? 'egreso' : 'ingreso'} por ${formatearPrecio(monto)} registrado con éxito`);
            cargarResumenTurno();
          }}
          alCerrar={() => setModalMovimientoAbierto(false)}
        />
      )}
    </div>
  );
}
