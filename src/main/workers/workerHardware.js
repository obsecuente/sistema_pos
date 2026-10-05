// ============================================================================
// WORKER DE HARDWARE — Proceso utilitario para comunicación con periféricos
//
// Este worker corre en un utilityProcess / child_process separado para NO
// bloquear el hilo principal de Electron ni el renderizado de React.
//
// Responsabilidades:
//   1. Conexión TCP directa a la ticketera Epson TM-T20III (puerto 9100)
//   2. Generación binaria de comandos ESC/POS
//   3. Cola de impresión serializada
//   4. Reconexión automática con backoff exponencial
//
// Comunicación: recibe mensajes via process.on('message') y responde
// con process.send() (o MessageChannelMain desde el main process).
// ============================================================================

const net = require('net');

// ─── Configuración ─────────────────────────────────────────────────────
const IP_TICKETERA    = process.env.TICKETERA_IP     || '';
const PUERTO_TICKETERA = parseInt(process.env.TICKETERA_PUERTO || '9100', 10);
const TIMEOUT_CONEXION = 5000;   // ms
const MAX_REINTENTOS   = 10;
const BACKOFF_BASE     = 1000;   // ms

// ─── Estado del worker ─────────────────────────────────────────────────
/** @type {net.Socket|null} */
let socket = null;
let conectado = false;
let intentoActual = 0;
let colaImpresion = [];
let procesandoCola = false;


// ============================================================================
// COMANDOS ESC/POS (buffers binarios)
// ============================================================================
const ESC = 0x1B;
const GS  = 0x1D;

const ESCPOS = {
  /** Inicializar impresora */
  INICIALIZAR:      Buffer.from([ESC, 0x40]),

  /** Alinear al centro */
  ALINEAR_CENTRO:   Buffer.from([ESC, 0x61, 0x01]),

  /** Alinear a la izquierda */
  ALINEAR_IZQUIERDA: Buffer.from([ESC, 0x61, 0x00]),

  /** Alinear a la derecha */
  ALINEAR_DERECHA:  Buffer.from([ESC, 0x61, 0x02]),

  /** Negrita ON */
  NEGRITA_ON:       Buffer.from([ESC, 0x45, 0x01]),

  /** Negrita OFF */
  NEGRITA_OFF:      Buffer.from([ESC, 0x45, 0x00]),

  /** Texto tamaño doble alto + ancho */
  TAMANO_DOBLE:     Buffer.from([GS, 0x21, 0x11]),

  /** Texto tamaño normal */
  TAMANO_NORMAL:    Buffer.from([GS, 0x21, 0x00]),

  /** Imprimir logo almacenado en memoria NV (posición 0) */
  LOGO_NV:          Buffer.from([GS, 0x2F, 0x00]),

  /** Avanzar N líneas */
  avanzarLineas: (n = 3) => Buffer.from([ESC, 0x64, n]),

  /** Corte parcial de papel (deja pestaña) */
  CORTE_PARCIAL:    Buffer.from([GS, 0x56, 0x42, 0x03]),

  /** Corte total de papel */
  CORTE_TOTAL:      Buffer.from([GS, 0x56, 0x00]),

  /** Abrir cajón de dinero (si está conectado al puerto) */
  ABRIR_CAJON:      Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),

  /** Texto a buffer con codificación para español (cp858 / latin1) */
  texto: (cadena) => Buffer.from(cadena, 'latin1'),

  /** Separador de línea */
  SEPARADOR:        Buffer.from('------------------------------------------------\n', 'latin1'),
};


// ============================================================================
// CONEXIÓN TCP A LA TICKETERA
// ============================================================================

/**
 * Conecta al socket TCP de la ticketera.
 * Si no hay IP configurada, no intenta conectar (modo sin impresora).
 */
function conectar() {
  if (!IP_TICKETERA) {
    console.log('[Hardware] No hay IP de ticketera configurada (TICKETERA_IP). Modo sin impresora.');
    enviarEstado('sin-configurar');
    return;
  }

  socket = new net.Socket();
  socket.setTimeout(TIMEOUT_CONEXION);

  socket.connect(PUERTO_TICKETERA, IP_TICKETERA, () => {
    conectado = true;
    intentoActual = 0;
    console.log(`[Hardware] Conectado a ticketera ${IP_TICKETERA}:${PUERTO_TICKETERA}`);
    enviarEstado('conectado');
    procesarCola();
  });

  socket.on('error', (error) => {
    console.error(`[Hardware] Error de socket: ${error.message}`);
    conectado = false;
    enviarEstado('error');
    reconectar();
  });

  socket.on('close', () => {
    conectado = false;
    console.log('[Hardware] Socket cerrado');
    enviarEstado('desconectado');
    reconectar();
  });

  socket.on('timeout', () => {
    console.warn('[Hardware] Timeout de conexión');
    socket.destroy();
  });
}

/**
 * Reconectar con backoff exponencial.
 */
function reconectar() {
  if (intentoActual >= MAX_REINTENTOS) {
    console.error(`[Hardware] Máximo de reintentos (${MAX_REINTENTOS}) alcanzado. Deteniendo reconexión.`);
    enviarEstado('fallo-permanente');
    return;
  }

  const espera = BACKOFF_BASE * Math.pow(2, intentoActual);
  intentoActual++;
  console.log(`[Hardware] Reintentando conexión en ${espera}ms (intento ${intentoActual}/${MAX_REINTENTOS})`);

  setTimeout(() => {
    conectar();
  }, espera);
}


// ============================================================================
// COLA DE IMPRESIÓN
// ============================================================================

/**
 * Agrega un buffer a la cola de impresión.
 * @param {Buffer} buffer - Datos ESC/POS a enviar
 * @param {string} [descripcion] - Descripción para logging
 * @returns {Promise<{exito: boolean, error?: string}>}
 */
function agregarACola(buffer, descripcion = 'ticket') {
  return new Promise((resolver) => {
    colaImpresion.push({ buffer, descripcion, resolver });
    procesarCola();
  });
}

/**
 * Procesa la cola de impresión de forma serial (uno por uno).
 */
async function procesarCola() {
  if (procesandoCola || colaImpresion.length === 0) return;
  if (!conectado || !socket) {
    // Resolver todos los pendientes como error si no hay conexión
    if (!IP_TICKETERA) {
      while (colaImpresion.length > 0) {
        const tarea = colaImpresion.shift();
        tarea.resolver({ exito: false, error: 'Ticketera no configurada' });
      }
    }
    return;
  }

  procesandoCola = true;

  while (colaImpresion.length > 0) {
    const tarea = colaImpresion.shift();
    try {
      await enviarBuffer(tarea.buffer);
      console.log(`[Hardware] Impreso: ${tarea.descripcion}`);
      tarea.resolver({ exito: true });
    } catch (error) {
      console.error(`[Hardware] Error al imprimir ${tarea.descripcion}: ${error.message}`);
      tarea.resolver({ exito: false, error: error.message });
    }
  }

  procesandoCola = false;
}

/**
 * Envía un buffer al socket TCP.
 * @param {Buffer} buffer
 * @returns {Promise<void>}
 */
function enviarBuffer(buffer) {
  return new Promise((resolver, rechazar) => {
    if (!socket || !conectado) {
      rechazar(new Error('Socket no conectado'));
      return;
    }

    socket.write(buffer, (error) => {
      if (error) {
        rechazar(error);
      } else {
        resolver();
      }
    });
  });
}


// ============================================================================
// GENERACIÓN DE TICKETS
// ============================================================================

/**
 * Genera el buffer ESC/POS para un ticket de venta.
 * @param {object} datos
 * @param {string} datos.nombreNegocio
 * @param {string} datos.direccion
 * @param {string} datos.fecha
 * @param {number} datos.numeroVenta
 * @param {string} datos.cajero
 * @param {Array<{nombre: string, cantidad: number, precio: number, subtotal: number}>} datos.items
 * @param {number} datos.subtotal
 * @param {number} datos.recargo
 * @param {number} datos.total
 * @param {string} datos.medioPago
 * @returns {Buffer}
 */
function generarTicketVenta(datos) {
  const partes = [
    ESCPOS.INICIALIZAR,
    ESCPOS.ALINEAR_CENTRO,
    // Intentar imprimir logo NV (si está grabado)
    ESCPOS.LOGO_NV,
    ESCPOS.avanzarLineas(1),
    // Encabezado
    ESCPOS.NEGRITA_ON,
    ESCPOS.TAMANO_DOBLE,
    ESCPOS.texto(`${datos.nombreNegocio || 'EL RINCON DEL GATO'}\n`),
    ESCPOS.TAMANO_NORMAL,
    ESCPOS.NEGRITA_OFF,
    ESCPOS.texto(`${datos.direccion || ''}\n`),
    ESCPOS.texto(`${datos.fecha}\n`),
    ESCPOS.SEPARADOR,

    // Info de venta
    ESCPOS.ALINEAR_IZQUIERDA,
    ESCPOS.texto(`Venta #: ${datos.numeroVenta}\n`),
    ESCPOS.texto(`Cajero:  ${datos.cajero}\n`),
    ESCPOS.SEPARADOR,
  ];

  // Items
  for (const item of datos.items) {
    const lineaCant   = `${item.cantidad} x $${item.precio.toFixed(2)}`;
    const lineaTotal  = `$${item.subtotal.toFixed(2)}`;
    const lineaNombre = item.nombre.substring(0, 30);

    partes.push(ESCPOS.texto(`${lineaNombre}\n`));
    partes.push(ESCPOS.texto(`  ${lineaCant.padEnd(28)}${lineaTotal.padStart(10)}\n`));
  }

  partes.push(ESCPOS.SEPARADOR);

  // Totales
  if (datos.recargo > 0) {
    partes.push(ESCPOS.texto(`  SUBTOTAL:${(' $' + datos.subtotal.toFixed(2)).padStart(27)}\n`));
    partes.push(ESCPOS.texto(`  RECARGO: ${(' $' + datos.recargo.toFixed(2)).padStart(27)}\n`));
  }

  partes.push(ESCPOS.NEGRITA_ON);
  partes.push(ESCPOS.TAMANO_DOBLE);
  partes.push(ESCPOS.texto(`  TOTAL:   ${(' $' + datos.total.toFixed(2)).padStart(17)}\n`));
  partes.push(ESCPOS.TAMANO_NORMAL);
  partes.push(ESCPOS.NEGRITA_OFF);

  partes.push(ESCPOS.SEPARADOR);
  partes.push(ESCPOS.texto(`Pago: ${datos.medioPago}\n`));

  // Pie
  partes.push(ESCPOS.ALINEAR_CENTRO);
  partes.push(ESCPOS.avanzarLineas(1));
  partes.push(ESCPOS.texto('Gracias por su compra!\n'));
  partes.push(ESCPOS.avanzarLineas(3));

  // Corte parcial
  partes.push(ESCPOS.CORTE_PARCIAL);

  return Buffer.concat(partes);
}

/**
 * Genera el buffer ESC/POS para un recibo de pago de cuenta corriente.
 * @param {object} datos
 * @param {string} datos.nombreCliente
 * @param {string} datos.fecha
 * @param {number} datos.montoAbonado
 * @param {number} datos.saldoAnterior
 * @param {number} datos.saldoNuevo
 * @param {string} datos.cajero
 * @returns {Buffer}
 */
function generarReciboPago(datos) {
  const partes = [
    ESCPOS.INICIALIZAR,
    ESCPOS.ALINEAR_CENTRO,
    ESCPOS.NEGRITA_ON,
    ESCPOS.texto('RECIBO DE PAGO\n'),
    ESCPOS.texto('EL RINCON DEL GATO\n'),
    ESCPOS.NEGRITA_OFF,
    ESCPOS.texto(`${datos.fecha}\n`),
    ESCPOS.SEPARADOR,

    ESCPOS.ALINEAR_IZQUIERDA,
    ESCPOS.texto(`Cliente:  ${datos.nombreCliente}\n`),
    ESCPOS.texto(`Cajero:   ${datos.cajero}\n`),
    ESCPOS.SEPARADOR,

    ESCPOS.texto(`Saldo anterior: $${datos.saldoAnterior.toFixed(2)}\n`),
    ESCPOS.NEGRITA_ON,
    ESCPOS.texto(`Monto abonado:  $${datos.montoAbonado.toFixed(2)}\n`),
    ESCPOS.NEGRITA_OFF,
    ESCPOS.texto(`Saldo restante: $${datos.saldoNuevo.toFixed(2)}\n`),
    ESCPOS.SEPARADOR,

    ESCPOS.ALINEAR_CENTRO,
    ESCPOS.avanzarLineas(3),
    ESCPOS.CORTE_PARCIAL,
  ];

  return Buffer.concat(partes);
}


// ============================================================================
// COMUNICACIÓN CON EL PROCESO PRINCIPAL
// ============================================================================

function enviarEstado(estado) {
  if (process.send) {
    process.send({ tipo: 'estado', estado });
  }
}

// Escuchar mensajes del proceso principal
process.on('message', async (mensaje) => {
  switch (mensaje.tipo) {
    case 'imprimir-ticket': {
      const buffer = generarTicketVenta(mensaje.datos);
      const resultado = await agregarACola(buffer, `ticket-venta-${mensaje.datos.numeroVenta}`);
      if (process.send) {
        process.send({ tipo: 'resultado-impresion', id: mensaje.id, ...resultado });
      }
      break;
    }

    case 'imprimir-recibo-pago': {
      const buffer = generarReciboPago(mensaje.datos);
      const resultado = await agregarACola(buffer, `recibo-pago-${mensaje.datos.nombreCliente}`);
      if (process.send) {
        process.send({ tipo: 'resultado-impresion', id: mensaje.id, ...resultado });
      }
      break;
    }

    case 'estado': {
      enviarEstado(conectado ? 'conectado' : (IP_TICKETERA ? 'desconectado' : 'sin-configurar'));
      break;
    }

    case 'reconectar': {
      intentoActual = 0;
      if (socket) socket.destroy();
      conectar();
      break;
    }

    default:
      console.warn(`[Hardware] Mensaje desconocido: ${mensaje.tipo}`);
  }
});


// ============================================================================
// INICIO DEL WORKER
// ============================================================================
console.log('[Hardware] Worker de hardware iniciado');
conectar();
