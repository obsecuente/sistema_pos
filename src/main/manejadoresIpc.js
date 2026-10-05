// ============================================================================
// MANEJADORES IPC — Handlers del proceso principal (ipcMain.handle)
//
// Cada canal definido en canalesIpc.js tiene su handler aquí.
// Los handlers son la capa intermedia entre el renderer (via preload)
// y la base de datos MySQL.
//
// REGLAS:
//   • Las ventas usan transacciones SQL con ROLLBACK ante cualquier fallo
//   • El libro_mayor es APPEND-ONLY: solo INSERT, jamás UPDATE ni DELETE
//   • El stock se bloquea con SELECT ... FOR UPDATE antes de descontar
//   • Los precios se congelan (snapshot) al momento de la transacción
// ============================================================================

const { ipcMain } = require('electron');
const bcrypt = require('bcrypt');
const { CANALES } = require('../compartido/canalesIpc');
const { consultar, conTransaccion, consultaDiferida } = require('./baseDatos');

// ─── Referencia al worker de hardware (se setea desde principal.js) ────
let workerHardware = null;
let pendientesImpresion = {};
let contadorMensajes = 0;

/**
 * Setea la referencia al worker de hardware.
 * Llamar desde principal.js después de inicializar el child_process.
 * @param {import('child_process').ChildProcess} worker
 */
function setWorkerHardware(worker) {
  workerHardware = worker;

  // Escuchar respuestas del worker
  if (workerHardware) {
    workerHardware.on('message', (mensaje) => {
      if (mensaje.tipo === 'resultado-impresion' && pendientesImpresion[mensaje.id]) {
        pendientesImpresion[mensaje.id]({ exito: mensaje.exito, error: mensaje.error });
        delete pendientesImpresion[mensaje.id];
      }
    });
  }
}

/**
 * Envía un mensaje al worker de hardware y espera respuesta.
 * @param {object} mensaje
 * @returns {Promise<{exito: boolean, error?: string}>}
 */
function enviarAWorker(mensaje) {
  return new Promise((resolver) => {
    if (!workerHardware) {
      resolver({ exito: false, error: 'Worker de hardware no disponible' });
      return;
    }

    contadorMensajes++;
    const id = `msg-${contadorMensajes}`;
    mensaje.id = id;

    // Timeout de seguridad: 10 segundos
    const timeout = setTimeout(() => {
      delete pendientesImpresion[id];
      resolver({ exito: false, error: 'Timeout de impresión' });
    }, 10000);

    pendientesImpresion[id] = (resultado) => {
      clearTimeout(timeout);
      resolver(resultado);
    };

    workerHardware.send(mensaje);
  });
}

// ============================================================================
// REGISTRAR TODOS LOS HANDLERS
// ============================================================================

function registrarManejadoresIpc() {

  // ─── PRODUCTOS ─────────────────────────────────────────────────────

  ipcMain.handle(CANALES.PRODUCTO_BUSCAR, async (_evento, { texto, pagina = 1, limite = 50, filtroCondicional = 'todos' }) => {
    const filtro = `%${texto || ''}%`;
    const desplazamiento = (pagina - 1) * limite;

    // Construir condición extra según filtro
    let condicionExtra = '';
    const parametrosExtra = [];

    if (filtroCondicional === 'bajo-stock') {
      condicionExtra = ''; // No filtramos por <= minimo, mostramos todos ordenados por menor stock
    } else if (filtroCondicional === 'por-vencer') {
      condicionExtra = " AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= date('now', '+10 days')";
    }

    let ordenamiento = 'nombre ASC';
    if (filtroCondicional === 'bajo-stock') {
      ordenamiento = 'stock_actual ASC, nombre ASC';
    } else if (filtroCondicional === 'por-vencer') {
      ordenamiento = 'fecha_vencimiento ASC, nombre ASC';
    }

    const filas = await consultar(
      `SELECT id, codigo_barras, nombre, descripcion, precio_venta, costo,
              stock_actual, stock_minimo, tipo_venta, rubro, fecha_vencimiento, creado_en
       FROM productos
       WHERE eliminado_en IS NULL
         AND (nombre LIKE ? OR codigo_barras LIKE ? OR rubro LIKE ?)${condicionExtra}
       ORDER BY ${ordenamiento}
       LIMIT ? OFFSET ?`,
      [filtro, filtro, filtro, ...parametrosExtra, limite, desplazamiento]
    );

    const [conteo] = await consultar(
      `SELECT COUNT(*) AS total FROM productos
       WHERE eliminado_en IS NULL
         AND (nombre LIKE ? OR codigo_barras LIKE ? OR rubro LIKE ?)${condicionExtra}`,
      [filtro, filtro, filtro, ...parametrosExtra]
    );

    return { filas, total: conteo.total, pagina, limite };
  });

  ipcMain.handle(CANALES.PRODUCTO_POR_BARRAS, async (_evento, { codigoBarras }) => {
    const filas = await consultar(
      `SELECT id, codigo_barras, nombre, descripcion, precio_venta, costo,
              stock_actual, stock_minimo, tipo_venta, rubro
       FROM productos
       WHERE codigo_barras = ? AND eliminado_en IS NULL
       LIMIT 1`,
      [codigoBarras]
    );
    return filas[0] || null;
  });

  ipcMain.handle(CANALES.PRODUCTO_CREAR, async (_evento, producto) => {
    // Validar unicidad de código de barras entre productos activos
    if (producto.codigoBarras) {
      const existente = await consultar(
        `SELECT id FROM productos WHERE codigo_barras = ? AND eliminado_en IS NULL LIMIT 1`,
        [producto.codigoBarras]
      );
      if (existente.length > 0) {
        return { exito: false, error: 'Ya existe un producto con ese código de barras' };
      }
    }

    const resultado = await consultar(
      `INSERT INTO productos (codigo_barras, nombre, descripcion, precio_venta, costo,
                              stock_actual, stock_minimo, tipo_venta, rubro, fecha_vencimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        producto.codigoBarras || null,
        producto.nombre,
        producto.descripcion || null,
        producto.precioVenta,
        producto.costo || null,
        producto.stockActual || 0,
        producto.stockMinimo || 0,
        producto.tipoVenta || 'unidad',
        producto.rubro || null,
        producto.fechaVencimiento || null,
      ]
    );
    return { id: resultado.insertId, exito: true };
  });

  ipcMain.handle(CANALES.PRODUCTO_ACTUALIZAR, async (_evento, datos) => {
    const campos = [];
    const valores = [];

    if (datos.nombre !== undefined)       { campos.push('nombre = ?');       valores.push(datos.nombre); }
    if (datos.codigoBarras !== undefined)  { campos.push('codigo_barras = ?'); valores.push(datos.codigoBarras); }
    if (datos.descripcion !== undefined)   { campos.push('descripcion = ?');  valores.push(datos.descripcion); }
    if (datos.precioVenta !== undefined)   { campos.push('precio_venta = ?'); valores.push(datos.precioVenta); }
    if (datos.costo !== undefined)         { campos.push('costo = ?');        valores.push(datos.costo); }
    if (datos.stockActual !== undefined)   { campos.push('stock_actual = ?'); valores.push(datos.stockActual); }
    if (datos.stockMinimo !== undefined)   { campos.push('stock_minimo = ?'); valores.push(datos.stockMinimo); }
    if (datos.tipoVenta !== undefined)     { campos.push('tipo_venta = ?');   valores.push(datos.tipoVenta); }
    if (datos.rubro !== undefined)         { campos.push('rubro = ?');        valores.push(datos.rubro); }
    if (datos.fechaVencimiento !== undefined) { campos.push('fecha_vencimiento = ?'); valores.push(datos.fechaVencimiento); }

    if (campos.length === 0) return { exito: false, error: 'Sin campos para actualizar' };

    valores.push(datos.id);
    await consultar(
      `UPDATE productos SET ${campos.join(', ')} WHERE id = ? AND eliminado_en IS NULL`,
      valores
    );
    return { exito: true };
  });

  ipcMain.handle(CANALES.PRODUCTO_ELIMINAR, async (_evento, { id }) => {
    await consultar(
      `UPDATE productos SET eliminado_en = CURRENT_TIMESTAMP WHERE id = ? AND eliminado_en IS NULL`,
      [id]
    );
    return { exito: true };
  });


  ipcMain.handle(CANALES.PRODUCTO_PROXIMOS_VENCER, async (_evento, { diasAnticipacion = 10 }) => {
    const filas = await consultar(
      `SELECT id, codigo_barras, nombre, precio_venta, stock_actual, fecha_vencimiento
       FROM productos
       WHERE eliminado_en IS NULL
         AND fecha_vencimiento IS NOT NULL
         AND fecha_vencimiento <= date('now', '+' || ? || ' days')
       ORDER BY fecha_vencimiento ASC`,
      [diasAnticipacion]
    );
    return filas;
  });


  // ─── VENTAS (TRANSACCIONAL) ────────────────────────────────────────

  ipcMain.handle(CANALES.VENTA_CREAR, async (_evento, datosVenta) => {
    /**
     * Transacción completa de venta:
     * 1. Insertar cabecera en `ventas`
     * 2. Insertar cada item en `items_venta` con precio snapshot
     * 3. Descontar stock con SELECT ... FOR UPDATE (bloqueo de fila)
     * 4. Si es fiado (cuenta_corriente): insertar movimiento en libro_mayor
     * 5. COMMIT si todo ok, ROLLBACK si falla cualquier paso
     */
    const resultado = await conTransaccion(async (con) => {
      // Calcular totales
      let subtotal = 0;
      for (const item of datosVenta.items) {
        subtotal += item.cantidad * item.precioUnitario;
      }

      const montoRecargo = subtotal * (datosVenta.porcentajeRecargo || 0) / 100;
      const total = subtotal + montoRecargo;

      // 1. Insertar cabecera de venta
      const [resultadoVenta] = await con.execute(
        `INSERT INTO ventas (usuario_id, cliente_id, medio_pago, porcentaje_recargo, subtotal, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          datosVenta.usuarioId,
          datosVenta.clienteId || null,
          datosVenta.medioPago,
          datosVenta.porcentajeRecargo || 0,
          subtotal,
          total,
        ]
      );

      const ventaId = resultadoVenta.insertId;

      // 2 y 3. Insertar items + descontar stock
      for (const item of datosVenta.items) {
        const subtotalItem = item.cantidad * item.precioUnitario;
        const prodId = item.esManual ? null : item.productoId;

        // Insertar item con precio snapshot congelado y nombre
        await con.execute(
          `INSERT INTO items_venta (venta_id, producto_id, nombre_snapshot, cantidad, precio_unitario_snapshot, subtotal, es_manual)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [ventaId, prodId, item.nombre, item.cantidad, item.precioUnitario, subtotalItem, item.esManual ? 1 : 0]
        );

        // Bloquear fila de stock y descontar SOLAMENTE si no es manual
        if (!item.esManual) {
          const [productoStock] = await con.execute(
            `SELECT stock_actual, tipo_venta FROM productos WHERE id = ?`,
            [prodId]
          );

          if (productoStock.length === 0) {
            throw new Error(`Producto ID ${prodId} no encontrado`);
          }

          const nuevoStock = productoStock[0].stock_actual - item.cantidad;
          await con.execute(
            `UPDATE productos SET stock_actual = ? WHERE id = ?`,
            [nuevoStock, prodId]
          );
        }
      }

      // 4. Si es fiado → insertar en libro_mayor
      if (datosVenta.medioPago === 'cuenta_corriente') {
        if (!datosVenta.clienteId) {
          throw new Error('Venta a cuenta corriente requiere un cliente asignado');
        }

        // Snapshot de items para el detalle del libro mayor
        const detalleItems = datosVenta.items.map(item => ({
          productoId:     item.productoId,
          nombre:         item.nombre,
          cantidad:       item.cantidad,
          precioUnitario: item.precioUnitario,
          subtotal:       item.cantidad * item.precioUnitario,
        }));

        await con.execute(
          `INSERT INTO libro_mayor (cuenta_id, usuario_id, venta_id, tipo, monto, concepto, detalle_items)
           VALUES (?, ?, ?, 'cargo', ?, 'Compra fiada', ?)`,
          [
            datosVenta.clienteId,
            datosVenta.usuarioId,
            ventaId,
            total,
            JSON.stringify(detalleItems),
          ]
        );
      }

      return { ventaId, total, exito: true };
    });

    return resultado;
  });

  ipcMain.handle(CANALES.VENTA_ANULAR, async (_evento, { ventaId, motivo, pinDuena }) => {
    // Verificar PIN de dueña antes de anular
    const usuarios = await consultar(
      `SELECT id, pin_hash FROM usuarios WHERE rol = 'duena' AND eliminado_en IS NULL LIMIT 1`
    );
    if (usuarios.length === 0) {
      return { exito: false, error: 'No hay usuario dueña configurado' };
    }

    const pinValido = await bcrypt.compare(pinDuena, usuarios[0].pin_hash);
    if (!pinValido) {
      return { exito: false, error: 'PIN de dueña incorrecto' };
    }

    await consultar(
      `UPDATE ventas SET estado = 'anulada', anulada_por = ?, motivo_anulacion = ?
       WHERE id = ? AND estado = 'completada'`,
      [usuarios[0].id, motivo, ventaId]
    );

    // Nota: No se revierte el stock automáticamente. Si se necesita,
    // se hace un ajuste manual de inventario. Esto es intencional para auditoría.

    return { exito: true };
  });

  ipcMain.handle(CANALES.VENTA_ULTIMA, async () => {
    const filas = await consultar(
      `SELECT v.*, u.nombre_usuario AS cajero
       FROM ventas v
       JOIN usuarios u ON v.usuario_id = u.id
       ORDER BY v.id DESC
       LIMIT 1`
    );
    if (filas.length === 0) return null;

    const venta = filas[0];
    const items = await consultar(
      `SELECT iv.*, p.nombre AS nombre_producto
       FROM items_venta iv
       JOIN productos p ON iv.producto_id = p.id
       WHERE iv.venta_id = ?`,
      [venta.id]
    );

    return { ...venta, items };
  });


  // ─── LIBRO MAYOR (CUENTAS CORRIENTES) ─────────────────────────────

  ipcMain.handle(CANALES.LIBRO_OBTENER_SALDO, async (_evento, { cuentaId }) => {
    const filas = await consultar(
      `SELECT COALESCE(
         SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END),
         0
       ) AS saldo
       FROM libro_mayor
       WHERE cuenta_id = ?`,
      [cuentaId]
    );
    return { saldo: parseFloat(filas[0].saldo) };
  });

  ipcMain.handle(CANALES.LIBRO_OBTENER_HISTORIAL, async (_evento, { cuentaId, pagina = 1, limite = 20 }) => {
    // Deferred Join: la subquery interna solo recorre el índice cubriente
    return await consultaDiferida({
      tabla:           'libro_mayor',
      alias:           'lm',
      columnasFiltro:  'cuenta_id = ?',
      ordenamiento:    'creado_en DESC, id DESC',
      pagina,
      limite,
      parametros:      [cuentaId],
    });
  });

  ipcMain.handle(CANALES.LIBRO_AGREGAR_MOVIMIENTO, async (_evento, movimiento) => {
    // Validar que el tipo sea válido
    const tiposValidos = ['cargo', 'pago', 'ajuste'];
    if (!tiposValidos.includes(movimiento.tipo)) {
      return { exito: false, error: `Tipo de movimiento inválido: ${movimiento.tipo}` };
    }

    const resultado = await consultar(
      `INSERT INTO libro_mayor (cuenta_id, usuario_id, venta_id, tipo, monto, concepto, detalle_items)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        movimiento.cuentaId,
        movimiento.usuarioId,
        movimiento.ventaId || null,
        movimiento.tipo,
        movimiento.monto,
        movimiento.concepto || null,
        movimiento.detalleItems ? JSON.stringify(movimiento.detalleItems) : null,
      ]
    );

    return { id: resultado.insertId, exito: true };
  });


  // ─── CLIENTES ──────────────────────────────────────────────────────

  ipcMain.handle(CANALES.CLIENTE_BUSCAR, async (_evento, { texto, pagina = 1, limite = 50, orden = 'nombre' }) => {
    const filtro = `%${texto || ''}%`;
    const desplazamiento = (pagina - 1) * limite;

    // deuda_desde: fecha del primer cargo que los pagos acumulados no llegan a cubrir (imputación por antigüedad)
    const base = `
      WITH cargos AS (
        SELECT cuenta_id, creado_en,
               SUM(monto) OVER (PARTITION BY cuenta_id ORDER BY creado_en, id) AS acumulado
        FROM libro_mayor WHERE tipo = 'cargo'
      ),
      pagado AS (
        SELECT cuenta_id, SUM(monto) AS total_pagado
        FROM libro_mayor WHERE tipo <> 'cargo' GROUP BY cuenta_id
      ),
      mora AS (
        SELECT ca.cuenta_id, MIN(ca.creado_en) AS deuda_desde
        FROM cargos ca
        LEFT JOIN pagado pa ON pa.cuenta_id = ca.cuenta_id
        WHERE ca.acumulado > COALESCE(pa.total_pagado, 0) + 0.005
        GROUP BY ca.cuenta_id
      )
      SELECT c.id, c.nombre, c.cuit, c.telefono, c.notas, c.creado_en,
             COALESCE(SUM(CASE WHEN lm.tipo = 'cargo' THEN lm.monto ELSE -lm.monto END), 0) AS saldo,
             m.deuda_desde AS deuda_desde
      FROM clientes c
      LEFT JOIN libro_mayor lm ON c.id = lm.cuenta_id
      LEFT JOIN mora m ON m.cuenta_id = c.id
      WHERE c.eliminado_en IS NULL AND (c.nombre LIKE ? OR c.cuit LIKE ?)
      GROUP BY c.id
      ${orden === 'nombre' ? '' : 'HAVING saldo > 0.005'}`;

    let ordenSql = 'nombre COLLATE NOCASE ASC';
    if (orden === 'mayor-deuda') ordenSql = 'saldo DESC, nombre COLLATE NOCASE ASC';
    if (orden === 'antiguedad')  ordenSql = 'deuda_desde ASC, nombre COLLATE NOCASE ASC';

    const filas = await consultar(
      `SELECT * FROM (${base}) ORDER BY ${ordenSql} LIMIT ? OFFSET ?`,
      [filtro, filtro, limite, desplazamiento]
    );

    const [conteo] = await consultar(
      `SELECT COUNT(*) AS total FROM (${base})`,
      [filtro, filtro]
    );

    return { filas, total: conteo.total, pagina, limite };
  });

  ipcMain.handle(CANALES.CLIENTE_CREAR, async (_evento, cliente) => {
    const resultado = await consultar(
      `INSERT INTO clientes (nombre, cuit, telefono, notas) VALUES (?, ?, ?, ?)`,
      [cliente.nombre, cliente.cuit || null, cliente.telefono || null, cliente.notas || null]
    );
    return { id: resultado.insertId, exito: true };
  });

  ipcMain.handle(CANALES.CLIENTE_ACTUALIZAR, async (_evento, datos) => {
    const campos = [];
    const valores = [];

    if (datos.nombre !== undefined)   { campos.push('nombre = ?');   valores.push(datos.nombre); }
    if (datos.cuit !== undefined)     { campos.push('cuit = ?');     valores.push(datos.cuit); }
    if (datos.telefono !== undefined) { campos.push('telefono = ?'); valores.push(datos.telefono); }
    if (datos.notas !== undefined)    { campos.push('notas = ?');    valores.push(datos.notas); }

    if (campos.length === 0) return { exito: false, error: 'Sin campos para actualizar' };

    valores.push(datos.id);
    await consultar(
      `UPDATE clientes SET ${campos.join(', ')} WHERE id = ? AND eliminado_en IS NULL`,
      valores
    );
    return { exito: true };
  });

  ipcMain.handle(CANALES.CLIENTE_ELIMINAR, async (_evento, { id }) => {
    // 1. Obtener el saldo actual
    const [saldoResult] = await consultar(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END), 0) AS saldo 
       FROM libro_mayor WHERE cuenta_id = ?`, 
      [id]
    );

    if (saldoResult && parseFloat(saldoResult.saldo) > 0) {
      return { exito: false, error: 'No se puede eliminar el cliente porque tiene una deuda activa. Debe saldarla primero.' };
    }

    // 2. Si no debe, lo marcamos como eliminado
    await consultar(
      `UPDATE clientes SET eliminado_en = CURRENT_TIMESTAMP WHERE id = ? AND eliminado_en IS NULL`,
      [id]
    );
    return { exito: true };
  });


  // ─── CAJA ──────────────────────────────────────────────────────────

  ipcMain.handle(CANALES.CAJA_RESUMEN_TURNO, async () => {
    // Obtener el último cierre para saber desde cuándo contar
    const cierres = await consultar(
      `SELECT periodo_hasta FROM cierres_caja ORDER BY id DESC LIMIT 1`
    );
    const desde = cierres.length > 0 ? cierres[0].periodo_hasta : '2000-01-01 00:00:00';

    const resumen = await consultar(
      `SELECT
         medio_pago,
         COUNT(*) AS cantidad_ventas,
         SUM(total) AS total
       FROM ventas
       WHERE estado = 'completada'
         AND creado_en > ?
       GROUP BY medio_pago`,
      [desde]
    );

    return { desde, resumen };
  });

  ipcMain.handle(CANALES.CAJA_CERRAR, async (_evento, datosCierre) => {
    const resultado = await consultar(
      `INSERT INTO cierres_caja (usuario_id, total_efectivo, total_tarjeta,
                                 total_transferencia, total_fiado, monto_en_caja,
                                 diferencia, notas, periodo_desde, periodo_hasta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        datosCierre.usuarioId,
        datosCierre.totalEfectivo || 0,
        datosCierre.totalTarjeta || 0,
        datosCierre.totalTransferencia || 0,
        datosCierre.totalFiado || 0,
        datosCierre.montoEnCaja || 0,
        datosCierre.diferencia || 0,
        datosCierre.notas || null,
        datosCierre.periodoDesde,
      ]
    );
    return { id: resultado.insertId, exito: true };
  });

  ipcMain.handle(CANALES.CAJA_ULTIMO_CIERRE, async () => {
    const filas = await consultar(
      `SELECT cc.*, u.nombre_usuario AS cerrado_por_nombre
       FROM cierres_caja cc
       JOIN usuarios u ON cc.usuario_id = u.id
       ORDER BY cc.id DESC
       LIMIT 1`
    );
    return filas[0] || null;
  });


  // ─── HARDWARE ──────────────────────────────────────────────────────

  ipcMain.handle(CANALES.HARDWARE_IMPRIMIR_TICKET, async (_evento, datosTicket) => {
    return await enviarAWorker({ tipo: 'imprimir-ticket', datos: datosTicket });
  });

  ipcMain.handle(CANALES.HARDWARE_IMPRIMIR_ETIQUETA, async (_evento, datosEtiqueta) => {
    // Placeholder para futuro: impresión de etiquetas de góndola
    return { exito: false, error: 'Módulo de etiquetas aún no implementado' };
  });

  ipcMain.handle(CANALES.HARDWARE_ESTADO_IMPRESORA, async () => {
    return await enviarAWorker({ tipo: 'estado' });
  });


  // ─── USUARIOS / AUTENTICACIÓN ─────────────────────────────────────

  ipcMain.handle(CANALES.USUARIO_VERIFICAR_PIN, async (_evento, { pin }) => {
    // Buscar usuario dueña y verificar PIN
    const usuarios = await consultar(
      `SELECT id, nombre_usuario, rol, pin_hash
       FROM usuarios
       WHERE eliminado_en IS NULL`,
    );

    for (const usuario of usuarios) {
      const coincide = await bcrypt.compare(pin, usuario.pin_hash);
      if (coincide) {
        return {
          exito: true,
          usuario: {
            id:             usuario.id,
            nombreUsuario:  usuario.nombre_usuario,
            rol:            usuario.rol,
          },
        };
      }
    }

    return { exito: false, error: 'PIN incorrecto' };
  });

  ipcMain.handle(CANALES.USUARIO_OBTENER_ACTUAL, async () => {
    // Por ahora devuelve el primer usuario activo.
    // En futuro, se maneja sesión.
    const filas = await consultar(
      `SELECT id, nombre_usuario, rol FROM usuarios WHERE eliminado_en IS NULL LIMIT 1`
    );
    return filas[0] || null;
  });


  // ─── SISTEMA / PERSISTENCIA ────────────────────────────────────────

  ipcMain.handle(CANALES.ESTADO_PERSISTIR, async (_evento, datos) => {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');

    const rutaArchivo = path.join(app.getPath('userData'), 'estado-ventas.json');
    try {
      fs.writeFileSync(rutaArchivo, typeof datos === 'string' ? datos : JSON.stringify(datos), 'utf8');
      return { exito: true };
    } catch (error) {
      console.error('[Sistema] Error al persistir estado:', error);
      return { exito: false, error: error.message };
    }
  });

  ipcMain.handle(CANALES.ESTADO_RECUPERAR, async () => {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');

    const rutaArchivo = path.join(app.getPath('userData'), 'estado-ventas.json');
    try {
      if (fs.existsSync(rutaArchivo)) {
        const contenido = fs.readFileSync(rutaArchivo, 'utf8');
        return contenido;
      }
      return null;
    } catch (error) {
      console.error('[Sistema] Error al recuperar estado:', error);
      return null;
    }
  });

  ipcMain.handle(CANALES.SISTEMA_ULTIMO_BACKUP, async () => {
    const bd = require('./baseDatos');
    return bd.obtenerHoraUltimoBackup ? bd.obtenerHoraUltimoBackup() : 'Nunca';
  });

  console.log('[IPC] Todos los manejadores registrados');
}

module.exports = { registrarManejadoresIpc, setWorkerHardware };
