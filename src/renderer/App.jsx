// ============================================================================
// App.jsx — Componente raíz de la aplicación POS
//
// Responsabilidades:
//   - Router de secciones (ventas, cuentas, productos, caja, reportes)
//   - Barra de pestañas de ventas
//   - Input de código de barras (autofocus, escaneo automático + tipeo manual)
//   - Edición manual de cantidades y Rubros Rápidos (Precio Variable)
//   - Listener de eventos de energía (UPS)
//   - Barra de estado inferior (hardware, energía, usuario)
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import useTiendaApp, { SECCIONES } from './store/useTiendaApp';
import useTiendaVentas from './store/useTiendaVentas';
import { useAtajosTeclado } from './hooks/useAtajosTeclado';
import SeccionProductos from './componentes/SeccionProductos';
import SeccionCuentas from './componentes/SeccionCuentas';
import ModalCobro from './componentes/ModalCobro';
import ModalCliente from './componentes/ModalCliente';

// Rubros Rápidos (Códigos 1, 2, 3, 4, 5)
const RUBROS_RAPIDOS = {
  '1': 'Verdulería',
  '2': 'Carnicería',
  '3': 'Fiambrería',
  '4': 'Panadería',
  '5': 'Varios',
};

// ─── Modal: Confirmar Anular Venta (navegable con flechas) ──────────────
function ModalConfirmacionAnular({ alConfirmar, alCancelar }) {
  const [indiceFoco, setIndiceFoco] = useState(0); // 0=Cancelar, 1=Anular
  const btnCancelarRef = useRef(null);
  const btnAnularRef = useRef(null);

  useEffect(() => {
    btnCancelarRef.current?.focus();
  }, []);

  useEffect(() => {
    if (indiceFoco === 0) btnCancelarRef.current?.focus();
    else btnAnularRef.current?.focus();
  }, [indiceFoco]);

  const manejarKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      alCancelar();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      setIndiceFoco(prev => prev === 0 ? 1 : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      indiceFoco === 0 ? alCancelar() : alConfirmar();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]" onKeyDown={manejarKeyDown}>
      <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-sm p-6 shadow-xl animacion-modal">
        <h2 className="text-xl font-bold text-white mb-2">Anular Venta</h2>
        <p className="text-gray-300 mb-6">
          ¿Seguro que desea vaciar y anular toda la venta actual?
        </p>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">ESC para salir</span>
          <div className="flex gap-3">
            <button
              ref={btnCancelarRef}
              type="button"
              onClick={alCancelar}
              className={`px-4 py-2 rounded-lg transition-colors ${indiceFoco === 0
                ? 'bg-gray-600 text-white ring-2 ring-primario-500'
                : 'text-gray-400 hover:text-white'
                }`}
            >
              Cancelar
            </button>
            <button
              ref={btnAnularRef}
              type="button"
              onClick={alConfirmar}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${indiceFoco === 1
                ? 'bg-peligro text-white ring-2 ring-red-400'
                : 'bg-peligro/60 text-white hover:bg-peligro'
                }`}
            >
              Anular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Precio Variable (Rubros Rápidos — ingreso inicial) ──────────
function ModalPrecioVariable({ rubro, alGuardar, alCerrar }) {
  const [valor, setValor] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const manejarSubmit = (e) => {
    e.preventDefault();
    const precio = parseFloat(valor);
    if (!isNaN(precio) && precio > 0) alGuardar(precio);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-xl border border-primario-600 w-full max-w-sm p-6 shadow-xl animacion-modal">
        <h2 className="text-xl font-bold text-white mb-2">{rubro}</h2>
        <p className="text-gray-400 mb-4 text-sm">Ingrese el importe del artículo:</p>
        <form onSubmit={manejarSubmit}>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
            <input
              ref={inputRef}
              type="number" min="0" step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-2xl text-white focus:border-primario-500 focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">ESC para salir</span>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-primario-600 text-white font-medium rounded-lg hover:bg-primario-700">Agregar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Editar Cantidad (productos normales) ────────────────────────
function ModalEditarCantidad({ item, indice, alGuardar, alCerrar }) {
  const [valor, setValor] = useState(item ? item.cantidad.toString() : '1');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
    }, 50);
  }, []);

  const manejarSubmit = (e) => {
    e.preventDefault();
    const n = parseFloat(valor);
    if (!isNaN(n) && n >= 0) alGuardar(indice, n);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-xl border border-primario-600 w-full max-w-sm p-6 shadow-xl animacion-modal">
        <h2 className="text-xl font-bold text-white mb-2">Editar Cantidad</h2>
        <p className="text-gray-400 mb-4 text-sm truncate">Producto: {item.nombre}</p>
        <form onSubmit={manejarSubmit}>
          <input
            ref={inputRef} type="number" min="0" step="1"
            value={valor} onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-2xl text-white text-center focus:border-primario-500 focus:outline-none mb-6"
            placeholder="Ingrese cantidad"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">ESC para salir</span>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-primario-600 text-white font-medium rounded-lg hover:bg-primario-700">Guardar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Editar Precio (rubros manuales) ─────────────────────────────
function ModalEditarPrecio({ item, indice, alGuardar, alCerrar }) {
  const [valor, setValor] = useState(item ? item.precioUnitario.toString() : '');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
    }, 50);
  }, []);

  const manejarSubmit = (e) => {
    e.preventDefault();
    const p = parseFloat(valor);
    if (!isNaN(p) && p > 0) alGuardar(indice, p);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-xl border border-primario-600 w-full max-w-sm p-6 shadow-xl animacion-modal">
        <h2 className="text-xl font-bold text-white mb-2">Editar Precio</h2>
        <p className="text-gray-400 mb-4 text-sm truncate">{item.nombre}</p>
        <form onSubmit={manejarSubmit}>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
            <input
              ref={inputRef} type="number" min="0" step="0.01"
              value={valor} onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-2xl text-white focus:border-primario-500 focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600">ESC para salir</span>
            <div className="flex gap-3">
              <button type="button" onClick={alCerrar} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-primario-600 text-white font-medium rounded-lg hover:bg-primario-700">Guardar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Componente: Barra de pestañas de venta ─────────────────────────────
function BarraPestanas() {
  const pestanas = useTiendaVentas((s) => s.pestanas);
  const pestanaActivaId = useTiendaVentas((s) => s.pestanaActivaId);
  const activarPestana = useTiendaVentas((s) => s.activarPestana);
  const eliminarPestana = useTiendaVentas((s) => s.eliminarPestana);

  return (
    <div className="flex bg-gray-900 border-b border-gray-700 px-2 pt-1">
      {pestanas.map((pestana, indice) => (
        <button
          key={pestana.id}
          onClick={() => activarPestana(pestana.id)}
          className={`
            px-4 py-2 text-sm font-medium rounded-t-lg mr-1 transition-colors
            flex items-center gap-2
            ${pestana.id === pestanaActivaId ? 'pestana-activa' : 'pestana-inactiva'}
          `}
        >
          <span>Venta {indice + 1}</span>
          {pestana.items.length > 0 && (
            <span className="bg-primario-600 text-xs px-1.5 py-0.5 rounded-full">
              {pestana.items.length}
            </span>
          )}
          {pestanas.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); eliminarPestana(pestana.id); }}
              className="text-gray-500 hover:text-red-400 ml-1 text-lg leading-none"
            >
              ×
            </span>
          )}
        </button>
      ))}
      <div className="flex-1" />
      <div className="text-xs text-gray-500 self-center pr-2">F1: Nueva venta</div>
    </div>
  );
}

// ─── Componente: Vista de venta actual ──────────────────────────────────
function ContenidoVenta() {
  const pestanaActiva = useTiendaVentas((s) => s.obtenerPestanaActiva());
  const totalActivo = useTiendaVentas((s) => s.obtenerTotalActivo());
  const agregarItem = useTiendaVentas((s) => s.agregarItem);
  const decrementarCantidadItem = useTiendaVentas((s) => s.decrementarCantidadItem);
  const actualizarCantidadItem = useTiendaVentas((s) => s.actualizarCantidadItem);
  const actualizarPrecioItem = useTiendaVentas((s) => s.actualizarPrecioItem);
  const vaciarPestanaActiva = useTiendaVentas((s) => s.vaciarPestanaActiva);
  const asignarClienteVenta = useTiendaVentas((s) => s.asignarCliente);

  const inputRef = useRef(null);
  const procesandoCobroRef = useRef(false);

  const [codigoInput, setCodigoInput] = useState('');
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);

  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [indiceEditarCantidad, setIndiceEditarCantidad] = useState(null);
  const [indiceEditarPrecio, setIndiceEditarPrecio] = useState(null);
  const [rubroVariableInfo, setRubroVariableInfo] = useState(null);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [mostrandoCobro, setMostrandoCobro] = useState(false);
  const [mostrandoFiadoCliente, setMostrandoFiadoCliente] = useState(false);

  // Ref temporal para pasar el pago de efectivo hacia el modal cliente
  const cobroPendienteRef = useRef(null);

  const [imprimiendoTicket, setImprimiendoTicket] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [vueltoMostrado, setVueltoMostrado] = useState(null);

  const hayModalAbierto = indiceEditarCantidad !== null || indiceEditarPrecio !== null || rubroVariableInfo !== null || confirmandoAnular || mostrandoCobro || mostrandoFiadoCliente;

  const enfocarInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (!hayModalAbierto) enfocarInput();
  }, [enfocarInput, pestanaActiva?.id, hayModalAbierto]);

  const manejarClickContenedor = useCallback(() => {
    if (!hayModalAbierto) enfocarInput();
  }, [enfocarInput, hayModalAbierto]);

  useEffect(() => {
    if (pestanaActiva && pestanaActiva.items.length > 0) {
      if (indiceSeleccionado >= pestanaActiva.items.length) {
        setIndiceSeleccionado(Math.max(0, pestanaActiva.items.length - 1));
      }
    } else {
      setIndiceSeleccionado(0);
    }
  }, [pestanaActiva?.items.length, indiceSeleccionado, pestanaActiva]);

  useEffect(() => {
    if (errorBusqueda) {
      const timer = setTimeout(() => setErrorBusqueda(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorBusqueda]);

  // Abre el modal correcto según tipo de item
  const abrirEdicionItem = useCallback((indice) => {
    if (!pestanaActiva || !pestanaActiva.items[indice]) return;
    if (pestanaActiva.items[indice].esManual) {
      setIndiceEditarPrecio(indice);
    } else {
      setIndiceEditarCantidad(indice);
    }
  }, [pestanaActiva]);

  const buscarProducto = useCallback(async (codigo) => {
    const term = codigo.trim();
    if (!term) return;

    if (RUBROS_RAPIDOS[term]) {
      setRubroVariableInfo({ codigo: term, nombre: RUBROS_RAPIDOS[term] });
      setCodigoInput('');
      return;
    }

    setBuscando(true);
    setErrorBusqueda('');
    try {
      const producto = await window.api.productos.porCodigoBarras(term);
      if (producto) {
        agregarItem({ productoId: producto.id, nombre: producto.nombre, cantidad: 1, precioUnitario: parseFloat(producto.precio_venta), esManual: false });
        setCodigoInput('');
        setVueltoMostrado(null); // Limpiar vuelto al iniciar nueva venta
      } else {
        setErrorBusqueda(`Producto no encontrado: "${term}"`);
        setCodigoInput('');
      }
    } catch (error) {
      console.error('[Venta] Error al buscar producto:', error);
      setErrorBusqueda('Error al buscar producto');
      setCodigoInput('');
    } finally {
      setBuscando(false);
      enfocarInput();
    }
  }, [agregarItem, enfocarInput]);

  const iniciarCobro = () => {
    if (!pestanaActiva || pestanaActiva.items.length === 0) return;
    setMostrandoCobro(true);
  };

  const ejecutarCobroBD = async (metodo, clienteId = null) => {
    if (procesandoCobroRef.current) return;
    procesandoCobroRef.current = true;
    setImprimiendoTicket(true);

    try {
      await window.api.ventas.crear({
        items: pestanaActiva.items,
        usuarioId: 1, // Por ahora harcodeado, luego sale del auth
        medioPago: metodo,
        porcentajeRecargo: 0,
        clienteId: clienteId || pestanaActiva.clienteId || null,
      });
      vaciarPestanaActiva();
      setIndiceSeleccionado(0);
      setMensajeExito('Venta cerrada exitosamente');
      setTimeout(() => setMensajeExito(''), 2500);
    } catch (err) {
      console.error(err);
      setErrorBusqueda('Error al registrar venta');
    } finally {
      setImprimiendoTicket(false);
      procesandoCobroRef.current = false;
      setMostrandoCobro(false);
      setMostrandoFiadoCliente(false);
      enfocarInput();
    }
  };

  const confirmarModalCobro = (metodo, montoPaga) => {
    setMostrandoCobro(false);
    if (metodo === 'cuenta_corriente') {
      cobroPendienteRef.current = { metodo, montoPaga };
      setMostrandoFiadoCliente(true);
      setVueltoMostrado(null);
    } else {
      if (metodo === 'efectivo' && montoPaga > totalActivo) {
        setVueltoMostrado(montoPaga - totalActivo);
      } else {
        setVueltoMostrado(null);
      }
      ejecutarCobroBD(metodo);
    }
  };

  const confirmarModalFiado = (clienteId, nombre) => {
    if (!clienteId) {
      setErrorBusqueda('No se pudo asignar el cliente a la venta');
      setMostrandoFiadoCliente(false);
      return;
    }
    asignarClienteVenta(clienteId, nombre);
    ejecutarCobroBD('cuenta_corriente', clienteId);
  };

  const manejarKeyDown = useCallback((e) => {
    if (imprimiendoTicket) { e.preventDefault(); return; }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (codigoInput.trim()) {
        buscarProducto(codigoInput);
      } else if (pestanaActiva && pestanaActiva.items.length > 0) {
        abrirEdicionItem(indiceSeleccionado);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSeleccionado(prev => pestanaActiva ? Math.min(prev + 1, Math.max(0, pestanaActiva.items.length - 1)) : prev);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSeleccionado(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (pestanaActiva && pestanaActiva.items.length > 0) {
        decrementarCantidadItem(pestanaActiva.id, indiceSeleccionado);
      }
    }
  }, [codigoInput, buscarProducto, pestanaActiva, indiceSeleccionado, decrementarCantidadItem, imprimiendoTicket, abrirEdicionItem]);

  useEffect(() => {
    const manejarAtajosVenta = (e) => {
      if (e.key === 'F3') { e.preventDefault(); iniciarCobro(); }
      else if (e.key === 'F5') {
        e.preventDefault();
        if (pestanaActiva && pestanaActiva.items.length > 0) setConfirmandoAnular(true);
      }
    };
    document.addEventListener('keydown', manejarAtajosVenta);
    return () => document.removeEventListener('keydown', manejarAtajosVenta);
  }, [pestanaActiva]);

  if (!pestanaActiva) return null;

  return (
    <div className="flex flex-1 overflow-hidden relative" onClick={manejarClickContenedor}>
      {imprimiendoTicket && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-primario-600 p-8 rounded-xl shadow-2xl text-center animacion-modal">
            <h2 className="text-3xl font-bold text-white mb-4">Procesando venta...</h2>
            <div className="w-16 h-16 border-4 border-primario-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      )}

      {mostrandoCobro && (
        <ModalCobro
          total={totalActivo}
          onConfirmar={confirmarModalCobro}
          onCerrar={() => setMostrandoCobro(false)}
        />
      )}

      {mostrandoFiadoCliente && (
        <ModalCliente
          onConfirmar={confirmarModalFiado}
          onCerrar={() => {
            setMostrandoFiadoCliente(false);
            setMostrandoCobro(true); // Vuelve al modal anterior
          }}
        />
      )}

      {indiceEditarCantidad !== null && pestanaActiva.items[indiceEditarCantidad] && (
        <ModalEditarCantidad
          item={pestanaActiva.items[indiceEditarCantidad]}
          indice={indiceEditarCantidad}
          alGuardar={(i, c) => { actualizarCantidadItem(pestanaActiva.id, i, c); setIndiceEditarCantidad(null); }}
          alCerrar={() => setIndiceEditarCantidad(null)}
        />
      )}

      {indiceEditarPrecio !== null && pestanaActiva.items[indiceEditarPrecio] && (
        <ModalEditarPrecio
          item={pestanaActiva.items[indiceEditarPrecio]}
          indice={indiceEditarPrecio}
          alGuardar={(i, p) => { actualizarPrecioItem(pestanaActiva.id, i, p); setIndiceEditarPrecio(null); }}
          alCerrar={() => setIndiceEditarPrecio(null)}
        />
      )}

      {rubroVariableInfo !== null && (
        <ModalPrecioVariable
          rubro={rubroVariableInfo.nombre}
          alGuardar={(precio) => {
            agregarItem({ productoId: `manual-${Date.now()}`, nombre: rubroVariableInfo.nombre, cantidad: 1, precioUnitario: precio, esManual: true });
            setRubroVariableInfo(null);
          }}
          alCerrar={() => setRubroVariableInfo(null)}
        />
      )}

      {confirmandoAnular && (
        <ModalConfirmacionAnular
          alConfirmar={() => {
            vaciarPestanaActiva(); setIndiceSeleccionado(0); setConfirmandoAnular(false);
            setMensajeExito('Venta anulada correctamente'); setTimeout(() => setMensajeExito(''), 2500);
          }}
          alCancelar={() => setConfirmandoAnular(false)}
        />
      )}

      <div className="flex-1 flex flex-col p-4">
        <div className="mb-4">
          <div className="relative">
            <input
              ref={inputRef} type="text" value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value)}
              onKeyDown={manejarKeyDown}
              className="w-full bg-gray-800 border-2 border-primario-600 rounded-lg px-4 py-3 text-lg text-white focus:border-primario-400 focus:outline-none focus:ring-2 focus:ring-primario-400/30 placeholder:text-gray-500"
              placeholder="Escanear producto, tipear código, o rubro (1, 2, 3, 4)..."
              autoComplete="off" spellCheck="false"
            />
            {buscando && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm animate-pulse">Buscando...</span>}
          </div>
          {errorBusqueda && (
            <div className="mt-2 px-4 py-2 bg-peligro/10 border border-peligro/30 rounded-lg text-peligro text-sm font-bold">{errorBusqueda}</div>
          )}
          {mensajeExito && (
            <div className="mt-2 px-4 py-2 bg-exito/10 border border-exito/30 rounded-lg text-exito text-sm font-bold">{mensajeExito}</div>
          )}
        </div>

        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-gray-200">Items de Venta</h2>
          {pestanaActiva.clienteNombre && (
            <span className="text-sm bg-primario-800 text-primario-200 px-3 py-1 rounded">Cliente: {pestanaActiva.clienteNombre}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {pestanaActiva.items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p>Escanee un producto o tipee su código arriba</p>
                <p className="text-xs text-gray-600 mt-1">El lector envía el código automáticamente</p>
              </div>
            </div>
          ) : (
            <table className="w-full select-none">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-left text-sm text-gray-400">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3 text-right">Cant.</th>
                  <th className="py-2 px-3 text-right">P. Unit.</th>
                  <th className="py-2 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {pestanaActiva.items.map((item, indice) => {
                  const sel = indice === indiceSeleccionado;
                  return (
                    <tr key={indice}
                      onDoubleClick={() => abrirEdicionItem(indice)}
                      className={`border-b border-gray-700 transition-colors cursor-pointer ${sel ? 'bg-primario-800' : 'hover:bg-gray-800'}`}
                    >
                      <td className={`py-2 px-3 ${sel ? 'text-gray-300' : 'text-gray-500'}`}>{indice + 1}</td>
                      <td className="py-2 px-3">{item.nombre}</td>
                      <td className="py-2 px-3 text-right font-medium">{item.cantidad}</td>
                      <td className="py-2 px-3 text-right">${item.precioUnitario.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-bold">${item.subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="w-72 bg-gray-800 border-l border-gray-700 p-4 flex flex-col">
        <div className="flex-1">
          <h3 className="text-sm text-gray-400 mb-1">TOTAL</h3>
          <p className="text-4xl font-bold text-exito">${totalActivo.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-1">{pestanaActiva.items.length} item{pestanaActiva.items.length !== 1 ? 's' : ''}</p>
          {vueltoMostrado !== null && (
            <div className="mt-4 bg-gray-900 border border-alerta/30 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">VUELTO A ENTREGAR</p>
              <p className="text-3xl font-black text-alerta">${vueltoMostrado.toFixed(2)}</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5 text-xs text-gray-400">
            <p className="font-bold text-gray-300 mb-1 border-b border-gray-700 pb-1">Rubros:</p>
            <p><span className="font-bold text-white px-1">1</span> Verdulería</p>
            <p><span className="font-bold text-white px-1">2</span> Carnicería</p>
            <p><span className="font-bold text-white px-1">3</span> Fiambrería</p>
            <p><span className="font-bold text-white px-1">4</span> Panadería</p>
            <p><span className="font-bold text-white px-1">5</span> Varios</p>
          </div>
          <div className="space-y-1.5 text-xs text-gray-400 mt-4">
            <p className="font-bold text-gray-300 mb-1 border-b border-gray-700 pb-1">Atajos rápidos:</p>
            <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">F3</kbd> Cobrar Venta</p>
            <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">F5</kbd> Anular Venta</p>
            <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">F4</kbd> Buscar Producto</p>
            <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">SUPR</kbd> Restar item</p>
            <p><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">ENTER</kbd> Editar cant./precio</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder para secciones pendientes ──────────────────────────────
function SeccionPlaceholder({ titulo, tecla }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-gray-500">
        <h2 className="text-xl font-bold text-gray-300 mb-2">{titulo}</h2>
        <p className="text-sm">Sección en desarrollo</p>
        <p className="text-xs mt-2"><kbd className="bg-gray-700 px-2 py-1 rounded text-gray-300">{tecla}</kbd></p>
      </div>
    </div>
  );
}

// ─── Barra de estado inferior ───────────────────────────────────────────
function BarraEstado() {
  const estadoImpresora = useTiendaApp((s) => s.estadoImpresora);
  const estadoEnergia = useTiendaApp((s) => s.estadoEnergia);
  const usuarioActual = useTiendaApp((s) => s.usuarioActual);
  const [ultimoBackup, setUltimoBackup] = useState('...');

  useEffect(() => {
    if (window.api && window.api.sistema.obtenerUltimoBackup) {
      window.api.sistema.obtenerUltimoBackup().then(setUltimoBackup).catch(() => { });
      const intervalo = setInterval(() => {
        window.api.sistema.obtenerUltimoBackup().then(setUltimoBackup).catch(() => { });
      }, 60000);
      return () => clearInterval(intervalo);
    }
  }, []);

  const ii = { 'conectado': { color: 'bg-exito', texto: 'Impresora OK' }, 'desconectado': { color: 'bg-peligro', texto: 'Impresora desconectada' }, 'sin-configurar': { color: 'bg-alerta', texto: 'Sin impresora' }, 'error': { color: 'bg-peligro', texto: 'Error impresora' }, 'desconocido': { color: 'bg-gray-500', texto: 'Impresora: ...' } }[estadoImpresora] || { color: 'bg-gray-500', texto: '?' };
  const ie = { 'en-red': { color: 'bg-exito', texto: '[RED]' }, 'en-bateria': { color: 'bg-alerta animate-pulse', texto: '[BATERIA]' }, 'apagando': { color: 'bg-peligro animate-pulse', texto: '[APAGANDO]' }, 'suspendido': { color: 'bg-alerta', texto: '[SUSPENDIDO]' } }[estadoEnergia] || { color: 'bg-gray-500', texto: '[?]' };

  return (
    <div className="flex items-center justify-between bg-gray-900 border-t border-gray-700 px-4 py-1.5 text-xs text-gray-400">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${ii.color}`} />{ii.texto}</span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${ie.color}`} />{ie.texto}</span>
        <span className="flex items-center gap-1.5 ml-2 border-l border-gray-700 pl-4">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
          Último backup: <strong className="text-gray-300">{ultimoBackup}</strong>
        </span>
      </div>
      <div className="flex items-center gap-4">
        {usuarioActual && <span>{usuarioActual.nombreUsuario} ({usuarioActual.rol})</span>}
        <span className="text-gray-600">El Rincón del Gato v1.0.0</span>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL APP
// ============================================================================
export default function App() {
  const seccionActiva = useTiendaApp((s) => s.seccionActiva);
  const setEstadoEnergia = useTiendaApp((s) => s.setEstadoEnergia);
  const forzarGuardado = useTiendaVentas((s) => s.forzarGuardado);
  useAtajosTeclado();

  useEffect(() => {
    if (!window.api?.alCambiarEnergia) return;
    const limpiar = window.api.alCambiarEnergia((estado) => {
      setEstadoEnergia(estado);
      if (estado === 'en-bateria' || estado === 'apagando' || estado === 'suspendido') forzarGuardado();
    });
    return limpiar;
  }, [setEstadoEnergia, forzarGuardado]);

  useEffect(() => {
    const estado = useTiendaVentas.getState();
    if (!estado.pestanaActivaId && estado.pestanas.length > 0) estado.activarPestana(estado.pestanas[0].id);
  }, []);

  const renderizarSeccion = () => {
    switch (seccionActiva) {
      case SECCIONES.VENTAS: return (<><BarraPestanas /><ContenidoVenta /></>);
      case SECCIONES.CUENTAS_CORRIENTES: return <SeccionCuentas />;
      case SECCIONES.PRODUCTOS: return <SeccionProductos />;
      case SECCIONES.CIERRE_CAJA: return <SeccionPlaceholder titulo="Cierre de Caja" tecla="F9" />;
      case SECCIONES.REPORTES: return <SeccionPlaceholder titulo="Reportes" tecla="F10" />;
      default: return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex items-center bg-gray-800 border-b border-gray-700 px-4 py-2">
        <h1 className="text-sm font-bold text-primario-400 mr-6">El Rincón del Gato</h1>
        <nav className="flex gap-1 text-xs">
          {[
            { seccion: SECCIONES.VENTAS, label: 'Ventas', tecla: 'F1' },
            { seccion: SECCIONES.CUENTAS_CORRIENTES, label: 'Cuentas', tecla: 'F2' },
            { seccion: SECCIONES.PRODUCTOS, label: 'Productos', tecla: 'F4' },
            { seccion: SECCIONES.CIERRE_CAJA, label: 'Caja', tecla: 'F9' },
            { seccion: SECCIONES.REPORTES, label: 'Reportes', tecla: 'F10' },
          ].map(({ seccion, label, tecla }) => (
            <button key={seccion} onClick={() => useTiendaApp.getState().irASeccion(seccion)}
              className={`px-3 py-1.5 rounded transition-colors ${seccionActiva === seccion ? 'bg-primario-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              <kbd className="text-gray-500 mr-1">{tecla}</kbd>{label}
            </button>
          ))}
        </nav>
      </div>
      <main className="flex-1 flex flex-col overflow-hidden">{renderizarSeccion()}</main>
      <BarraEstado />
    </div>
  );
}
