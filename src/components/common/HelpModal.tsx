import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  HelpCircle,
  Layers,
  Music,
  Rocket,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

type HelpTabId =
  | 'quickstart'
  | 'scenes'
  | 'audio'
  | 'mechanics'
  | 'effects'
  | 'export';

interface HelpTabDef {
  id: HelpTabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const HELP_TABS: HelpTabDef[] = [
  { id: 'quickstart', label: 'Inicio Rápido', icon: Rocket },
  { id: 'scenes', label: 'Escenas y Sprites', icon: Layers },
  { id: 'audio', label: 'Música y Sonidos', icon: Music },
  { id: 'mechanics', label: 'Mecánicas y Lógica', icon: Workflow },
  { id: 'effects', label: 'Efectos y Guardado', icon: Sparkles },
  { id: 'export', label: 'Exportar y Atajos', icon: Download },
];

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<HelpTabId>('quickstart');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nexus-help-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[82vh] max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#32323c] bg-[#18181c] text-zinc-100 shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-[#2e2e36] bg-[#1e1e24] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-500/40 bg-blue-600/20">
              <BookOpen className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 id="nexus-help-title" className="text-sm font-bold text-zinc-100">
                Guía Rápida de NEXUS GAME ENGINE
              </h2>
              <p className="text-[11px] text-zinc-400">
                Aprende paso a paso a crear escenas, añadir música y efectos de tu PC y exportar tu juego en HTML5.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía de ayuda"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-[#2c2c34] hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido principal con menú lateral de temas */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav
            aria-label="Secciones de ayuda"
            role="tablist"
            className="flex w-56 shrink-0 flex-col gap-1 border-r border-[#2b2b33] bg-[#151519] p-3"
          >
            {HELP_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-300 hover:bg-[#24242b] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}

            <div className="mt-auto rounded-lg border border-[#2d2d36] bg-[#1b1b21] p-3 text-[11px] leading-relaxed text-zinc-400">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-200">
                <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                Consejo útil
              </div>
              Todo lo que creas y los archivos que importas se guardan en tu navegador y viajan dentro del paquete al exportar.
            </div>
          </nav>

          {/* Cuerpo del tema seleccionado */}
          <div className="flex-1 overflow-y-auto px-6 py-5 text-xs leading-relaxed text-zinc-300">
            {activeTab === 'quickstart' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Tu primer juego listo en 5 pasos
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    No necesitas escribir código. Sigue este flujo para armar un nivel jugable desde cero:
                  </p>
                </div>

                <ol className="space-y-2.5">
                  <li className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3">
                    <span className="font-bold text-blue-400">1. Crea o abre un proyecto:</span>{' '}
                    Elige una plantilla (Plataformas, Top-Down o Escena en blanco) o empieza con tu propia resolución (ej. 1280×720).
                  </li>
                  <li className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3">
                    <span className="font-bold text-blue-400">2. Importa tus imágenes y sonidos:</span>{' '}
                    En el panel izquierdo <strong>Recursos</strong>, pulsa <strong>+ Importar</strong> o <strong>+ Audio</strong> para subir gráficos (PNG, JPG, WebP, SVG) y pistas de música o efectos (MP3, WAV, OGG, M4A) desde tu PC.
                  </li>
                  <li className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3">
                    <span className="font-bold text-blue-400">3. Coloca y da vida a tus objetos:</span>{' '}
                    Arrastra tus sprites al escenario o añade Rectángulos y Mapas de Tiles. Selecciona el personaje y en el <strong>Inspector</strong> añádele <em>Jugador Plataformas</em> (o <em>Top-Down</em>); a los suelos añádeles <em>Sólido</em>.
                  </li>
                  <li className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3">
                    <span className="font-bold text-blue-400">4. Configura música y mecánicas:</span>{' '}
                    Elige la música de fondo de la escena en el <strong>Inspector</strong> o en la pestaña inferior <strong>Audio</strong>. En la pestaña inferior <strong>Mecánicas</strong> añade reglas visuales (puntos, puertas, enemigos, sonidos).
                  </li>
                  <li className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3">
                    <span className="font-bold text-blue-400">5. Prueba y Exporta:</span>{' '}
                    Pulsa <strong>Vista previa</strong> (botón verde arriba) para jugar al instante. Cuando esté listo, pulsa <strong>Exportar</strong> para descargar tu juego HTML5 terminado.
                  </li>
                </ol>
              </div>
            )}

            {activeTab === 'scenes' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Escenas, Niveles, Capas y Sprites sin recortes
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Organiza tu juego en pantallas separadas (Menú Principal, Nivel 1, Nivel 2, Pausa, Victoria) igual que en un estudio profesional.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-zinc-100">Escenas y Menús</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-zinc-300">
                      <li>Usa la barra superior de pestañas (<strong>+ Nueva escena</strong>) para añadir niveles o paneles de menú.</li>
                      <li>Marca cualquier escena como <strong>Inicial</strong> (icono de estrella/casa) para que el juego arranque ahí.</li>
                      <li>Usa <strong>Botón UI</strong> + acción <em>Cargar escena</em> o <strong>Portal / Meta</strong> para pasar de un nivel a otro sin código.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-zinc-100">Capas y Jerarquía</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-zinc-300">
                      <li>En <strong>Escena</strong> (panel izquierdo) puedes reordenar objetos, ocultarlos, bloquearlos o anidar hijos dentro de un padre.</li>
                      <li>Las capas de colisión (<em>Player</em>, <em>World</em>, <em>Enemy</em>, <em>UI</em>) separan automáticamente qué choca con qué.</li>
                      <li>Guarda cualquier objeto complejo como <strong>Prefab</strong> para reutilizarlo en todos tus niveles.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3.5">
                  <h4 className="font-semibold text-blue-300">Ajuste de imagen en Sprites</h4>
                  <p className="mt-1 text-zinc-300">
                    Al asignar una imagen a un Sprite, en el Inspector elige cómo se adapta al cuadro:
                    <strong> Contener (sin recortes)</strong> muestra toda la imagen completa,
                    <strong> Cubrir</strong> llena el cuadro manteniendo proporción,
                    <strong> Estirar</strong> ajusta al tamaño exacto y <strong>Mosaico</strong> repite la textura (ideal para fondos y suelos). Usa muestreo <strong>Pixel Art</strong> para sprites nítidos.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Audio Pro: Archivos de tu PC, Música y Disparadores
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Controla la música de fondo, los volúmenes por canal y cada efecto sonoro desde el editor. Todo el audio se empaqueta y suena igual al exportar a HTML5.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-emerald-300">1. Importar música y efectos desde tu PC</h4>
                    <p className="mt-1">
                      Haz clic en <strong>+ Audio</strong> en <em>Recursos</em> o en <strong>Importar audio (PC)</strong> dentro de la pestaña inferior <em>Audio</em>.
                      Acepta <strong>WAV, MP3, OGG, M4A, AAC, FLAC y WebM</strong>. Puedes escuchar cualquier pista con su botón ▶ antes de usarla.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-blue-300">2. Música de fondo por escena</h4>
                    <p className="mt-1">
                      Sin seleccionar ningún objeto (o en la pestaña inferior <strong>Audio</strong>), elige la pista en <strong>Música de fondo de la escena</strong>.
                      Activa <em>Bucle</em> y <em>Mantener pista si la siguiente escena usa la misma</em> para que la música no se corte al pasar de pantalla.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-amber-300">3. Disparadores de sonido en objetos y eventos</h4>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      <li><strong>Disparador de Sonido (audio.sound_trigger):</strong> Añádelo a cualquier objeto para reproducir un sonido al <em>tocar al jugador</em>, <em>al inicio</em>, <em>al hacer clic</em>, <em>al pulsar tecla</em>, <em>por intervalo</em> o <em>al destruirse</em>.</li>
                      <li><strong>Zona de Música (audio.music_zone):</strong> Cambia automáticamente a música de jefe o cueva cuando el jugador entra en un área.</li>
                      <li><strong>Sonidos directos en objetos:</strong> El salto del jugador, monedas coleccionables, disparos, golpes y botones UI permiten elegir tu archivo MP3/WAV personalizado.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-zinc-100">4. Mezclador multicanal</h4>
                    <p className="mt-1">
                      Ajusta en vivo los canales <strong>Maestro</strong>, <strong>Música</strong>, <strong>SFX</strong> e <strong>Interfaz (UI)</strong>, o siléncialos por separado.
                      También puedes cambiar el volumen o detener la música desde reglas con <em>Reproducir música</em>, <em>Detener música</em> y <em>Detener todo el audio</em>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mechanics' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Sistema de Mecánicas (CUANDO → SI → ENTONCES) y Comportamientos
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Combina comportamientos listos en cada objeto con reglas visuales globales para crear cualquier género de juego sin límites.
                  </p>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-4">
                  <h4 className="font-semibold text-blue-300">Cómo funciona una Regla en Mecánicas</h4>
                  <div className="mt-2.5 grid gap-2.5 md:grid-cols-3">
                    <div className="rounded border border-[#2e2e38] bg-[#141418] p-2.5">
                      <div className="font-bold text-emerald-400">CUANDO (Disparador)</div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Al iniciar escena, cada frame, al tocar/colisionar, al pulsar cualquier tecla del teclado (KeyboardEvent.code), clic, gesto táctil o fin de cuenta atrás.
                      </p>
                    </div>
                    <div className="rounded border border-[#2e2e38] bg-[#141418] p-2.5">
                      <div className="font-bold text-amber-400">SI (Condiciones)</div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Compara variables (puntos, salud, llaves), comprueba si un objeto existe, está en el suelo, tiene cierta etiqueta o está cerca de otro.
                      </p>
                    </div>
                    <div className="rounded border border-[#2e2e38] bg-[#141418] p-2.5">
                      <div className="font-bold text-sky-400">ENTONCES (Acciones)</div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Suma puntos, reproduce sonido o música, mueve/teletransporta/crea objetos, lanza partículas, sacude la cámara, espera segundos o cambia de nivel.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                  <h4 className="font-semibold text-zinc-100">Comportamientos integrados por objeto</h4>
                  <p className="mt-1 text-zinc-300">
                    En el Inspector pulsa <strong>+ Añadir comportamiento</strong> para activar módulos como:
                    Plataformas Pro (con doble salto, coyote time y wall-jump), Top-Down 8 direcciones, Vehículo con derrape,
                    Torreta, Enemigo con máquina de estados, Imanes de monedas, Plataformas móviles, Emisores de partículas y Disparadores de sonido.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'effects' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Partículas, Animaciones, Variables y Guardado Local
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Añade pulido visual y progreso persistente a tu juego.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-zinc-100">SpritedSheets y Tweens</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      <li>Activa <strong>Animación (Spritesheet)</strong> en cualquier Sprite e indica columnas y filas.</li>
                      <li>Puedes vincular clips (<em>idle</em>, <em>walk</em>, <em>jump</em>) automáticamente al movimiento del jugador.</li>
                      <li>Usa <strong>Tweens</strong> en la pestaña inferior <em>Animación / FX</em> para animar suavemente posición, escala, rotación o transparencia.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-zinc-100">Partículas, Variables y Ranking</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      <li>Activa el emisor continuo (fuego, humo, chispas, lluvia, nieve, magia) directamente en el objeto.</li>
                      <li>Crea variables globales en <strong>Variables</strong>; marca <em>Persistente</em> para guardar récords entre sesiones.</li>
                      <li>Añade un objeto <strong>Ranking Top-10</strong> y usa la acción <em>Enviar a Ranking</em> para mostrar mejores puntuaciones.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                  <h4 className="font-semibold text-emerald-300">Autoguardado local seguro</h4>
                  <p className="mt-1">
                    Tus proyectos, escenas, audios e imágenes se guardan localmente en <strong>IndexedDB</strong> de forma automática para que puedas cerrar y retomar exactamente donde lo dejaste sin perder nada.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Exportar Juego HTML5 Real y Atajos de Teclado
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Compila un paquete <code>.zip</code> autónomo listo para subir a cualquier servidor web o portal de juegos.
                  </p>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                  <h4 className="font-semibold text-blue-300">Portales compatibles con SDK real</h4>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    <li><strong>Web HTML5 estándar:</strong> Carpeta autocontenida con <code>index.html</code>, motor <code>nexus-runtime.js</code>, recursos gráficos y carpeta <code>assets/</code> con tus audios.</li>
                    <li><strong>Playgama Bridge:</strong> Incluye <code>playgama-bridge.js</code>, <code>playgama-bridge-config.json</code> y ciclo real de anuncios y almacenamiento.</li>
                    <li><strong>Poki y CrazyGames:</strong> Inyecta automáticamente los SDK oficiales (<code>poki-sdk.js</code> / <code>crazygames-sdk-v3.js</code>) y eventos de gameplay.</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                  <h4 className="font-semibold text-zinc-100">Atajos rápidos del Editor</h4>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      ['V / W / S / E', 'Seleccionar / Mover / Escalar / Rotar'],
                      ['H / B', 'Navegar lienzo / Pincel de Tiles'],
                      ['Ctrl + S', 'Guardar proyecto ahora'],
                      ['Ctrl + Z / Y', 'Deshacer / Rehacer'],
                      ['Ctrl + D', 'Duplicar selección'],
                      ['Supr / Retroceso', 'Eliminar selección'],
                    ].map(([keys, desc]) => (
                      <div key={keys} className="rounded border border-[#2d2d36] bg-[#141418] p-2">
                        <kbd className="inline-block rounded bg-[#262630] px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-300">
                          {keys}
                        </kbd>
                        <div className="mt-1 text-[11px] text-zinc-400">{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between border-t border-[#2e2e36] bg-[#1b1b21] px-5 py-3">
          <span className="text-[11px] text-zinc-400">
            Pulsa <kbd className="rounded bg-[#262630] px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">Esc</kbd> para volver al trabajo.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
