// ============================================================================
// PRELOAD — Puente seguro entre renderer y main process
//
// contextIsolation: true | nodeIntegration: false | sandbox: true
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// Hardcoded for sandbox compatibility
const CANALES = Object.freeze({
  PRODUCTO_BUSCAR:            'producto:buscar',
  PRODUCTO_POR_BARRAS:        'producto:por-codigo-barras',
  PRODUCTO_CREAR:             'producto:crear',
  PRODUCTO_ACTUALIZAR:        'producto:actualizar',
  PRODUCTO_ELIMINAR:          'producto:eliminar-logico',
  PRODUCTO_PROXIMOS_VENCER:   'producto:proximos-a-vencer',
  VENTA_CREAR:                'venta:crear',
  VENTA_ANULAR:               'venta:anular',
  VENTA_ULTIMA:               'venta:obtener-ultima',
  LIBRO_OBTENER_SALDO:        'libro:obtener-saldo',
  LIBRO_OBTENER_HISTORIAL:    'libro:obtener-historial',
  LIBRO_AGREGAR_MOVIMIENTO:   'libro:agregar-movimiento',
  CLIENTE_BUSCAR:             'cliente:buscar',
  CLIENTE_CREAR:              'cliente:crear',
  CLIENTE_ACTUALIZAR:         'cliente:actualizar',
  CLIENTE_ELIMINAR:           'cliente:eliminar-logico',
  CAJA_CERRAR:                'caja:cerrar',
  CAJA_ULTIMO_CIERRE:         'caja:ultimo-cierre',
  CAJA_RESUMEN_TURNO:         'caja:resumen-turno',
  HARDWARE_IMPRIMIR_TICKET:   'hardware:imprimir-ticket',
  HARDWARE_IMPRIMIR_ETIQUETA: 'hardware:imprimir-etiqueta',
  HARDWARE_ESTADO_IMPRESORA:  'hardware:estado-impresora',
  ENERGIA_CAMBIO_ESTADO:      'energia:cambio-estado',
  ESTADO_PERSISTIR:           'estado:persistir',
  ESTADO_RECUPERAR:           'estado:recuperar',
  SISTEMA_ULTIMO_BACKUP:      'sistema:ultimo-backup',
  USUARIO_VERIFICAR_PIN:      'usuario:verificar-pin',
  USUARIO_OBTENER_ACTUAL:     'usuario:obtener-actual',
});
const CANALES_PERMITIDOS = Object.values(CANALES);

function invocarSeguro(canal, ...args) {
  if (!CANALES_PERMITIDOS.includes(canal)) {
    return Promise.reject(new Error(`[Preload] Canal IPC no permitido: ${canal}`));
  }
  return ipcRenderer.invoke(canal, ...args);
}

contextBridge.exposeInMainWorld('api', {
  productos: {
    buscar: (texto, pagina = 1, limite = 50, filtroCondicional = 'todos') => invocarSeguro(CANALES.PRODUCTO_BUSCAR, { texto, pagina, limite, filtroCondicional }),
    porCodigoBarras: (codigoBarras) => invocarSeguro(CANALES.PRODUCTO_POR_BARRAS, { codigoBarras }),
    crear: (producto) => invocarSeguro(CANALES.PRODUCTO_CREAR, producto),
    actualizar: (id, cambios) => invocarSeguro(CANALES.PRODUCTO_ACTUALIZAR, { id, ...cambios }),
    eliminar: (id) => invocarSeguro(CANALES.PRODUCTO_ELIMINAR, { id }),
    proximosAVencer: (diasAnticipacion = 10) => invocarSeguro(CANALES.PRODUCTO_PROXIMOS_VENCER, { diasAnticipacion }),
  },
  ventas: {
    crear: (datosVenta) => invocarSeguro(CANALES.VENTA_CREAR, datosVenta),
    anular: (ventaId, motivo, pinDuena) => invocarSeguro(CANALES.VENTA_ANULAR, { ventaId, motivo, pinDuena }),
    obtenerUltima: () => invocarSeguro(CANALES.VENTA_ULTIMA),
  },
  libro: {
    obtenerSaldo: (cuentaId) => invocarSeguro(CANALES.LIBRO_OBTENER_SALDO, { cuentaId }),
    obtenerHistorial: (cuentaId, pagina = 1, limite = 20) => invocarSeguro(CANALES.LIBRO_OBTENER_HISTORIAL, { cuentaId, pagina, limite }),
    agregarMovimiento: (movimiento) => invocarSeguro(CANALES.LIBRO_AGREGAR_MOVIMIENTO, movimiento),
  },
  clientes: {
    buscar: (texto, pagina = 1, limite = 50, orden = 'nombre') => invocarSeguro(CANALES.CLIENTE_BUSCAR, { texto, pagina, limite, orden }),
    crear: (cliente) => invocarSeguro(CANALES.CLIENTE_CREAR, cliente),
    actualizar: (id, cambios) => invocarSeguro(CANALES.CLIENTE_ACTUALIZAR, { id, ...cambios }),
    eliminar: (id) => invocarSeguro(CANALES.CLIENTE_ELIMINAR, { id }),
  },
  caja: {
    cerrar: (datosCierre) => invocarSeguro(CANALES.CAJA_CERRAR, datosCierre),
    ultimoCierre: () => invocarSeguro(CANALES.CAJA_ULTIMO_CIERRE),
    resumenTurno: () => invocarSeguro(CANALES.CAJA_RESUMEN_TURNO),
  },
  hardware: {
    imprimirTicket: (datosTicket) => invocarSeguro(CANALES.HARDWARE_IMPRIMIR_TICKET, datosTicket),
    imprimirEtiqueta: (datosEtiqueta) => invocarSeguro(CANALES.HARDWARE_IMPRIMIR_ETIQUETA, datosEtiqueta),
    estadoImpresora: () => invocarSeguro(CANALES.HARDWARE_ESTADO_IMPRESORA),
  },
  usuarios: {
    verificarPin: (pin) => invocarSeguro(CANALES.USUARIO_VERIFICAR_PIN, { pin }),
    obtenerActual: () => invocarSeguro(CANALES.USUARIO_OBTENER_ACTUAL),
  },
  sistema: {
    persistirEstado: (datos) => invocarSeguro(CANALES.ESTADO_PERSISTIR, datos),
    recuperarEstado: () => invocarSeguro(CANALES.ESTADO_RECUPERAR),
    obtenerUltimoBackup: () => invocarSeguro(CANALES.SISTEMA_ULTIMO_BACKUP),
  },
  alCambiarEnergia: (callback) => {
    const manejador = (_evento, estado) => callback(estado);
    ipcRenderer.on(CANALES.ENERGIA_CAMBIO_ESTADO, manejador);
    return () => { ipcRenderer.removeListener(CANALES.ENERGIA_CAMBIO_ESTADO, manejador); };
  },
});
