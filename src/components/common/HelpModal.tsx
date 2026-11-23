import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Code2,
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
  | 'pro'
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
  { id: 'pro', label: 'Scripts, UI y 3D', icon: Code2 },
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
                  <h4 className="font-semibold text-blue-300">Ajuste de imagen en Sprites y Colisionadores Inteligentes</h4>
                  <p className="mt-1 text-zinc-300">
                    Al asignar una imagen a un Sprite, en el Inspector elige cómo se adapta al cuadro:
                    <strong> Contener (sin recortes)</strong> muestra toda la imagen completa,
                    <strong> Cubrir</strong> llena el cuadro manteniendo proporción,
                    <strong> Estirar</strong> ajusta al tamaño exacto y <strong>Mosaico</strong> repite la textura (ideal para fondos y suelos). Usa muestreo <strong>Pixel Art</strong> para sprites nítidos.
                  </p>
                  <p className="mt-2 text-zinc-300">
                    <strong>Colisionadores Inteligentes:</strong> En 2D activa <em>Contorno PNG Inteligente (smart_alpha)</em> en el Collider para ajustar automáticamente las cajas físicas a los píxeles visibles ignorando la transparencia. En 3D elige <em>Malla Exacta Inteligente (mesh_exact)</em> para que arcos, túneles o modelos CSG/.GLB permitan pasar por debajo o por huecos reales sin bloquear al jugador.
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

                  <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3.5">
                    <h4 className="font-semibold text-purple-300">5. Sintetizador SFX (.WAV) integrado</h4>
                    <p className="mt-1 text-zinc-300">
                      En la pestaña inferior <strong>Audio</strong> abre el <strong>Sintetizador SFX (.WAV)</strong> para generar efectos retro o modernos al instante con presets (<em>Explosión</em>, <em>Láser</em>, <em>Salto</em>, <em>Moneda</em>, <em>Clic UI</em>) o fórmulas matemáticas seguras en modo <em>Personalizado</em>. Pulsa <strong>Preescuchar</strong> y luego <strong>Guardar WAV en Recursos</strong> para convertirlo en un archivo <code>.wav</code> real exportable con tu juego.
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

            {activeTab === 'pro' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Scripts JavaScript, Interfaces HTML/CSS/JS y Motor 3D Pro
                  </h3>
                  <p className="mt-1 text-zinc-400">
                    Combina la velocidad visual No-Code con programación JavaScript real, interfaces animadas con CSS y construcción 3D con Three.js, CSG y NavMesh.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-sky-300">Scripts JS (.js) por objeto o escena</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      <li>Abre la pestaña inferior <strong>Código e Interfaces</strong> para escribir lógica con <code>onStart(self, nexus)</code>, <code>onUpdate(self, dt, nexus)</code> y <code>onCollisionEnter(self, other, nexus)</code>.</li>
                      <li>Declara parámetros con <code>// @param speed:number=5</code> y ajústalos visualmente desde el <strong>Inspector</strong>.</li>
                      <li>Interactúa con cualquier objeto, variable o canal de audio vía <code>nexus.findByTag()</code>, <code>nexus.vars</code> y <code>nexus.audio.playSfx()</code>.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                    <h4 className="font-semibold text-emerald-300">Interfaces HTML / CSS / JS en el Lienzo</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      <li>Crea paneles, inventarios o HUD animados en HTML+CSS+JS y pulsa <strong>Insertar en escena como gráfico seleccionable</strong>.</li>
                      <li>Usa atributos reactivos como <code>data-nexus-var="puntos"</code>, <code>data-nexus-progress="salud/100"</code>, <code>data-nexus-action="audio.play"</code> o <code>data-nexus-audio-bus="music"</code>.</li>
                      <li>Ábrelos o ciérralos desde reglas con <em>Abrir / Cerrar / Alternar Interfaz</em>.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3.5">
                  <h4 className="font-semibold text-purple-300">Motor 3D Pro: Terreno, Agua, Física Blanda, Vehículos e IA</h4>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-zinc-300">
                    <li><strong>Terreno Procedural y Pinceles 3D:</strong> Añade un terreno y esculpe en tiempo real con los pinceles <em>Elevar</em>, <em>Rebajar</em>, <em>Aplanar</em>, <em>Suavizar</em>, <em>Pintar Splat</em> (hierba, tierra, roca, arena), <em>Scatter</em> de vegetación y <em>Valla Magnética</em>.</li>
                    <li><strong>Agua Reactiva, Hierba con Viento y Ciclo Día/Noche:</strong> El agua genera espuma alrededor de rocas y ondas al saltar el jugador; la hierba instanciada se mece con el viento y se aparta al paso del jugador; el domo de cielo cambia de amanecer a noche dinámicamente.</li>
                    <li><strong>Constructor Modular + CSG + Soft-Body + Vehículos 4R:</strong> Une/resta mallas CSG, usa <em>Soft-Body</em> (cuerdas, puentes colgantes, gel o arena granular) y configura vehículos de 4 ruedas con suspensión real por muelle-amortiguador y giro Ackermann.</li>
                    <li><strong>Visor 3D y Presupuesto Poligonal (.GLB):</strong> Haz doble clic en cualquier modelo <code>.glb/.gltf</code> en Recursos para inspeccionarlo, probar sus clips animados y optimizarlo por presupuesto poligonal (<em>Bajo / Medio / Alto / Original</em>).</li>
                    <li><strong>Máquina de Animaciones (FSM) 2D/3D y NavMesh IA:</strong> Configura transiciones combinadas (<code>&&</code>, <code>||</code>, <code>keyHeld:ShiftLeft</code>, <code>speed &gt; 0.1</code>) con <em>crossFade</em> en 3D y cambio de spritesheet en 2D. Hornea el <em>NavMesh IA</em> para pathfinding A* evitando obstáculos.</li>
                    <li><strong>Optimización Masiva:</strong> Activa <em>Frustum Culling</em>, distancia límite de <em>LOD</em> y <em>Desvanecimiento por distancia (Distance Fade)</em> por objeto para mantener 60 FPS en escenas grandes.</li>
                  </ul>
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
                    <h4 className="font-semibold text-zinc-100">Estudio VFX Multicapa, Variables y Ranking</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      <li>Usa el <strong>Estudio VFX</strong> (pestaña inferior <em>Partículas</em>) para combinar múltiples capas simultáneas (fuego + chispas + humo) con desplazamiento <em>offsetX/Y</em> y mezcla aditiva brillante.</li>
                      <li>Crea variables globales en <strong>Variables</strong>; marca <em>Persistente</em> para guardar récords entre sesiones.</li>
                      <li>Añade un objeto <strong>Ranking Top-10</strong> y usa la acción <em>Enviar a Ranking</em> para mostrar mejores puntuaciones.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2c2c35] bg-[#1d1d23] p-3.5">
                  <h4 className="font-semibold text-emerald-300">Autoguardado local seguro (IndexedDB + LocalStorage)</h4>
                  <p className="mt-1">
                    Tus proyectos, escenas, audios, modelos 3D, scripts y variables persistentes se guardan localmente de forma automática en <strong>IndexedDB + LocalStorage</strong> para retomar exactamente donde lo dejaste sin perder nada.
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
                  <h4 className="font-semibold text-blue-300">Portales compatibles con SDK real (2D PixiJS y 3D Three.js)</h4>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    <li><strong>Web HTML5 estándar:</strong> Paquete autocontenido sin dependencias externas: incluye <code>index.html</code>, motor <code>nexus-runtime.js</code> (2D) o <code>nexus-3d-runtime.js</code> (3D), assets y audios offline en <code>assets/</code>.</li>
                    <li><strong>Playgama Bridge:</strong> Incluye <code>playgama-bridge.js</code>, <code>playgama-bridge-config.json</code> y ciclo real de anuncios y almacenamiento.</li>
                    <li><strong>Poki y CrazyGames:</strong> Inyecta automáticamente los SDK oficiales (<code>poki-sdk.js</code> / <code>crazygames-sdk-v3.js</code>) y eventos de gameplay.</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                  <h4 className="font-semibold text-emerald-300">Joystick Táctil Analógico 360° y Mando (Gamepad)</h4>
                  <p className="mt-1 text-zinc-300">
                    Activa el botón <strong>Táctil</strong> en Vista Previa o en las opciones de Exportación (y configura modo <em>Fijo</em> o <em>Flotante</em>, zona muerta, tamaño y botones <strong>Saltar / Acción / Dash</strong>). Además, el motor 2D y 3D detecta automáticamente cualquier mando Bluetooth/USB vía <em>Gamepad API</em>.
                  </p>
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
