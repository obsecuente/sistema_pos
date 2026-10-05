// ============================================================================
// useAtajosTeclado — Hook global de atajos de teclado para el POS
//
// Mapeo completo:
//   F1:  Nueva venta (pestaña paralela) / Ir a Ventas
//   F2:  Cuentas Corrientes
//   F3:  Cobrar / Cerrar venta (manejado en ContenidoVenta)
//   F4:  Buscar / ABM productos
//   F5:  Anular venta completa (manejado en ContenidoVenta)
//   F6:  Reimprimir etiquetas de góndola (pendiente)
//   F7:  Pago rápido de cuenta corriente
//   F8:  (Disponible)
//   F9:  Cierre de caja
//   F10: Reportes rápidos
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
      // ─── F1: Nueva pestaña de venta ─────────────────────────────
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

      // ─── F4: Buscar / ABM Productos ─────────────────────────────
      case 'F4':
        evento.preventDefault();
        irASeccion(SECCIONES.PRODUCTOS);
        break;

      // ─── F6: Reimprimir etiquetas ───────────────────────────────
      case 'F6':
        evento.preventDefault();
        // Futuro: modal de selección de productos para etiquetas
        console.log('[Atajos] F6: Reimprimir etiquetas (pendiente)');
        break;

      // ─── F7: Pago rápido de cuenta corriente ────────────────────
      case 'F7':
        evento.preventDefault();
        abrirModal('pago-rapido-cc');
        break;

      // ─── F9: Cierre de caja ─────────────────────────────────────
      case 'F9':
        evento.preventDefault();
        irASeccion(SECCIONES.CIERRE_CAJA);
        break;

      // ─── F10: Reportes ──────────────────────────────────────────
      case 'F10':
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
