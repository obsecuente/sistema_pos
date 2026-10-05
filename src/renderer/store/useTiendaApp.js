// ============================================================================
// useTiendaApp — Store Zustand para estado global de la UI
//
// Maneja:
//   • Pestaña/sección activa de la app (ventas, cuentas, productos, etc.)
//   • Modales abiertos (pago, PIN, confirmación)
//   • Usuario logueado actual
//   • Estado de conexión de hardware
// ============================================================================

import { create } from 'zustand';

/**
 * Secciones principales de la aplicación.
 * Cada una se mapea a un atajo de teclado (F1-F10).
 */
const SECCIONES = {
  VENTAS:             'ventas',
  CUENTAS_CORRIENTES: 'cuentas-corrientes',
  PRODUCTOS:          'productos',
  CIERRE_CAJA:        'cierre-caja',
  REPORTES:           'reportes',
};

const useTiendaApp = create((set, get) => ({
  // ─── Estado de la UI ────────────────────────────────────────────────
  seccionActiva: SECCIONES.VENTAS,

  // ─── Modales ────────────────────────────────────────────────────────
  modalActivo:     null,     // 'pago' | 'pin' | 'confirmar-anular' | 'buscar-producto' | null
  datosModal:      null,     // Datos extra para el modal (ej: item a anular)

  // ─── Usuario ────────────────────────────────────────────────────────
  usuarioActual:   null,     // { id, nombreUsuario, rol }

  // ─── Hardware ───────────────────────────────────────────────────────
  estadoImpresora: 'desconocido',  // 'conectado' | 'desconectado' | 'sin-configurar' | 'error'
  estadoEnergia:   'en-red',       // 'en-red' | 'en-bateria' | 'apagando' | 'suspendido'

  // ─── Acciones de navegación ─────────────────────────────────────────

  /** Cambiar la sección activa de la app */
  irASeccion: (seccion) => {
    set({ seccionActiva: seccion });
  },

  // ─── Acciones de modales ────────────────────────────────────────────

  /** Abrir un modal */
  abrirModal: (nombre, datos = null) => {
    set({ modalActivo: nombre, datosModal: datos });
  },

  /** Cerrar el modal activo */
  cerrarModal: () => {
    set({ modalActivo: null, datosModal: null });
  },

  // ─── Acciones de usuario ────────────────────────────────────────────

  /** Setear el usuario actual (al ingresar PIN) */
  setUsuario: (usuario) => {
    set({ usuarioActual: usuario });
  },

  /** Cerrar sesión */
  cerrarSesion: () => {
    set({ usuarioActual: null });
  },

  // ─── Acciones de hardware ───────────────────────────────────────────

  setEstadoImpresora: (estado) => {
    set({ estadoImpresora: estado });
  },

  setEstadoEnergia: (estado) => {
    set({ estadoEnergia: estado });
  },
}));

export { SECCIONES };
export default useTiendaApp;
