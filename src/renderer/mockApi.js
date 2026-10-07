// ============================================================================
// MOCK API — Simulación de window.api para desarrollo en navegador
//
// Cuando la app corre en el navegador (npm run dev) sin Electron,
// window.api no existe. Este mock lo reemplaza con datos en memoria
// para poder desarrollar y demostrar la UI sin MySQL.
//
// Los productos se guardan en localStorage para persistir entre recargas.
// ============================================================================

// ─── Almacenamiento en memoria con persistencia localStorage ────────────
function cargarDesdeStorage(clave, valorDefecto) {
  try {
    const guardado = localStorage.getItem(`rincon_mock_${clave}`);
    return guardado ? JSON.parse(guardado) : valorDefecto;
  } catch {
    return valorDefecto;
  }
}

function guardarEnStorage(clave, valor) {
  try {
    localStorage.setItem(`rincon_mock_${clave}`, JSON.stringify(valor));
  } catch (error) {
    console.warn('[Mock] Error guardando en localStorage:', error);
  }
}

let productosEnMemoria = cargarDesdeStorage('productos', []);
let contadorId = cargarDesdeStorage('contadorId', 0);

function sincronizarProductos() {
  guardarEnStorage('productos', productosEnMemoria);
  guardarEnStorage('contadorId', contadorId);
}

// ============================================================================
// MOCK API
// ============================================================================

const mockApi = {

  // ─── Productos ───────────────────────────────────────────────────────
  productos: {
    buscar: async (texto, pagina = 1, limite = 50, filtroCondicional = 'todos') => {
      const filtro = (texto || '').toLowerCase();
      let activos = productosEnMemoria.filter(p => !p.eliminado_en);

      if (filtroCondicional === 'bajo-stock') {
        activos = activos.filter(p => parseFloat(p.stock_actual) <= parseFloat(p.stock_minimo || 0));
      } else if (filtroCondicional === 'por-vencer') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        activos = activos.filter(p => {
          if (!p.fecha_vencimiento) return false;
          const v = new Date(p.fecha_vencimiento);
          v.setHours(0, 0, 0, 0);
          const dias = Math.ceil((v - hoy) / (1000 * 60 * 60 * 24));
          return dias <= 10;
        });
      }

      const filtrados = filtro
        ? activos.filter(p =>
            p.nombre.toLowerCase().includes(filtro) ||
            (p.codigo_barras && p.codigo_barras.includes(filtro)) ||
            (p.rubro && p.rubro.toLowerCase().includes(filtro))
          )
        : activos;

      const inicio = (pagina - 1) * limite;
      return {
        filas: filtrados
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
          .slice(inicio, inicio + limite),
        total: filtrados.length,
        pagina,
        limite,
      };
    },

    porCodigoBarras: async (codigoBarras) => {
      return productosEnMemoria.find(
        p => p.codigo_barras === codigoBarras && !p.eliminado_en
      ) || null;
    },

    crear: async (producto) => {
      // Validar unicidad de código de barras
      if (producto.codigoBarras) {
        const existente = productosEnMemoria.find(
          p => p.codigo_barras === producto.codigoBarras && !p.eliminado_en
        );
        if (existente) {
          return { exito: false, error: 'Ya existe un producto con ese código de barras' };
        }
      }

      contadorId++;
      const nuevo = {
        id:                contadorId,
        codigo_barras:     producto.codigoBarras || null,
        nombre:            producto.nombre,
        descripcion:       producto.descripcion || null,
        precio_venta:      parseFloat(producto.precioVenta),
        costo:             producto.costo ? parseFloat(producto.costo) : null,
        stock_actual:      parseFloat(producto.stockActual || 0),
        stock_minimo:      parseFloat(producto.stockMinimo || 0),
        tipo_venta:        producto.tipoVenta || 'unidad',
        rubro:             producto.rubro || null,
        fecha_vencimiento: producto.fechaVencimiento || null,
        creado_en:         new Date().toISOString().slice(0, 19).replace('T', ' '),
        actualizado_en:    null,
        eliminado_en:      null,
      };

      productosEnMemoria.push(nuevo);
      sincronizarProductos();
      return { id: nuevo.id, exito: true };
    },

    actualizar: async (id, cambios) => {
      const indice = productosEnMemoria.findIndex(p => p.id === id && !p.eliminado_en);
      if (indice === -1) return { exito: false, error: 'Producto no encontrado' };

      // Validar unicidad de código de barras si se cambia
      if (cambios.codigoBarras !== undefined) {
        const duplicado = productosEnMemoria.find(
          p => p.codigo_barras === cambios.codigoBarras && p.id !== id && !p.eliminado_en
        );
        if (duplicado) {
          return { exito: false, error: 'Ya existe un producto con ese código de barras' };
        }
        productosEnMemoria[indice].codigo_barras = cambios.codigoBarras;
      }

      if (cambios.nombre !== undefined)           productosEnMemoria[indice].nombre = cambios.nombre;
      if (cambios.descripcion !== undefined)      productosEnMemoria[indice].descripcion = cambios.descripcion;
      if (cambios.precioVenta !== undefined)      productosEnMemoria[indice].precio_venta = parseFloat(cambios.precioVenta);
      if (cambios.costo !== undefined)            productosEnMemoria[indice].costo = cambios.costo ? parseFloat(cambios.costo) : null;
      if (cambios.stockActual !== undefined)      productosEnMemoria[indice].stock_actual = parseFloat(cambios.stockActual);
      if (cambios.stockMinimo !== undefined)      productosEnMemoria[indice].stock_minimo = parseFloat(cambios.stockMinimo);
      if (cambios.tipoVenta !== undefined)        productosEnMemoria[indice].tipo_venta = cambios.tipoVenta;
      if (cambios.rubro !== undefined)            productosEnMemoria[indice].rubro = cambios.rubro;
      if (cambios.fechaVencimiento !== undefined) productosEnMemoria[indice].fecha_vencimiento = cambios.fechaVencimiento;

      productosEnMemoria[indice].actualizado_en = new Date().toISOString().slice(0, 19).replace('T', ' ');
      sincronizarProductos();
      return { exito: true };
    },

    eliminar: async (id) => {
      const indice = productosEnMemoria.findIndex(p => p.id === id && !p.eliminado_en);
      if (indice !== -1) {
        productosEnMemoria[indice].eliminado_en = new Date().toISOString().slice(0, 19).replace('T', ' ');
        sincronizarProductos();
      }
      return { exito: true };
    },

    proximosAVencer: async (diasAnticipacion = 10) => {
      const hoy = new Date();
      const limite = new Date();
      limite.setDate(hoy.getDate() + diasAnticipacion);

      return productosEnMemoria.filter(p => {
        if (p.eliminado_en || !p.fecha_vencimiento) return false;
        const venc = new Date(p.fecha_vencimiento);
        return venc <= limite;
      }).sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
    },
  },

  // ─── Ventas (stub) ───────────────────────────────────────────────────
  ventas: {
    crear: async (datosVenta) => {
      // Mock para reducir stock
      if (datosVenta && datosVenta.items) {
        datosVenta.items.forEach(item => {
          const prod = productosEnMemoria.find(p => p.id === item.productoId);
          if (prod && !prod.eliminado_en) {
            prod.stock_actual = Math.max(0, prod.stock_actual - item.cantidad);
          }
        });
        sincronizarProductos();
      }
      return { exito: true };
    },
    anular:           async () => ({ exito: true }),
    obtenerUltima:    async () => null,
    obtenerHistorial: async () => ({ filas: [], total: 0, pagina: 1, limite: 50, resumen: { totalFacturado: 0, totalEfectivo: 0, totalTarjeta: 0, totalTransferencia: 0, totalCuentaCorriente: 0, totalAnulado: 0 } }),
    obtenerDetalle:   async () => null,
    purgar:           async () => ({ exito: true, eliminados: 0 }),
  },

  // ─── Libro Mayor (stub) ─────────────────────────────────────────────
  libro: {
    obtenerSaldo:      async () => ({ saldo: 0 }),
    obtenerHistorial:  async () => ({ filas: [], total: 0 }),
    agregarMovimiento: async () => ({ exito: false, error: 'Requiere conexión a base de datos' }),
  },

  // ─── Clientes (stub) ────────────────────────────────────────────────
  clientes: {
    buscar:     async () => ({ filas: [], total: 0, pagina: 1, limite: 50 }),
    crear:      async () => ({ exito: false, error: 'Requiere conexión a base de datos' }),
    actualizar: async () => ({ exito: false, error: 'Requiere conexión a base de datos' }),
    eliminar:   async () => ({ exito: true }),
  },

  // ─── Caja (stub) ────────────────────────────────────────────────────
  caja: {
    cerrar:           async () => ({ exito: true, id: 1 }),
    ultimoCierre:     async () => null,
    resumenTurno:     async () => ({ desde: null, resumen: [] }),
    obtenerHistorial: async () => ({ filas: [], total: 0, pagina: 1, limite: 50 }),
  },

  // ─── Reportes (stub) ────────────────────────────────────────────────
  reportes: {
    carteraCuentas:   async () => ({ totalDeuda: 0, totalClientesDeudores: 0, alDia: 0, mora15: 0, mora30: 0, deudores: [] }),
  },

  // ─── Hardware (stub) ────────────────────────────────────────────────
  hardware: {
    imprimirTicket:   async () => ({ exito: false, error: 'Sin impresora en modo demo' }),
    imprimirEtiqueta: async () => ({ exito: false, error: 'Sin impresora en modo demo' }),
    estadoImpresora:  async () => ({ exito: true, estado: 'sin-configurar' }),
  },

  // ─── Usuarios (stub) ────────────────────────────────────────────────
  usuarios: {
    verificarPin:  async () => ({ exito: true, usuario: { id: 1, nombreUsuario: 'demo', rol: 'duena' } }),
    obtenerActual: async () => ({ id: 1, nombre_usuario: 'demo', rol: 'duena' }),
  },

  // ─── Sistema / Persistencia ─────────────────────────────────────────
  sistema: {
    persistirEstado: async (datos) => {
      try {
        if (datos === null) {
          localStorage.removeItem('rincon_estado_ventas');
        } else {
          localStorage.setItem('rincon_estado_ventas', typeof datos === 'string' ? datos : JSON.stringify(datos));
        }
        return { exito: true };
      } catch {
        return { exito: true };
      }
    },
    recuperarEstado: async () => {
      try {
        return localStorage.getItem('rincon_estado_ventas') || null;
      } catch {
        return null;
      }
    },
  },

  // ─── Eventos de energía (stub) ──────────────────────────────────────
  alCambiarEnergia: (callback) => {
    // No-op en modo navegador
    return () => {};
  },
};

export default mockApi;
