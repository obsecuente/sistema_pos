// ============================================================================
// useAtajosTeclado — Hook global de atajos de teclado para el POS
//
// Mapeo completo:
//   F1:  Nueva venta (pestaña paralela) / Ir a Ventas
//   F2:  Cuentas Corrientes
//   F3:  Productos (Catálogo y ABM)
//   F4:  Caja y Arqueo de Turno
//   F5:  Reportes y Auditoría
//   F6:  Cobrar venta (en Ventas) / Registrar pago (en Cuentas)
//   F7:  Anular venta completa (en Ventas)
//   F8:  Ingreso / Egreso de efectivo (Caja Chica)
//   Esc: Cancelar / Cerrar modal
//
// NOTA: Este hook se registra DESPUÉS del hook del lector de código de barras
// en el DOM (bubbling), así el escáner tiene prioridad en fase de captura.
// ============================================================================

import { useEffect, useCallback } from 'react';
import useTiendaApp, { SECCIONES } from '../store/useTiendaApp';
import useTiendaVentas from '../store/useTiendaVentas';

/**
 * Hook que registra todos los atajos globales de teclado.
 * Debe montarse UNA sola vez en el componente App.
 */
export function useAtajosTeclado() {
  const irASeccion  = useTiendaApp((s) => s.irASeccion);
  const abrirModal  = useTiendaApp((s) => s.abrirModal);
  const cerrarModal = useTiendaApp((s) => s.cerrarModal);
  const modalActivo = useTiendaApp((s) => s.modalActivo);

  const agregarPestana = useTiendaVentas((s) => s.agregarPestana);

  const manejarAtajo = useCallback((evento) => {
    // Si hay un modal abierto, no procesamos atajos globales para no pisar las funciones del modal (ej: F2 para nuevo cliente)
    if (document.querySelector('.animacion-modal') && evento.key !== 'Escape') {
      return;
    }

    // No interceptar si el foco está en un input de texto (excepto Esc y F-keys)
    const enInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

    switch (evento.key) {
      // ─── F1: Nueva pestaña de venta / Ir a Ventas ──────────────
      case 'F1':
        evento.preventDefault();
        const estadoApp = useTiendaApp.getState();
        if (estadoApp.seccionActiva === SECCIONES.VENTAS) {
          agregarPestana();
        } else {
          irASeccion(SECCIONES.VENTAS);
        }
        break;

      // ─── F2: Cuentas Corrientes ─────────────────────────────────
      case 'F2':
        evento.preventDefault();
        irASeccion(SECCIONES.CUENTAS_CORRIENTES);
        break;

      // ─── F3: Productos (Catálogo y ABM) ─────────────────────────
      case 'F3':
        evento.preventDefault();
        irASeccion(SECCIONES.PRODUCTOS);
        break;

      // ─── F4: Caja y Arqueo ──────────────────────────────────────
      case 'F4':
        evento.preventDefault();
        irASeccion(SECCIONES.CIERRE_CAJA);
        break;

      // ─── F5: Reportes y Auditoría ───────────────────────────────
      case 'F5':
        evento.preventDefault();
        irASeccion(SECCIONES.REPORTES);
        break;

      // ─── Esc: Cancelar / Cerrar modal ───────────────────────────
      case 'Escape':
        evento.preventDefault();
        if (modalActivo) {
          cerrarModal();
        }
        break;

      default:
        break;
    }
  }, [irASeccion, abrirModal, cerrarModal, modalActivo, agregarPestana]);

  useEffect(() => {
    // Registrar en bubbling (no captura) para que el escáner tenga prioridad
    document.addEventListener('keydown', manejarAtajo, false);

    return () => {
      document.removeEventListener('keydown', manejarAtajo, false);
    };
  }, [manejarAtajo]);
}

/**
 * Reimprime el último ticket de venta.
 */
async function reimprimirUltimoTicket() {
  try {
    const ultimaVenta = await window.api.ventas.obtenerUltima();
    if (!ultimaVenta) {
      console.warn('[Atajos] No hay ventas para reimprimir');
      return;
    }

    await window.api.hardware.imprimirTicket({
      nombreNegocio: 'EL RINCON DEL GATO',
      fecha:         ultimaVenta.creado_en,
      numeroVenta:   ultimaVenta.id,
      cajero:        ultimaVenta.cajero,
      items: ultimaVenta.items.map(i => ({
        nombre:   i.nombre_producto,
        cantidad: i.cantidad,
        precio:   i.precio_unitario_snapshot,
        subtotal: i.subtotal,
      })),
      subtotal:   parseFloat(ultimaVenta.subtotal),
      recargo:    parseFloat(ultimaVenta.total) - parseFloat(ultimaVenta.subtotal),
      total:      parseFloat(ultimaVenta.total),
      medioPago:  ultimaVenta.medio_pago,
    });

    console.log('[Atajos] Último ticket reimpreso');
  } catch (error) {
    console.error('[Atajos] Error al reimprimir ticket:', error);
  }
}

export default useAtajosTeclado;
