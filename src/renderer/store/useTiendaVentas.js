// ============================================================================
// useTiendaVentas — Store Zustand para ventas concurrentes con pestañas
//
// Características:
//   • Múltiples pestañas de venta simultáneas (array de SaleTab)
//   • Solo la pestaña activa se monta en el DOM (< 50 KB por tab en RAM)
//   • Persistencia automática a disco via IPC (protección ante cortes de luz)
//   • Flush de emergencia al recibir evento 'on-battery' del UPS
// ============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Generador de IDs únicos para pestañas ─────────────────────────────
let contadorPestana = 0;
function generarIdPestana() {
  contadorPestana++;
  return `venta-${Date.now()}-${contadorPestana}`;
}

/**
 * Crea una pestaña de venta nueva con estado inicial limpio.
 * @returns {object} Pestaña de venta
 */
function crearPestanaVacia() {
  return {
    id:         generarIdPestana(),
    items:      [],           // Array de { productoId, nombre, cantidad, precioUnitario, subtotal, esManual }
    clienteId:  null,         // null = venta anónima
    clienteNombre: null,
    estado:     'abierta',    // 'abierta' | 'cobrada' | 'cancelada'
    creadaEn:   new Date().toISOString(),
  };
}

// ============================================================================
// STORAGE ADAPTER — Persiste el estado a disco via IPC (no localStorage)
// ============================================================================

/**
 * Adaptador de almacenamiento que usa window.api para escribir/leer
 * del disco local a través del proceso principal de Electron.
 * Esto es más seguro que localStorage y sobrevive a crashes.
 */
const almacenamientoDisco = {
  getItem: async (nombre) => {
    try {
      const datos = await window.api.sistema.recuperarEstado();
      return datos || null;
    } catch (error) {
      console.error('[TiendaVentas] Error al recuperar estado:', error);
      return null;
    }
  },

  setItem: async (nombre, valor) => {
    try {
      await window.api.sistema.persistirEstado(valor);
    } catch (error) {
      console.error('[TiendaVentas] Error al persistir estado:', error);
    }
  },

  removeItem: async (nombre) => {
    try {
      await window.api.sistema.persistirEstado(null);
    } catch (error) {
      console.error('[TiendaVentas] Error al limpiar estado:', error);
    }
  },
};


// ============================================================================
// STORE PRINCIPAL
// ============================================================================

const useTiendaVentas = create(
  persist(
    (set, get) => ({
      // ─── Estado ──────────────────────────────────────────────────
      pestanas:         [crearPestanaVacia()],  // Al menos una pestaña siempre
      pestanaActivaId:  null,                   // Se setea en init

      // ─── Getters derivados ───────────────────────────────────────

      /** Obtiene la pestaña activa actual */
      obtenerPestanaActiva: () => {
        const { pestanas, pestanaActivaId } = get();
        return pestanas.find(p => p.id === pestanaActivaId) || pestanas[0] || null;
      },

      /** Calcula el total de la pestaña activa */
      obtenerTotalActivo: () => {
        const pestana = get().obtenerPestanaActiva();
        if (!pestana) return 0;
        return pestana.items.reduce((suma, item) => suma + item.subtotal, 0);
      },

      // ─── Acciones de Pestañas ────────────────────────────────────

      /** Crear nueva pestaña de venta (F1) */
      agregarPestana: () => {
        const nueva = crearPestanaVacia();
        set((estado) => ({
          pestanas:        [...estado.pestanas, nueva],
          pestanaActivaId: nueva.id,
        }));
      },

      /** Eliminar una pestaña (tras cobrar o cancelar) */
      eliminarPestana: (pestanaId) => {
        set((estado) => {
          const filtradas = estado.pestanas.filter(p => p.id !== pestanaId);
          // Si no quedan pestañas, crear una nueva
          if (filtradas.length === 0) {
            const nueva = crearPestanaVacia();
            return {
              pestanas:        [nueva],
              pestanaActivaId: nueva.id,
            };
          }
          // Si se eliminó la activa, activar la primera disponible
          const nuevaActiva = estado.pestanaActivaId === pestanaId
            ? filtradas[filtradas.length - 1].id
            : estado.pestanaActivaId;
          return {
            pestanas:        filtradas,
            pestanaActivaId: nuevaActiva,
          };
        });
      },

      /** Cambiar a otra pestaña */
      activarPestana: (pestanaId) => {
        set({ pestanaActivaId: pestanaId });
      },

      // ─── Acciones sobre Items ────────────────────────────────────

      /** Agregar un producto a la pestaña activa */
      agregarItem: (item) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;

            // Si el producto ya existe y no es manual, sumar cantidad
            const existente = p.items.findIndex(
              i => i.productoId === item.productoId && !i.esManual && !item.esManual
            );

            if (existente !== -1) {
              const itemsActualizados = [...p.items];
              const itemExistente = { ...itemsActualizados[existente] };
              itemExistente.cantidad += item.cantidad;
              itemExistente.subtotal = itemExistente.cantidad * itemExistente.precioUnitario;
              itemsActualizados[existente] = itemExistente;
              return { ...p, items: itemsActualizados };
            }

            // Nuevo item
            return {
              ...p,
              items: [...p.items, {
                ...item,
                subtotal: item.cantidad * item.precioUnitario,
              }],
            };
          }),
        }));
      },

      decrementarCantidadItem: (pestanaId, indiceItem) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== pestanaId) return p;

            const itemsActualizados = [...p.items];
            const itemObj = itemsActualizados[indiceItem];
            if (itemObj) {
              if (itemObj.cantidad > 1) {
                itemsActualizados[indiceItem] = {
                  ...itemObj,
                  cantidad: itemObj.cantidad - 1,
                  subtotal: (itemObj.cantidad - 1) * itemObj.precioUnitario
                };
              } else {
                itemsActualizados.splice(indiceItem, 1);
              }
            }
            return { ...p, items: itemsActualizados };
          })
        }));
      },

      actualizarCantidadItem: (pestanaId, indiceItem, nuevaCantidad) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== pestanaId) return p;

            const itemsActualizados = [...p.items];
            const itemObj = itemsActualizados[indiceItem];
            if (itemObj) {
              if (nuevaCantidad <= 0) {
                itemsActualizados.splice(indiceItem, 1);
              } else {
                itemsActualizados[indiceItem] = {
                  ...itemObj,
                  cantidad: nuevaCantidad,
                  subtotal: nuevaCantidad * itemObj.precioUnitario
                };
              }
            }
            return { ...p, items: itemsActualizados };
          })
        }));
      },

      actualizarPrecioItem: (pestanaId, indiceItem, nuevoPrecio) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== pestanaId) return p;

            const itemsActualizados = [...p.items];
            const itemObj = itemsActualizados[indiceItem];
            if (itemObj && nuevoPrecio > 0) {
              itemsActualizados[indiceItem] = {
                ...itemObj,
                precioUnitario: nuevoPrecio,
                subtotal: itemObj.cantidad * nuevoPrecio
              };
            }
            return { ...p, items: itemsActualizados };
          })
        }));
      },

      vaciarPestanaActiva: () => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;
            return { ...p, items: [], clienteId: null, clienteNombre: null };
          })
        }));
      },

      /** Quitar un item de la pestaña activa por índice (F8) */
      quitarItem: (indice) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;
            return {
              ...p,
              items: p.items.filter((_, i) => i !== indice),
            };
          }),
        }));
      },

      /** Actualizar la cantidad de un item */
      actualizarCantidad: (indice, nuevaCantidad) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;
            const itemsActualizados = [...p.items];
            const item = { ...itemsActualizados[indice] };
            item.cantidad = nuevaCantidad;
            item.subtotal = nuevaCantidad * item.precioUnitario;
            itemsActualizados[indice] = item;
            return { ...p, items: itemsActualizados };
          }),
        }));
      },

      /** Asignar un cliente a la pestaña activa (para fiado) */
      asignarCliente: (clienteId, clienteNombre) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;
            return { ...p, clienteId, clienteNombre };
          }),
        }));
      },

      /** Limpiar todos los items de la pestaña activa */
      limpiarPestana: () => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== estado.pestanaActivaId) return p;
            return { ...p, items: [], clienteId: null, clienteNombre: null };
          }),
        }));
      },

      /** Marcar pestaña como cobrada */
      marcarCobrada: (pestanaId) => {
        set((estado) => ({
          pestanas: estado.pestanas.map(p => {
            if (p.id !== pestanaId) return p;
            return { ...p, estado: 'cobrada' };
          }),
        }));
      },

      // ─── Persistencia de Emergencia (UPS) ────────────────────────

      /** Fuerza un guardado inmediato a disco. Llamado por evento de UPS. */
      forzarGuardado: () => {
        // persist middleware expone api.persist
        const estadoActual = JSON.stringify({
          state: {
            pestanas:        get().pestanas,
            pestanaActivaId: get().pestanaActivaId,
          },
        });
        // Guardado sincrónico de emergencia via IPC
        window.api.sistema.persistirEstado(estadoActual);
        console.log('[TiendaVentas] Guardado de emergencia ejecutado (evento UPS)');
      },
    }),

    // ─── Configuración del middleware persist ─────────────────────────
    {
      name: 'ventas-en-curso',
      storage: almacenamientoDisco,
      // Solo persistir estas propiedades (no funciones)
      partialize: (estado) => ({
        pestanas:        estado.pestanas,
        pestanaActivaId: estado.pestanaActivaId,
      }),
    }
  )
);

export default useTiendaVentas;
