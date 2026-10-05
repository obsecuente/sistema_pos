// ============================================================================
// useLectorCodigoBarras — Hook de React para desacoplar escáner de teclado
//
// La lectora Gadnic USB HID emula un teclado físico y envía caracteres
// a velocidad de máquina (Δt < 30ms entre teclas).
//
// Algoritmo de desacople por intervalo de tiempo (Δt):
//   1. Listener global en 'keydown' (fase captura, prioridad máxima)
//   2. Si Δt entre teclas < 30ms → entrada de escáner → capturar en búfer
//   3. Si Δt > 100ms → tipeo manual → resetear búfer
//   4. Al recibir 'Enter' con búfer >= 6 caracteres → disparar búsqueda
//
// El hook usa useRef para el búfer y timestamps → cero re-renders.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';

// ─── Constantes del algoritmo ──────────────────────────────────────────
const UMBRAL_ESCANER_MS = 30;     // Δt máximo entre teclas para clasificar como escáner
const UMBRAL_MANUAL_MS  = 100;    // Δt mínimo para considerar tipeo manual
const LARGO_MINIMO      = 6;      // Largo mínimo del código para disparar búsqueda

/**
 * Hook para capturar lecturas del escáner de código de barras USB HID.
 *
 * @param {object} opciones
 * @param {(codigoBarras: string) => void} opciones.alEscanear
 *   Callback ejecutado cuando se detecta un código de barras completo.
 * @param {boolean} [opciones.activo=true]
 *   Permite desactivar la captura temporalmente (ej: cuando hay un modal de input abierto).
 *
 * @example
 * useLectorCodigoBarras({
 *   alEscanear: (codigo) => {
 *     console.log('Código escaneado:', codigo);
 *     window.api.productos.porCodigoBarras(codigo);
 *   },
 *   activo: !modalAbierto,
 * });
 */
export function useLectorCodigoBarras({ alEscanear, activo = true }) {
  // Refs para evitar re-renders — el búfer y el timestamp viven fuera del ciclo de React
  const bufer        = useRef('');
  const ultimaTecla  = useRef(0);
  const callbackRef  = useRef(alEscanear);

  // Mantener la referencia al callback actualizada sin causar re-mount del listener
  useEffect(() => {
    callbackRef.current = alEscanear;
  }, [alEscanear]);

  // Función para procesar el búfer cuando se recibe Enter
  const procesarBufer = useCallback(() => {
    const codigo = bufer.current.trim();
    if (codigo.length >= LARGO_MINIMO) {
      callbackRef.current(codigo);
    }
    bufer.current = '';
  }, []);

  useEffect(() => {
    if (!activo) return;

    /**
     * Listener en fase de CAPTURA (tercer argumento = true).
     * Esto garantiza que interceptamos ANTES que cualquier otro listener
     * de React o del DOM procese la tecla.
     */
    const manejarTecla = (evento) => {
      const ahora = Date.now();
      const deltaT = ahora - ultimaTecla.current;
      ultimaTecla.current = ahora;

      // ─── Ignorar teclas modificadoras y de función ─────────────
      // Las teclas F1-F12 son atajos del sistema, no del escáner
      if (evento.key.startsWith('F') && evento.key.length <= 3) return;
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (evento.key === 'Shift' || evento.key === 'Control' || evento.key === 'Alt') return;

      // ─── Detectar Enter → procesar búfer ──────────────────────
      if (evento.key === 'Enter') {
        if (bufer.current.length >= LARGO_MINIMO) {
          // Es una lectura completa del escáner
          evento.preventDefault();
          evento.stopPropagation();
          procesarBufer();
        }
        // Si el búfer es muy corto, es un Enter manual del operador → dejar pasar
        return;
      }

      // ─── Clasificar por intervalo de tiempo ───────────────────
      if (deltaT < UMBRAL_ESCANER_MS) {
        // Velocidad de máquina → capturar como escáner
        evento.preventDefault();
        evento.stopPropagation();
        bufer.current += evento.key;
      } else if (deltaT > UMBRAL_MANUAL_MS) {
        // Velocidad humana → resetear búfer, primera tecla de posible nuevo escaneo
        bufer.current = evento.key;
      } else {
        // Zona gris (30-100ms) → agregar al búfer por seguridad
        bufer.current += evento.key;
      }
    };

    // Registrar en fase de captura (true) para máxima prioridad
    document.addEventListener('keydown', manejarTecla, true);

    return () => {
      document.removeEventListener('keydown', manejarTecla, true);
      bufer.current = '';
      ultimaTecla.current = 0;
    };
  }, [activo, procesarBufer]);
}

export default useLectorCodigoBarras;
