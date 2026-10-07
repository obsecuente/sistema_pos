// ============================================================================
// CANALES IPC — Fuente única de verdad
// Estos nombres se usan en preload.js (invoke) y manejadoresIpc.js (handle).
// NUNCA hardcodear strings de canales fuera de este archivo.
// ============================================================================

const CANALES = Object.freeze({

  // ─── Productos ───
  PRODUCTO_BUSCAR:            'producto:buscar',
  PRODUCTO_POR_BARRAS:        'producto:por-codigo-barras',
  PRODUCTO_CREAR:             'producto:crear',
  PRODUCTO_ACTUALIZAR:        'producto:actualizar',
  PRODUCTO_ELIMINAR:          'producto:eliminar-logico',
  PRODUCTO_PROXIMOS_VENCER:   'producto:proximos-a-vencer',

  // ─── Ventas ───
  VENTA_CREAR:                'venta:crear',
  VENTA_ANULAR:               'venta:anular',
  VENTA_ULTIMA:               'venta:obtener-ultima',
  VENTAS_OBTENER_HISTORIAL:   'ventas:obtener-historial',
  VENTAS_OBTENER_DETALLE:     'ventas:obtener-detalle',
  VENTAS_PURGAR:              'ventas:purgar',

  // ─── Libro Mayor (Cuentas Corrientes) ───
  LIBRO_OBTENER_SALDO:        'libro:obtener-saldo',
  LIBRO_OBTENER_HISTORIAL:    'libro:obtener-historial',
  LIBRO_AGREGAR_MOVIMIENTO:   'libro:agregar-movimiento',

  // ─── Clientes ───
  CLIENTE_BUSCAR:             'cliente:buscar',
  CLIENTE_CREAR:              'cliente:crear',
  CLIENTE_ACTUALIZAR:         'cliente:actualizar',
  CLIENTE_ELIMINAR:           'cliente:eliminar-logico',

  // ─── Caja ───
  CAJA_CERRAR:                'caja:cerrar',
  CAJA_ULTIMO_CIERRE:         'caja:ultimo-cierre',
  CAJA_RESUMEN_TURNO:         'caja:resumen-turno',
  CAJA_OBTENER_HISTORIAL:     'caja:obtener-historial',
  CAJA_ESTADO_TURNO:          'caja:estado-turno',
  CAJA_ABRIR_TURNO:           'caja:abrir-turno',
  CAJA_REGISTRAR_MOVIMIENTO:  'caja:registrar-movimiento',
  CAJA_OBTENER_MOVIMIENTOS:   'caja:obtener-movimientos',

  // ─── Reportes ───
  REPORTES_CARTERA_CUENTAS:   'reportes:cartera-cuentas',

  // ─── Hardware ───
  HARDWARE_IMPRIMIR_TICKET:   'hardware:imprimir-ticket',
  HARDWARE_IMPRIMIR_ETIQUETA: 'hardware:imprimir-etiqueta',
  HARDWARE_ESTADO_IMPRESORA:  'hardware:estado-impresora',

  // ─── Sistema / Energía ───
  ENERGIA_CAMBIO_ESTADO:      'energia:cambio-estado',
  ESTADO_PERSISTIR:           'estado:persistir',
  ESTADO_RECUPERAR:           'estado:recuperar',
  SISTEMA_ULTIMO_BACKUP:      'sistema:ultimo-backup',

  // ─── Usuarios / Autenticación ───
  USUARIO_VERIFICAR_PIN:      'usuario:verificar-pin',
  USUARIO_OBTENER_ACTUAL:     'usuario:obtener-actual',
});

// Lista blanca de canales permitidos (para validación en preload)
const CANALES_PERMITIDOS = Object.freeze(Object.values(CANALES));

module.exports = { CANALES, CANALES_PERMITIDOS };
