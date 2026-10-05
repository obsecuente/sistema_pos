// ============================================================================
// PRINCIPAL.JS — Entry point del proceso principal de Electron
//
// Responsabilidades:
//   1. Crear BrowserWindow con seguridad IPC (contextIsolation, sandbox)
//   2. Inicializar pool MySQL
//   3. Registrar manejadores IPC
//   4. Lanzar worker de hardware como child_process
//   5. Monitorear energía (UPS) con powerMonitor
//   6. Configurar auto-updater
// ============================================================================

const { app, BrowserWindow, powerMonitor } = require('electron');
const path = require('path');
const { fork } = require('child_process');
require('dotenv').config();

const { inicializarPool, cerrarPool } = require('./baseDatos');
const { registrarManejadoresIpc, setWorkerHardware } = require('./manejadoresIpc');

// ─── Estado de la aplicación ───────────────────────────────────────────
/** @type {BrowserWindow|null} */
let ventanaPrincipal = null;

/** @type {import('child_process').ChildProcess|null} */
let workerHardware = null;

// ============================================================================
// CREAR VENTANA PRINCIPAL
// ============================================================================

function crearVentanaPrincipal() {
  ventanaPrincipal = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  1024,
    minHeight: 600,
    title: 'El Rincón del Gato — Sistema POS',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,  // Ocultar menú de Electron (el usuario usa F-keys)

    webPreferences: {
      // ─── Seguridad IPC estricta ───────────────────────────────
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // Aislamiento total entre main y renderer
      nodeIntegration:  false,     // React NO puede usar require() ni APIs de Node
      sandbox:          true,      // Sandbox del renderer
      // ─────────────────────────────────────────────────────────
      devTools: !app.isPackaged,   // Solo en desarrollo
    },
  });

  // En desarrollo, cargar desde Vite dev server
  if (!app.isPackaged) {
    ventanaPrincipal.loadURL('http://localhost:5173');
    ventanaPrincipal.webContents.openDevTools({ mode: 'detach' });
  } else {
    // En producción, cargar el build estático
    ventanaPrincipal.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  ventanaPrincipal.on('closed', () => {
    ventanaPrincipal = null;
  });

  // Maximizar al arrancar (POS de mostrador, pantalla completa útil)
  ventanaPrincipal.maximize();

  console.log('[App] Ventana principal creada');
}


// ============================================================================
// WORKER DE HARDWARE (child_process)
// ============================================================================

function iniciarWorkerHardware() {
  const rutaWorker = path.join(__dirname, 'workers', 'workerHardware.js');

  workerHardware = fork(rutaWorker, [], {
    env: {
      ...process.env,
      TICKETERA_IP:     process.env.TICKETERA_IP || '',
      TICKETERA_PUERTO: process.env.TICKETERA_PUERTO || '9100',
    },
    silent: false,  // Hereda stdout/stderr para logging
  });

  workerHardware.on('error', (error) => {
    console.error('[App] Error en worker de hardware:', error.message);
  });

  workerHardware.on('exit', (codigo) => {
    console.warn(`[App] Worker de hardware terminó con código ${codigo}`);
    // Reiniciar si terminó inesperadamente
    if (codigo !== 0) {
      console.log('[App] Reiniciando worker de hardware en 3 segundos...');
      setTimeout(() => iniciarWorkerHardware(), 3000);
    }
  });

  // Conectar el worker con los manejadores IPC
  setWorkerHardware(workerHardware);

  console.log('[App] Worker de hardware iniciado');
}


// ============================================================================
// MONITOREO DE ENERGÍA (UPS)
// ============================================================================

function configurarMonitorEnergia() {
  // Electron requiere que la app esté lista para usar powerMonitor
  powerMonitor.on('on-battery', () => {
    console.warn('[Energía] ⚠ Cambio a batería detectado (UPS activo)');
    enviarEventoEnergia('en-bateria');
  });

  powerMonitor.on('on-ac', () => {
    console.log('[Energía] ✓ Energía de red restaurada');
    enviarEventoEnergia('en-red');
  });

  powerMonitor.on('shutdown', () => {
    console.warn('[Energía] ⚠ Apagado del sistema detectado');
    enviarEventoEnergia('apagando');
  });

  powerMonitor.on('suspend', () => {
    console.warn('[Energía] ⚠ Suspensión del sistema detectada');
    enviarEventoEnergia('suspendido');
  });

  console.log('[App] Monitor de energía configurado');
}

/**
 * Envía evento de cambio de energía al renderer para que Zustand persista.
 * @param {string} estado - 'en-bateria' | 'en-red' | 'apagando' | 'suspendido'
 */
function enviarEventoEnergia(estado) {
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
    const { CANALES } = require('../compartido/canalesIpc');
    ventanaPrincipal.webContents.send(CANALES.ENERGIA_CAMBIO_ESTADO, estado);
  }
}


// ============================================================================
// AUTO-UPDATER (electron-updater)
// ============================================================================

function configurarAutoUpdater() {
  // Solo en producción
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log(`[Updater] Actualización disponible: v${info.version}`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[Updater] Actualización descargada: v${info.version}`);
      // No reiniciar automáticamente si hay ventas activas
      // Por ahora, se instala al cerrar la app
    });

    autoUpdater.on('error', (error) => {
      console.error('[Updater] Error:', error.message);
    });

    // Verificar actualizaciones cada 4 horas
    autoUpdater.checkForUpdates();
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 4 * 60 * 60 * 1000);

    console.log('[App] Auto-updater configurado');
  } catch (error) {
    console.error('[App] Error al configurar auto-updater:', error.message);
  }
}


// ============================================================================
// CICLO DE VIDA DE LA APLICACIÓN
// ============================================================================

app.whenReady().then(async () => {
  try {
    // 1. Inicializar base de datos
    inicializarPool();

    // 2. Registrar manejadores IPC
    registrarManejadoresIpc();

    // 3. Crear ventana principal
    crearVentanaPrincipal();

    // 4. Iniciar worker de hardware
    iniciarWorkerHardware();

    // 5. Configurar monitor de energía (UPS)
    configurarMonitorEnergia();

    // 6. Configurar auto-updater
    configurarAutoUpdater();

    console.log('[App] ═══════════════════════════════════════════');
    console.log('[App]   EL RINCÓN DEL GATO — Sistema POS');
    console.log('[App]   Listo para operar');
    console.log('[App] ═══════════════════════════════════════════');

  } catch (error) {
    console.error('[App] Error fatal al iniciar:', error);
    app.quit();
  }
});

// macOS: re-crear ventana si se clickea el dock sin ventanas abiertas
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    crearVentanaPrincipal();
  }
});

// Cerrar todo limpiamente
app.on('window-all-closed', async () => {
  // Terminar worker de hardware
  if (workerHardware) {
    workerHardware.kill();
    workerHardware = null;
  }

  // Cerrar pool de base de datos
  await cerrarPool();

  // En Windows/Linux, cerrar la app cuando se cierran todas las ventanas
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Seguridad: prevenir navegación a URLs externas
app.on('web-contents-created', (_evento, contenido) => {
  contenido.on('will-navigate', (eventoNav) => {
    eventoNav.preventDefault();
  });

  contenido.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
