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

/**
 * Sincroniza los montos y subtotales de las compras fiadas en el libro mayor
 * con los precios de venta vigentes en la tabla de productos (actualización por inflación).
 */
async function sincronizarPreciosLibroMayor() {
  try {
    const productos = await consultar(`SELECT id, precio_venta FROM productos WHERE eliminado_en IS NULL`);
    const mapaPrecios = new Map(productos.map(p => [Number(p.id), parseFloat(p.precio_venta)]));

    const cargos = await consultar(
      `SELECT id, monto, detalle_items FROM libro_mayor WHERE tipo = 'cargo' AND detalle_items IS NOT NULL`
    );

    for (const c of cargos) {
      if (!c.detalle_items) continue;
      let items;
      try {
        items = JSON.parse(c.detalle_items);
      } catch {
        continue;
      }
      if (!Array.isArray(items)) continue;

      let modificado = false;
      let nuevoMonto = 0;

      for (const it of items) {
        const idNum = Number(it.productoId);
        if (!isNaN(idNum) && idNum > 0 && mapaPrecios.has(idNum)) {
          const precioActual = mapaPrecios.get(idNum);
          if (it.precioUnitario !== precioActual) {
            it.precioUnitario = precioActual;
            it.subtotal = (Number(it.cantidad || 1) * precioActual);
            modificado = true;
          }
        }
        nuevoMonto += (Number(it.cantidad || 1) * Number(it.precioUnitario || 0));
      }

      if (modificado || Math.abs(parseFloat(c.monto) - nuevoMonto) > 0.005) {
        await consultar(
          `UPDATE libro_mayor SET monto = ?, detalle_items = ? WHERE id = ?`,
          [nuevoMonto, JSON.stringify(items), c.id]
        );
      }
    }
  } catch (err) {
    console.error('[LibroMayor] Error en sincronizarPreciosLibroMayor:', err);
  }
}

// ============================================================================
// REGISTRAR TODOS LOS HANDLERS
// ============================================================================

function registrarManejadoresIpc() {
  sincronizarPreciosLibroMayor().catch(err => console.error('[LibroMayor] Sync inicial fallo:', err));

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

    // Si se actualizó el precio de venta, indexar automáticamente los cargos en libro_mayor a precio presente
    if (datos.precioVenta !== undefined) {
      await sincronizarPreciosLibroMayor();
    }

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
      const medioPagoNormalizado = datosVenta.medioPago === 'billetera' ? 'transferencia' : datosVenta.medioPago;
      const [resultadoVenta] = await con.execute(
        `INSERT INTO ventas (usuario_id, cliente_id, medio_pago, porcentaje_recargo, subtotal, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          datosVenta.usuarioId,
          datosVenta.clienteId || null,
          medioPagoNormalizado,
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

  ipcMain.handle(CANALES.VENTA_ANULAR, async (_evento, { ventaId, motivo = '' }) => {
    const resultado = await conTransaccion(async (con) => {
      // 1. Obtener la venta
      const [ventas] = await con.execute(
        `SELECT * FROM ventas WHERE id = ?`,
        [ventaId]
      );
      if (ventas.length === 0) throw new Error('Venta no encontrada');
      const venta = ventas[0];
      if (venta.estado === 'anulada') throw new Error('La venta ya fue anulada previamente');

      // 2. Marcar como anulada
      await con.execute(
        `UPDATE ventas
         SET estado = 'anulada', motivo_anulacion = ?, anulada_por = 1
         WHERE id = ?`,
        [motivo || 'Anulación de venta', ventaId]
      );

      // 3. Obtener items y revertir stock de los productos con producto_id válido
      const [items] = await con.execute(
        `SELECT producto_id, cantidad, es_manual FROM items_venta WHERE venta_id = ?`,
        [ventaId]
      );
      for (const it of items) {
        if (it.producto_id && !it.es_manual) {
          await con.execute(
            `UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?`,
            [it.cantidad, it.producto_id]
          );
        }
      }

      // 4. Si fue cuenta corriente, insertar movimiento compensatorio en libro_mayor
      if (venta.medio_pago === 'cuenta_corriente' && venta.cliente_id) {
        await con.execute(
          `INSERT INTO libro_mayor (cuenta_id, usuario_id, venta_id, tipo, monto, concepto, detalle_items)
           VALUES (?, 1, ?, 'ajuste', ?, ?, NULL)`,
          [
            venta.cliente_id,
            ventaId,
            venta.total,
            `Anulación de ticket #${ventaId}`
          ]
        );
      }

      return { exito: true };
    });

    // Sincronizar saldos de cuenta corriente tras la compensación
    await sincronizarPreciosLibroMayor();
    return resultado;
  });

  ipcMain.handle(CANALES.VENTAS_OBTENER_HISTORIAL, async (_evento, { fechaDesde, fechaHasta, medioPago, busqueda, pagina = 1, limite = 15 } = {}) => {
    const condiciones = ['1=1'];
    const parametros = [];

    if (fechaDesde) {
      condiciones.push('v.creado_en >= ?');
      parametros.push(`${fechaDesde} 00:00:00`);
    }
    if (fechaHasta) {
      condiciones.push('v.creado_en <= ?');
      parametros.push(`${fechaHasta} 23:59:59`);
    }
    if (medioPago && medioPago !== 'todos') {
      if (medioPago === 'transferencia' || medioPago === 'billetera') {
        condiciones.push("v.medio_pago IN ('transferencia', 'billetera')");
      } else {
        condiciones.push('v.medio_pago = ?');
        parametros.push(medioPago);
      }
    }
    if (busqueda && busqueda.trim()) {
      const b = `%${busqueda.trim()}%`;
      const num = parseInt(busqueda.trim(), 10);
      if (!isNaN(num) && String(num) === busqueda.trim()) {
        condiciones.push('(v.id = ? OR c.nombre LIKE ? OR c.cuit LIKE ?)');
        parametros.push(num, b, b);
      } else {
        condiciones.push('(c.nombre LIKE ? OR c.cuit LIKE ?)');
        parametros.push(b, b);
      }
    }

    const whereSql = condiciones.join(' AND ');
    const desplazamiento = (pagina - 1) * limite;

    const filas = await consultar(
      `SELECT v.id, v.usuario_id, v.cliente_id, v.medio_pago, v.porcentaje_recargo,
              v.subtotal, v.total, v.estado, v.motivo_anulacion, v.creado_en,
              c.nombre AS cliente_nombre, c.cuit AS cliente_cuit
       FROM ventas v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       WHERE ${whereSql}
       ORDER BY v.creado_en DESC, v.id DESC
       LIMIT ? OFFSET ?`,
      [...parametros, limite, desplazamiento]
    );

    const [conteo] = await consultar(
      `SELECT COUNT(*) AS total
       FROM ventas v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       WHERE ${whereSql}`,
      parametros
    );

    const [resumen] = await consultar(
      `SELECT
         COALESCE(SUM(CASE WHEN v.estado = 'completada' THEN v.total ELSE 0 END), 0) AS totalFacturado,
         COALESCE(SUM(CASE WHEN v.estado = 'completada' AND v.medio_pago = 'efectivo' THEN v.total ELSE 0 END), 0) AS totalEfectivo,
         COALESCE(SUM(CASE WHEN v.estado = 'completada' AND v.medio_pago = 'tarjeta' THEN v.total ELSE 0 END), 0) AS totalTarjeta,
         COALESCE(SUM(CASE WHEN v.estado = 'completada' AND v.medio_pago IN ('transferencia', 'billetera') THEN v.total ELSE 0 END), 0) AS totalTransferencia,
         COALESCE(SUM(CASE WHEN v.estado = 'completada' AND v.medio_pago = 'cuenta_corriente' THEN v.total ELSE 0 END), 0) AS totalCuentaCorriente,
         COALESCE(SUM(CASE WHEN v.estado = 'anulada' THEN v.total ELSE 0 END), 0) AS totalAnulado
       FROM ventas v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       WHERE ${whereSql}`,
      parametros
    );

    return {
      filas,
      total: conteo?.total || 0,
      pagina,
      limite,
      resumen: {
        totalFacturado: parseFloat(resumen?.totalFacturado || 0),
        totalEfectivo: parseFloat(resumen?.totalEfectivo || 0),
        totalTarjeta: parseFloat(resumen?.totalTarjeta || 0),
        totalTransferencia: parseFloat(resumen?.totalTransferencia || 0),
        totalCuentaCorriente: parseFloat(resumen?.totalCuentaCorriente || 0),
        totalAnulado: parseFloat(resumen?.totalAnulado || 0),
      }
    };
  });

  ipcMain.handle(CANALES.VENTAS_OBTENER_DETALLE, async (_evento, { ventaId }) => {
    const filasVenta = await consultar(
      `SELECT v.*, c.nombre AS cliente_nombre, c.cuit AS cliente_cuit, c.telefono AS cliente_telefono
       FROM ventas v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       WHERE v.id = ?`,
      [ventaId]
    );
    if (filasVenta.length === 0) return null;
    const venta = filasVenta[0];

    const items = await consultar(
      `SELECT iv.id, iv.venta_id, iv.producto_id, iv.nombre_snapshot,
              iv.cantidad, iv.precio_unitario_snapshot, iv.subtotal, iv.es_manual,
              p.codigo_barras
       FROM items_venta iv
       LEFT JOIN productos p ON iv.producto_id = p.id
       WHERE iv.venta_id = ?
       ORDER BY iv.id ASC`,
      [ventaId]
    );

    return { ...venta, items };
  });

  ipcMain.handle(CANALES.VENTAS_PURGAR, async (_evento, { fechaDesde, fechaHasta, soloConteo = false }) => {
    const condiciones = ['1=1'];
    const parametros = [];

    if (fechaDesde) {
      condiciones.push('creado_en >= ?');
      parametros.push(`${fechaDesde} 00:00:00`);
    }
    if (fechaHasta) {
      condiciones.push('creado_en <= ?');
      parametros.push(`${fechaHasta} 23:59:59`);
    }

    const whereSql = condiciones.join(' AND ');

    if (soloConteo) {
      const [conteo] = await consultar(
        `SELECT COUNT(*) AS total FROM ventas WHERE ${whereSql}`,
        parametros
      );
      return { total: conteo?.total || 0 };
    }

    const resultado = await conTransaccion(async (con) => {
      const [filas] = await con.execute(
        `SELECT id FROM ventas WHERE ${whereSql}`,
        parametros
      );
      const totalAEliminar = filas.length;
      if (totalAEliminar === 0) return { exito: true, eliminados: 0 };

      await con.execute(
        `DELETE FROM items_venta WHERE venta_id IN (SELECT id FROM ventas WHERE ${whereSql})`,
        parametros
      );

      await con.execute(
        `DELETE FROM ventas WHERE ${whereSql}`,
        parametros
      );

      return { exito: true, eliminados: totalAEliminar };
    });

    return resultado;
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
    await sincronizarPreciosLibroMayor();
    const [fila] = await consultar(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END), 0) AS saldo
       FROM libro_mayor WHERE cuenta_id = ?`,
      [cuentaId]
    );
    return { saldo: parseFloat(fila?.saldo || 0) };
  });

  ipcMain.handle(CANALES.LIBRO_OBTENER_HISTORIAL, async (_evento, { cuentaId, pagina = 1, limite = 50 }) => {
    await sincronizarPreciosLibroMayor();
    const res = await consultaDiferida({
      tabla:           'libro_mayor',
      alias:           'lm',
      columnasFiltro:  'cuenta_id = ?',
      ordenamiento:    'creado_en DESC, id DESC',
      pagina,
      limite,
      parametros:      [cuentaId],
    });
    return res;
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
    await sincronizarPreciosLibroMayor();
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
    await sincronizarPreciosLibroMayor();
    // 1. Obtener el saldo actual
    const [saldoResult] = await consultar(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END), 0) AS saldo 
       FROM libro_mayor WHERE cuenta_id = ?`, 
      [id]
    );

    if (saldoResult && parseFloat(saldoResult.saldo) > 0.005) {
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

  ipcMain.handle(CANALES.CAJA_ESTADO_TURNO, async () => {
    // 1. Obtener fecha del último cierre de caja
    const cierres = await consultar(
      `SELECT periodo_hasta FROM cierres_caja ORDER BY id DESC LIMIT 1`
    );
    const desde = cierres.length > 0 ? cierres[0].periodo_hasta : '2000-01-01 00:00:00';

    // 2. Verificar si hay apertura posterior al último cierre
    const aperturas = await consultar(
      `SELECT * FROM movimientos_caja WHERE tipo = 'apertura' AND creado_en > ? ORDER BY id DESC LIMIT 1`,
      [desde]
    );

    const cajaAbierta = aperturas.length > 0;
    const montoInicial = cajaAbierta ? parseFloat(aperturas[0].monto || 0) : 0;
    const aperturaFecha = cajaAbierta ? aperturas[0].creado_en : desde;

    // 3. Totales de ingresos y egresos del turno
    const [totalesMov] = await consultar(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS totalIngresos,
         COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS totalEgresos
       FROM movimientos_caja
       WHERE creado_en > ?`,
      [desde]
    );

    return {
      cajaAbierta,
      montoInicial,
      totalIngresos: parseFloat(totalesMov?.totalIngresos || 0),
      totalEgresos: parseFloat(totalesMov?.totalEgresos || 0),
      desde: aperturaFecha,
    };
  });

  ipcMain.handle(CANALES.CAJA_ABRIR_TURNO, async (_evento, { montoInicial = 0, usuarioId = 1 } = {}) => {
    const res = await consultar(
      `INSERT INTO movimientos_caja (usuario_id, tipo, monto, motivo) VALUES (?, 'apertura', ?, 'Monto inicial de apertura')`,
      [usuarioId, parseFloat(montoInicial || 0)]
    );
    return { exito: true, id: res.insertId, montoInicial: parseFloat(montoInicial || 0) };
  });

  ipcMain.handle(CANALES.CAJA_REGISTRAR_MOVIMIENTO, async (_evento, { tipo, monto, motivo = null, usuarioId = 1 }) => {
    if (!['ingreso', 'egreso'].includes(tipo)) {
      return { exito: false, error: 'Tipo de movimiento inválido. Debe ser ingreso o egreso.' };
    }
    const montoNum = parseFloat(monto || 0);
    if (isNaN(montoNum) || montoNum <= 0) {
      return { exito: false, error: 'El monto debe ser mayor a cero.' };
    }

    const res = await consultar(
      `INSERT INTO movimientos_caja (usuario_id, tipo, monto, motivo) VALUES (?, ?, ?, ?)`,
      [usuarioId, tipo, montoNum, motivo ? motivo.trim() : null]
    );

    // Enviar impresión de ticket de movimiento de caja chica a la impresora térmica
    const fechaHora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    enviarAWorker({
      tipo: 'imprimir-ticket',
      datos: {
        tipo: 'movimiento_caja',
        tipoMovimiento: tipo,
        monto: montoNum,
        motivo: motivo ? motivo.trim() : (tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro de efectivo'),
        fecha: fechaHora,
      }
    }).catch(err => console.warn('[Caja] Error al imprimir comprobante de movimiento:', err));

    return { exito: true, id: res.insertId };
  });

  ipcMain.handle(CANALES.CAJA_OBTENER_MOVIMIENTOS, async (_evento, { desde } = {}) => {
    const cierres = await consultar(
      `SELECT periodo_hasta FROM cierres_caja ORDER BY id DESC LIMIT 1`
    );
    const fechaDesde = desde || (cierres.length > 0 ? cierres[0].periodo_hasta : '2000-01-01 00:00:00');

    const filas = await consultar(
      `SELECT mc.*, u.nombre_usuario AS usuario_nombre
       FROM movimientos_caja mc
       LEFT JOIN usuarios u ON mc.usuario_id = u.id
       WHERE mc.creado_en > ?
       ORDER BY mc.id DESC`,
      [fechaDesde]
    );

    return filas;
  });

  ipcMain.handle(CANALES.CAJA_RESUMEN_TURNO, async () => {
    // Obtener el último cierre para saber desde cuándo contar
    const cierres = await consultar(
      `SELECT periodo_hasta FROM cierres_caja ORDER BY id DESC LIMIT 1`
    );
    const desde = cierres.length > 0 ? cierres[0].periodo_hasta : '2000-01-01 00:00:00';

    // Obtener apertura, ingresos y egresos
    const aperturas = await consultar(
      `SELECT monto FROM movimientos_caja WHERE tipo = 'apertura' AND creado_en > ? ORDER BY id DESC LIMIT 1`,
      [desde]
    );
    const montoInicial = aperturas.length > 0 ? parseFloat(aperturas[0].monto || 0) : 0;

    const [totalesMov] = await consultar(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS totalIngresos,
         COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS totalEgresos
       FROM movimientos_caja
       WHERE creado_en > ?`,
      [desde]
    );
    const totalIngresos = parseFloat(totalesMov?.totalIngresos || 0);
    const totalEgresos = parseFloat(totalesMov?.totalEgresos || 0);

    const resumen = await consultar(
      `SELECT
         CASE WHEN medio_pago = 'billetera' THEN 'transferencia' ELSE medio_pago END AS medio_pago,
         COUNT(*) AS cantidad_ventas,
         SUM(total) AS total
       FROM ventas
       WHERE estado = 'completada'
         AND creado_en > ?
       GROUP BY CASE WHEN medio_pago = 'billetera' THEN 'transferencia' ELSE medio_pago END`,
      [desde]
    );

    return {
      desde,
      resumen,
      montoInicial,
      totalIngresos,
      totalEgresos,
    };
  });

  ipcMain.handle(CANALES.CAJA_CERRAR, async (_evento, datosCierre) => {
    const resultado = await consultar(
      `INSERT INTO cierres_caja (usuario_id, total_efectivo, total_tarjeta,
                                 total_transferencia, total_fiado, monto_en_caja,
                                 diferencia, monto_inicial, total_ingresos, total_egresos,
                                 notas, periodo_desde, periodo_hasta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        datosCierre.usuarioId,
        datosCierre.totalEfectivo || 0,
        datosCierre.totalTarjeta || 0,
        datosCierre.totalTransferencia || 0,
        datosCierre.totalFiado || 0,
        datosCierre.montoEnCaja || 0,
        datosCierre.diferencia || 0,
        datosCierre.montoInicial || 0,
        datosCierre.totalIngresos || 0,
        datosCierre.totalEgresos || 0,
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

  ipcMain.handle(CANALES.CAJA_OBTENER_HISTORIAL, async (_evento, { pagina = 1, limite = 50 } = {}) => {
    const desplazamiento = (pagina - 1) * limite;
    const filas = await consultar(
      `SELECT cc.*, u.nombre_usuario AS cerrado_por_nombre
       FROM cierres_caja cc
       LEFT JOIN usuarios u ON cc.usuario_id = u.id
       ORDER BY cc.id DESC
       LIMIT ? OFFSET ?`,
      [limite, desplazamiento]
    );
    const [conteo] = await consultar(`SELECT COUNT(*) AS total FROM cierres_caja`);
    return { filas, total: conteo?.total || 0, pagina, limite };
  });


  // ─── REPORTES ──────────────────────────────────────────────────────

  ipcMain.handle(CANALES.REPORTES_CARTERA_CUENTAS, async () => {
    await sincronizarPreciosLibroMayor();

    const [resumen] = await consultar(`
      WITH saldos AS (
        SELECT cuenta_id,
               COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END), 0) AS saldo
        FROM libro_mayor
        GROUP BY cuenta_id
      )
      SELECT
        COALESCE(SUM(CASE WHEN saldo > 0.005 THEN saldo ELSE 0 END), 0) AS totalDeuda,
        COUNT(CASE WHEN saldo > 0.005 THEN 1 END) AS totalClientesDeudores
      FROM saldos
    `);

    const deudores = await consultar(`
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
      SELECT c.id, c.nombre, c.telefono, c.cuit,
             COALESCE(SUM(CASE WHEN lm.tipo = 'cargo' THEN lm.monto ELSE -lm.monto END), 0) AS saldo,
             m.deuda_desde
      FROM clientes c
      LEFT JOIN libro_mayor lm ON c.id = lm.cuenta_id
      LEFT JOIN mora m ON m.cuenta_id = c.id
      WHERE c.eliminado_en IS NULL
      GROUP BY c.id
      HAVING saldo > 0.005
      ORDER BY saldo DESC
    `);

    let alDia = 0;
    let mora15 = 0;
    let mora30 = 0;
    const ahora = Date.now();

    for (const d of deudores) {
      if (d.deuda_desde) {
        const fechaMora = new Date(String(d.deuda_desde).replace(' ', 'T') + 'Z').getTime();
        const dias = Math.floor((ahora - fechaMora) / 86400000);
        if (dias >= 30) mora30++;
        else if (dias >= 15) mora15++;
        else alDia++;
      } else {
        alDia++;
      }
    }

    return {
      totalDeuda: parseFloat(resumen?.totalDeuda || 0),
      totalClientesDeudores: resumen?.totalClientesDeudores || 0,
      alDia,
      mora15,
      mora30,
      deudores,
    };
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
