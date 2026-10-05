-- ============================================================================
-- EL RINCÓN DEL GATO — Esquema de Base de Datos
-- Motor: MySQL 5.7+ / 8.0+ (InnoDB)
-- Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- 
-- Convenciones:
--   • Soft delete universal: columna `eliminado_en DATETIME NULL`
--   • Unicidad de código de barras: validada en la aplicación (no en BD)
--   • Libro mayor (libro_mayor): APPEND-ONLY, jamás UPDATE ni DELETE
--   • Precios snapshot: items_venta congela precio al momento de la venta
-- ============================================================================

CREATE DATABASE IF NOT EXISTS rincon_del_gato
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rincon_del_gato;

-- ============================================================================
-- 1. USUARIOS (operadores del sistema)
-- ============================================================================
CREATE TABLE usuarios (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  nombre_usuario    VARCHAR(50)     NOT NULL,
  pin_hash          VARCHAR(255)    NOT NULL,
  rol               ENUM('duena', 'cajero') NOT NULL DEFAULT 'cajero',
  creado_en         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminado_en      DATETIME        NULL     DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE INDEX uq_nombre_usuario (nombre_usuario),
  INDEX idx_usuario_eliminado (eliminado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 2. PRODUCTOS (catálogo maestro)
-- ============================================================================
CREATE TABLE productos (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  codigo_barras     VARCHAR(50)     NULL,
  nombre            VARCHAR(150)    NOT NULL,
  descripcion       VARCHAR(255)    NULL,
  precio_venta      DECIMAL(12,2)   NOT NULL,
  costo             DECIMAL(12,2)   NULL,
  stock_actual      DECIMAL(10,3)   NOT NULL DEFAULT 0.000,
  stock_minimo      DECIMAL(10,3)   NOT NULL DEFAULT 0.000,
  tipo_venta        ENUM('unidad', 'peso', 'manual') NOT NULL DEFAULT 'unidad',
  rubro             VARCHAR(80)     NULL,
  fecha_vencimiento DATE            NULL,
  creado_en         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME        NULL     ON UPDATE CURRENT_TIMESTAMP,
  eliminado_en      DATETIME        NULL     DEFAULT NULL,

  PRIMARY KEY (id),
  INDEX idx_producto_barras    (codigo_barras),
  INDEX idx_producto_nombre    (nombre),
  INDEX idx_producto_rubro     (rubro),
  INDEX idx_producto_vencimiento (fecha_vencimiento),
  INDEX idx_producto_eliminado (eliminado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 3. CLIENTES (cuentas corrientes)
-- ============================================================================
CREATE TABLE clientes (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(150)    NOT NULL,
  cuit              VARCHAR(13)     NULL,
  telefono          VARCHAR(30)     NULL,
  notas             TEXT            NULL,
  creado_en         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminado_en      DATETIME        NULL     DEFAULT NULL,

  PRIMARY KEY (id),
  INDEX idx_cliente_nombre    (nombre),
  INDEX idx_cliente_cuit      (cuit),
  INDEX idx_cliente_eliminado (eliminado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 4. VENTAS (cabecera)
-- ============================================================================
CREATE TABLE ventas (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  usuario_id          INT UNSIGNED    NOT NULL,
  cliente_id          INT UNSIGNED    NULL,
  medio_pago          ENUM('efectivo', 'tarjeta', 'transferencia', 'cuenta_corriente') NOT NULL,
  porcentaje_recargo  DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
  subtotal            DECIMAL(12,2)   NOT NULL,
  total               DECIMAL(12,2)   NOT NULL,
  estado              ENUM('completada', 'anulada') NOT NULL DEFAULT 'completada',
  anulada_por         INT UNSIGNED    NULL,
  motivo_anulacion    VARCHAR(255)    NULL,
  creado_en           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_venta_usuario    FOREIGN KEY (usuario_id)  REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_venta_cliente    FOREIGN KEY (cliente_id)   REFERENCES clientes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_venta_anulador   FOREIGN KEY (anulada_por)  REFERENCES usuarios(id) ON DELETE RESTRICT,

  INDEX idx_venta_fecha    (creado_en),
  INDEX idx_venta_usuario  (usuario_id),
  INDEX idx_venta_cliente  (cliente_id),
  INDEX idx_venta_estado   (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 5. ITEMS DE VENTA (detalle con precio snapshot congelado)
-- ============================================================================
CREATE TABLE items_venta (
  id                        INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  venta_id                  INT UNSIGNED    NOT NULL,
  producto_id               INT UNSIGNED    NULL,
  nombre_snapshot           VARCHAR(150)    NOT NULL,
  cantidad                  DECIMAL(10,3)   NOT NULL,
  precio_unitario_snapshot  DECIMAL(12,2)   NOT NULL,
  subtotal                  DECIMAL(12,2)   NOT NULL,
  es_manual                 TINYINT(1)      NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  CONSTRAINT fk_item_venta     FOREIGN KEY (venta_id)    REFERENCES ventas(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_item_producto  FOREIGN KEY (producto_id)  REFERENCES productos(id) ON DELETE SET NULL,

  INDEX idx_item_venta     (venta_id),
  INDEX idx_item_producto  (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 6. LIBRO MAYOR — CUENTA CORRIENTE (Ledger inmutable, append-only)
--
-- ⚠️  REGLA CRÍTICA: Esta tabla es SOLO INSERT.
--     JAMÁS ejecutar UPDATE ni DELETE sobre ella.
--     El saldo se calcula sumando el historial completo.
-- ============================================================================
CREATE TABLE libro_mayor (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  cuenta_id         INT UNSIGNED    NOT NULL,
  usuario_id        INT UNSIGNED    NOT NULL,
  venta_id          INT UNSIGNED    NULL,
  tipo              ENUM('cargo', 'pago', 'ajuste') NOT NULL,
  monto             DECIMAL(12,2)   NOT NULL,
  concepto          VARCHAR(255)    NULL,
  detalle_items     JSON            NULL,
  creado_en         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_libro_cuenta   FOREIGN KEY (cuenta_id)  REFERENCES clientes(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_libro_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_libro_venta    FOREIGN KEY (venta_id)   REFERENCES ventas(id)    ON DELETE RESTRICT,

  INDEX idx_libro_diferido     (cuenta_id, creado_en, id),
  INDEX idx_libro_fecha_global (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 7. CIERRES DE CAJA (Arqueo diario)
-- ============================================================================
CREATE TABLE cierres_caja (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  usuario_id            INT UNSIGNED    NOT NULL,
  total_efectivo        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  total_tarjeta         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  total_transferencia   DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  total_fiado           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  monto_en_caja         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  diferencia            DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  notas                 TEXT            NULL,
  periodo_desde         DATETIME        NOT NULL,
  periodo_hasta         DATETIME        NOT NULL,
  creado_en             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_cierre_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,

  INDEX idx_cierre_fecha (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- DATOS INICIALES (Seed)
-- ============================================================================

-- Usuario dueña por defecto (PIN: 1234 → se debe cambiar en producción)
-- El hash se genera con bcrypt desde la aplicación; este es un placeholder.
INSERT INTO usuarios (nombre_usuario, pin_hash, rol)
VALUES ('duena', '$2b$10$placeholder_cambiar_en_primer_inicio', 'duena');


-- ============================================================================
-- CONSULTAS ÚTILES DE REFERENCIA (no ejecutar, solo documentación)
-- ============================================================================

-- ▸ Saldo actual de un cliente:
--   SELECT
--     SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE -monto END) AS saldo
--   FROM libro_mayor
--   WHERE cuenta_id = ?;

-- ▸ Historial paginado con Deferred Join:
--   SELECT lm.*
--   FROM libro_mayor lm
--   INNER JOIN (
--     SELECT id
--     FROM libro_mayor
--     WHERE cuenta_id = ?
--     ORDER BY creado_en DESC, id DESC
--     LIMIT ? OFFSET ?
--   ) sub ON lm.id = sub.id
--   ORDER BY lm.creado_en DESC, lm.id DESC;

-- ▸ Productos próximos a vencer (10 días):
--   SELECT * FROM productos
--   WHERE eliminado_en IS NULL
--     AND fecha_vencimiento IS NOT NULL
--     AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 10 DAY)
--   ORDER BY fecha_vencimiento ASC;
