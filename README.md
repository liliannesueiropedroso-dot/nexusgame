# NEXUS GAME ENGINE · Versión 1.0

Motor y editor visual de videojuegos 2D profesional ejecutado íntegramente en local en el navegador con **React**, **TypeScript**, **Vite**, **PixiJS 8.23.0**, **Web Audio API**, **IndexedDB** y **JSZip**.

Funciona **100 % offline**, sin inteligencia artificial externa, sin cuentas de usuario, sin servidores remotos obligatorios y sin `eval()` ni generación de código arbitrario.

---

## Arquitectura de 4 Sistemas Independientes

1. **NEXUS EDITOR (`src/components/`, `src/history/`, `src/storage/`)**
   - Gestor de proyectos local persistido en **IndexedDB**.
   - Árbol jerárquico de escena, capas, visibilidad, bloqueo y reordenamiento.
   - Biblioteca de recursos multimedia: imágenes (`PNG`, `JPG`, `WebP`, `SVG`) y audio local (`WAV`, `MP3`, `OGG`).
   - Lienzo interactivo **PixiJS v8** acelerado por GPU con cámara (zoom/paneo), reglas graduadas, cuadrícula con ajuste (*snap*), gizmos visuales (mover, escalar, rotar) y **Pincel de Tiles (`B`)**.
   - Dock inferior colapsable con **Mecánicas**, **Variables**, **Audio (Web Audio API)** y **Diagnóstico**.
   - Deshacer/Rehacer multinivel (`Ctrl+Z` / `Ctrl+Y`) y autoguardado automático.

2. **NEXUS RUNTIME (`src/engine/`)**
   - Simulador determinista a 60 Hz independiente de la interfaz React.
   - Comportamientos integrados: `player_platformer`, `player_topdown`, `solid`, `patrol`, `chase_player` (IA de persecución), `spin`, `collectible`.
   - Sistema de animación por spritesheet vinculado automáticamente al movimiento (`linkToMovement`: `idle` / `walk` / `jump`).
   - Motor de reglas estructuradas (`GameMechanic`: **CUANDO** disparador → **SI SE CUMPLE** condiciones → **ENTONCES EJECUTAR** acciones en orden).
   - Evaluador seguro de expresiones matemáticas y comparaciones sin `eval()`.
   - Motor de audio **Web Audio API** con canales independientes (`Master`, `Music`, `SFX`, `UI`), decodificación de archivos locales y efectos sintetizados integrados (`coin`, `jump`, `hit`, `powerup`, `step`, `win`).
   - Ráfagas de partículas 2D y sacudida de cámara (`camera.shake`).

3. **NEXUS MECHANIC ASSISTANT (`src/assistant/`)**
   - **100 % local y determinista (cero IA)**. No es dependencia de ejecución del juego final.
   - Catálogo estructurado de mecánicas reutilizables aplicadas en 1 clic.
   - Buscador semántico en español con normalización de acentos y sinónimos (ej. *"quiero que mi personaje siga al jugador"*, *"vincular animación de caminar"*).
   - Motor de recomendaciones contextuales según el objeto seleccionado y la escena.
   - Analizador estático de diagnóstico que detecta animaciones sin vincular, sprites sin recurso, exceso de fotogramas, controladores contradictorios, falta de suelo sólido, variables sin declarar y reglas rotas, con botones de **corrección automática en 1 clic**.

4. **NEXUS PROJECT FORMAT & HTML5 COMPILER (`src/project/`, `src/export/`)**
   - Exportación e importación de proyectos editables completos (`.nexus.zip` con `project.json` + carpeta `assets/`).
   - Compilador autónomo **HTML5** que genera un `.zip` listo para publicar con `index.html`, `css/style.css`, `js/pixi.min.js`, `js/nexus-runtime.js`, `js/portal-sdk.js`, `data/game.json` y `assets/`.
   - Inyección real del SDK de plataforma destino: **Playgama Bridge**, **Poki SDK v2**, **CrazyGames SDK v3**, **Web estándar / itch.io** y **Personalizado**.

---

## Pruebas unitarias y verificación

```bash
# Ejecutar pruebas unitarias locales del motor, runtime, compilador y asistente
npx --yes tsx --test src/engine/core/sceneGraph.test.ts src/export/html5/html5Compiler.test.ts src/assistant/assistant.test.ts

# Compilación de producción y verificación de tipos
npm run lint
npm run build
```
