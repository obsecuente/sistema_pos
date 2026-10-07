const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = null;
let lastBackupTime = 'Nunca';

function inicializarPool() {
  const rootDir = path.join(__dirname, '..', '..');
  const dbPath = path.join(rootDir, 'database.sqlite');
  const backupDir = path.join(rootDir, 'backups');
  
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const hacerBackup = (prefijo = 'backup') => {
    if (fs.existsSync(dbPath)) {
      try {
        const fecha = new Date().toISOString().slice(0,10);
        const dest = path.join(backupDir, `${prefijo}_${fecha}.sqlite`);
        fs.copyFileSync(dbPath, dest);
        const h = new Date().getHours().toString().padStart(2, '0');
        const m = new Date().getMinutes().toString().padStart(2, '0');
        lastBackupTime = `${h}:${m}`;
        console.log(`[BD] Backup realizado: ${dest}`);
      } catch(e) {
        console.error('[BD] Error al hacer backup:', e.message);
      }
    }
  };

  hacerBackup('arranque');
  setInterval(() => hacerBackup('diario'), 8 * 60 * 60 * 1000);

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('[BD] Error abriendo:', err);
    else console.log('[BD] Conectado a SQLite3');
  });

  db.run('PRAGMA journal_mode = WAL');
  
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'", (err, row) => {
    if (!row) {
      console.log('[BD] Base de datos vacía. Creando esquema SQLite3...');
      db.exec(`
        CREATE TABLE usuarios ( id INTEGER PRIMARY KEY AUTOINCREMENT, nombre_usuario TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'cajero', creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, eliminado_en DATETIME NULL );
        CREATE TABLE productos ( id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_barras TEXT NULL, nombre TEXT NOT NULL, descripcion TEXT NULL, precio_venta REAL NOT NULL, costo REAL NULL, stock_actual REAL NOT NULL DEFAULT 0.000, stock_minimo REAL NOT NULL DEFAULT 0.000, tipo_venta TEXT NOT NULL DEFAULT 'unidad', rubro TEXT NULL, fecha_vencimiento DATE NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, actualizado_en DATETIME NULL, eliminado_en DATETIME NULL );
        CREATE TABLE clientes ( id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, cuit TEXT NULL, telefono TEXT NULL, notas TEXT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, eliminado_en DATETIME NULL );
        CREATE TABLE ventas ( id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, cliente_id INTEGER NULL, medio_pago TEXT NOT NULL, porcentaje_recargo REAL NOT NULL DEFAULT 0.00, subtotal REAL NOT NULL, total REAL NOT NULL, estado TEXT NOT NULL DEFAULT 'completada', anulada_por INTEGER NULL, motivo_anulacion TEXT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        CREATE TABLE items_venta ( id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER NOT NULL, producto_id INTEGER NULL, nombre_snapshot TEXT NOT NULL, cantidad REAL NOT NULL, precio_unitario_snapshot REAL NOT NULL, subtotal REAL NOT NULL, es_manual INTEGER NOT NULL DEFAULT 0 );
        CREATE TABLE libro_mayor ( id INTEGER PRIMARY KEY AUTOINCREMENT, cuenta_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL, venta_id INTEGER NULL, tipo TEXT NOT NULL, monto REAL NOT NULL, concepto TEXT NULL, detalle_items TEXT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        CREATE TABLE cierres_caja ( id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, total_efectivo REAL NOT NULL DEFAULT 0.00, total_tarjeta REAL NOT NULL DEFAULT 0.00, total_transferencia REAL NOT NULL DEFAULT 0.00, total_fiado REAL NOT NULL DEFAULT 0.00, monto_en_caja REAL NOT NULL DEFAULT 0.00, diferencia REAL NOT NULL DEFAULT 0.00, monto_inicial REAL NOT NULL DEFAULT 0.00, total_ingresos REAL NOT NULL DEFAULT 0.00, total_egresos REAL NOT NULL DEFAULT 0.00, notas TEXT NULL, periodo_desde DATETIME NOT NULL, periodo_hasta DATETIME NOT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        CREATE TABLE movimientos_caja ( id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL, monto REAL NOT NULL, motivo TEXT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        INSERT INTO usuarios (nombre_usuario, pin_hash, rol) VALUES ('duena', '$2b$10$placeholder_cambiar_en_primer_inicio', 'duena');
      `, (err) => {
         if (err) console.error('[BD] Error creando tablas:', err);
      });
    } else {
      // Migraciones seguras para bases de datos existentes
      db.exec(`
        CREATE TABLE IF NOT EXISTS movimientos_caja ( id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL, monto REAL NOT NULL, motivo TEXT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        UPDATE ventas SET medio_pago = 'transferencia' WHERE medio_pago = 'billetera';
      `);
      db.all("PRAGMA table_info(cierres_caja)", (errCols, columnas) => {
        if (!errCols && columnas) {
          const nombres = columnas.map(c => c.name);
          if (!nombres.includes('monto_inicial')) {
            db.run("ALTER TABLE cierres_caja ADD COLUMN monto_inicial REAL NOT NULL DEFAULT 0.00");
          }
          if (!nombres.includes('total_ingresos')) {
            db.run("ALTER TABLE cierres_caja ADD COLUMN total_ingresos REAL NOT NULL DEFAULT 0.00");
          }
          if (!nombres.includes('total_egresos')) {
            db.run("ALTER TABLE cierres_caja ADD COLUMN total_egresos REAL NOT NULL DEFAULT 0.00");
          }
        }
      });
    }
  });

  const { app } = require('electron');
  app.on('before-quit', () => hacerBackup('cierre'));

  return db;
}

function obtenerPool() {
  if (!db) throw new Error('[BD] Pool no inicializado.');
  return db;
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ insertId: this.lastID, affectedRows: this.changes });
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function consultar(sql, parametros = []) {
  const inicio = sql.trim().toUpperCase();
  if (inicio.startsWith('SELECT') || inicio.startsWith('WITH')) {
    return await allAsync(sql, parametros);
  } else {
    return await runAsync(sql, parametros);
  }
}

async function conTransaccion(callback) {
  await runAsync('BEGIN TRANSACTION');
  try {
    const mockConnection = {
      execute: async (sql, params = []) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          const rows = await allAsync(sql, params);
          return [rows, []];
        } else {
          const info = await runAsync(sql, params);
          return [info, []];
        }
      }
    };
    const result = await callback(mockConnection);
    await runAsync('COMMIT');
    return result;
  } catch (error) {
    await runAsync('ROLLBACK');
    throw error;
  }
}

async function consultaDiferida({ tabla, alias, columnasFiltro, ordenamiento, pagina, limite, parametros = [] }) {
  const desplazamiento = (pagina - 1) * limite;
  const sqlDatos = `
    SELECT ${alias}.*
    FROM ${tabla} ${alias}
    INNER JOIN (
      SELECT id FROM ${tabla} WHERE ${columnasFiltro} ORDER BY ${ordenamiento} LIMIT ? OFFSET ?
    ) sub ON ${alias}.id = sub.id
    ORDER BY ${alias}.${ordenamiento}
  `;
  const sqlConteo = `SELECT COUNT(*) AS total FROM ${tabla} WHERE ${columnasFiltro}`;
  
  const filas = await allAsync(sqlDatos, [...parametros, limite, desplazamiento]);
  const conteo = await getAsync(sqlConteo, parametros);
  
  return { filas, total: conteo.total };
}

async function cerrarPool() {
  if (db) {
    db.close();
    console.log('[BD] SQLite cerrado');
    db = null;
  }
}

module.exports = {
  inicializarPool, obtenerPool, consultar, conTransaccion, consultaDiferida, cerrarPool,
  obtenerHoraUltimoBackup: () => lastBackupTime
};
