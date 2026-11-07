# Agentes IA 3D

![Oficina con agentes de IA](docs/oficina-3d.jpg)

**Una oficina 3D con agentes de IA que trabajan para tu negocio o tu agencia.** Crea tu equipo de agentes (copies,
estrategia, diseño web, video, imágenes, SEO, asistente personal…), ponles el nombre que quieras, asígnales tareas
junto con tu equipo humano y míralos trabajar en una oficina 3D. Cada entrega llega a "Espera Aprobación":
**nada se publica sin ti**.

Funciona con **Claude Code** y tu propia suscripción de Claude. Código abierto (MIT), sin cuotas.

> Proyecto original de [Ederland Studio](https://eder-land.com). Si te sirve, dale una ⭐.

## Contenido

- [Qué incluye](#qué-incluye)
- [Qué necesitas](#qué-necesitas)
- [Instalación](#instalación)
- [Encender el motor](#encender-el-motor)
- [Cómo se usa](#cómo-se-usa)
- [Agencia: clientes, departamentos y skills](#agencia-clientes-departamentos-y-skills)
- [Cómo funciona por dentro](#cómo-funciona-por-dentro)
- [Archivos de configuración](#archivos-de-configuración)
- [Problemas comunes](#problemas-comunes)

## Qué incluye

- **Oficina 3D**: tu equipo humano y tus agentes en tiempo real. Ves quién trabaja, quién está en pausa y quién toma
  café. El coordinador camina hasta cada agente para entregarle las tareas. Gira la vista con `Q` / `E`.
- **Pipeline de tareas** (Kanban): pendiente → en progreso → espera aprobación → correcciones → completada, con
  cronómetro, prioridades, clientes, departamentos y reportes. La pestaña **Tareas** muestra la misma lista en tabla.
- **Agentes con roles y permisos por tarea**: elige del catálogo o crea los tuyos. Cada rol define qué herramientas
  puede usar, y un tipo de tarea o una tarea puntual pueden sumarle permisos (por ejemplo, crear un PDF).
- **Agencia multi-cliente**: ficha de cada cliente (negocio, marca, objetivos, activos, alcance y aprendizajes),
  departamentos, tipos de tarea con plantilla de brief y checklist, y revisión entre agentes antes de que la veas tú.
- **Tareas para un departamento**: asignas una tarea a "Marketing" en vez de a una persona; la toma quien llegue
  primero y, si nadie del equipo humano la toma, se la lleva un agente de ese departamento.
- **Versiones y Google Drive**: cada entrega queda guardada por cliente, departamento, fecha y versión; al aprobarla
  se copia a la carpeta `Aprobados` del cliente.
- **Entregables en PDF con vista previa**: el agente diseña en HTML A4, el motor lo convierte en PDF y tú ves cada
  página en miniatura antes de aprobar (brochures, portafolios, propuestas, flyers, presentaciones).
- **Buscador de skills**: busca, revisa e instala skills de Claude para tus agentes desde el panel.
- **Modelos de IA por agente**: Claude Code por defecto, u otros modelos con API compatible con OpenAI
  (Gemini, OpenRouter, Ollama…) para los agentes que solo escriben texto.
- **Chat con cada agente y chat de grupo**: los agentes te preguntan lo que les falta y colaboran con `@menciones`.
- **Asistente coordinador por Telegram** (opcional): háblale por texto o nota de voz, reparte tareas y te avisa
  cuando un agente termina o necesita información.
- **Editor de video local**: transcripción con Whisper, corte de silencios, limpieza de audio, subtítulos y
  animaciones con código ([HyperFrames](https://github.com/heygen-com/hyperframes)).
- **Avatares personalizables** para cada persona y agente, con vista previa 3D.

## Qué necesitas

**Obligatorio**

| Qué | Para qué |
|---|---|
| Un PC con Windows, macOS o Linux (en Windows sirve WSL) | Ahí corre el motor que ejecuta a los agentes. Los agentes trabajan **solo mientras está encendido**. |
| [Node.js 22 o superior](https://nodejs.org) | App y motor. |
| [Git](https://git-scm.com) | Descargar el proyecto y el buscador de skills. |
| Suscripción de Claude (Pro o Max) | Los agentes usan tu cuenta a través de Claude Code. Las tareas largas consumen el límite más rápido. |
| Cuenta de Google | Iniciar sesión y crear el proyecto de Firebase. |
| Proyecto de [Firebase](https://console.firebase.google.com) (plan gratis Spark) | Base de datos, inicio de sesión y publicación de la app. |

**Opcional**

| Qué | Para qué |
|---|---|
| Bot de Telegram (@BotFather) | Hablar con el coordinador y recibir avisos. |
| Google Drive para escritorio o [rclone](https://rclone.org) | Que las entregas lleguen solas a Google Drive. |
| Gmail, Calendar y Drive conectados en claude.ai | Que el coordinador lea tu correo y calendario. |
| Chromium o Chrome | Crear los PDF. El motor usa el que ya trae (Playwright) o el de tu sistema. En Linux/WSL necesita `sudo apt-get install -y libnss3 libnspr4 libasound2t64`. |
| [Magnific](https://www.magnific.com) (de pago) | Rol de imágenes con IA. |
| Claves de ElevenLabs, HeyGen o Gemini | Voces y avatares en los videos (skills de HyperFrames). |

## Instalación

### Con el asistente (recomendado)

```bash
git clone https://github.com/rojoprogramador/Agentes_IA_3D.git
cd Agentes_IA_3D
claude
```

Dentro de Claude Code escribe:

```
/instalar
```

Claude te hace las preguntas (tu negocio, tu marca, tus agentes y sus roles), te guía para crear tu proyecto en
Firebase y deja la app publicada y el motor funcionando. Toma unos 30 minutos. **Nunca te pedirá tus contraseñas**:
cuando haga falta una, te abre el archivo para que la pegues tú.

### A mano (resumen de lo que hace el asistente)

1. **Firebase**: crea el proyecto, agrega una app web y copia su configuración. En Authentication habilita
   **Google** y **Correo/contraseña**, crea el **usuario robot** del motor (por ejemplo `tunombre+agentes@gmail.com`)
   y desactiva el registro público. Crea Firestore en modo producción.
2. **Configurar**: escribe `instalacion.json` (formato al inicio de `tools/configurar.mjs`) y ejecuta
   `node tools/configurar.mjs instalacion.json`. Genera `app/.env`, `motor/.env`, `motor/negocio.json` y pone el
   correo del robot en `firestore.rules`. Pega la contraseña del robot en `motor/.env → AGENT_PASSWORD`.
3. **Dependencias**: `npm install` dentro de `app/` y dentro de `motor/`.
4. **Publicar**:
   ```bash
   npx firebase-tools login
   cd app && npm run build && cd ..
   npx firebase-tools deploy --only hosting,firestore:rules
   ```
   Entra a `https://<tu-proyecto>.web.app` con la cuenta de Google del dueño: queda como Super Admin.
5. **Motor**: en `motor/`, `npm run check` (debe decir "Verificación OK") y `npm run crear-agentes`.
   Si no has iniciado sesión en Claude Code en ese PC: `npx claude auth login`.

## Encender el motor

| Sistema | Comando |
|---|---|
| Windows | `motor\iniciar-agentes.bat` |
| macOS / Linux / WSL | `bash motor/iniciar-agentes.sh` |

Déjalo abierto en su propia terminal: si se cae, se reinicia solo a los 15 segundos. En la Oficina debe aparecer
"Motor de agentes conectado". Lo que hace queda en `motor/logs/motor.log`.

Para que arranque con el PC: `powershell -ExecutionPolicy Bypass -File tools\inicio-automatico-windows.ps1`
(Windows) o `bash tools/inicio-automatico-mac.sh` (macOS).

Otros comandos dentro de `motor/`:

| Comando | Qué hace |
|---|---|
| `npm run check` | Verifica que el robot entra y tiene permisos, y sale. |
| `npm run agentes` | Lista los agentes con su ID y su rol. |
| `npm run crear-agentes` | Crea en la app los agentes de `negocio.json → equipo`. |
| `npm test` | Pruebas del armado de fichas y briefs. |

## Cómo se usa

### El ciclo de una tarea

1. **Crear**: botón **+ Nueva tarea** (en Mi Panel, Tareas o Agencia → Tareas). Pon nombre, descripción, cliente,
   departamento y, si quieres, un **tipo de tarea** para que el brief pida los campos que importan.
2. **Asignar** ("Asignado a"):
   - **Una persona** del equipo: le llega un correo y la ve en su panel.
   - **Un agente de IA**: el motor la toma, el agente trabaja y la tarea pasa a "En progreso".
   - **Un departamento completo**: la ve todo el departamento como "por tomar". La toma quien llegue primero
     ("Asignármela" en el Pipeline o "Tomarla" en Agencia → Tareas). Si en 30 minutos nadie del equipo humano la
     toma, el motor se la da a un agente de ese departamento (el que tenga el rol del tipo de tarea o el menos
     ocupado). Si el departamento no tiene personas, se la da de inmediato.
   - **Permisos del agente para esta tarea** (solo admin): suma permisos que su rol no trae, solo para esa tarea.
     Por ejemplo, "Crear archivos y PDF" para que el agente de SEO entregue un brochure. Los que tocan tus datos
     (Gmail, calendario) salen en rojo. Nunca se ofrece la terminal (Bash).
3. **Revisión entre agentes**: si el tipo de tarea tiene un rol revisor, otro agente revisa la entrega contra el
   checklist y la corrige una vez antes de mostrártela.
4. **Espera aprobación**: abres la tarea. Si el agente entregó un PDF, ves la vista previa de cada página (clic para
   ampliar) y los links al archivo en Drive. En el panel de revisión eliges:
   - **Aprobar**: se completa y la versión se copia a `Aprobados` del cliente.
   - **Pedir corrección**: el agente la ajusta con tu nota.
   - **Rechazar**: la rehace desde cero.
   Al corregir o rechazar puedes guardar la nota como **aprendizaje del cliente** (lo leerán todos los agentes que
   trabajen para él) o como **lección del agente** (la aplicará con todos sus clientes).
5. **Completada**: queda con su tiempo trabajado, sus versiones y quién la terminó.

### Los dos links de la tarea

| Campo | Para qué sirve |
|---|---|
| **Link de recursos** | Lo que la tarea necesita para hacerse: referencias, carpeta del cliente, fotos, un documento con el brief. El motor se lo pasa al agente para que lo consulte. |
| **Link de la tarea terminada** | El entregable final. Lo pega quien termina la tarea. En tareas de agentes, el motor lo llena solo si la entrega incluye un link de Google Docs y el campo estaba vacío. No se copia al duplicar una tarea. |

Si llenas el link de la tarea terminada antes de que el agente trabaje, el agente lo recibe como referencia.

### Chat, café y Telegram

- **Chat**: en la Oficina, selecciona un agente → **Chatear**, o usa el chat de grupo con `@nombre`.
- **Descansos**: un agente o una persona puede ir por un café; vuelve solo a los 3 minutos o con
  **Volver a trabajar** / **Ya volví**. **Pasar a reserva** saca a un agente del equipo activo sin borrarlo.
- **Telegram** (si lo configuraste): escríbele o mándale una nota de voz al coordinador. Reparte las tareas y te
  avisa cuando un agente termina o necesita información; respondes a sus preguntas desde ahí mismo.

## Agencia: clientes, departamentos y skills

Las pantallas **Agentes**, **Clientes** y **Agencia** solo las ve el Super Admin.

- **Clientes**: la ficha de cada cliente (negocio, marca, objetivos, activos, alcance, aprendizajes y departamentos
  contratados). Un agente solo recibe la ficha del cliente de su tarea; nunca ve la de otros clientes.
- **Agencia → Tareas**: todas las tareas agrupadas por departamento, con filtro por cliente. Es la misma lista que
  la pestaña Tareas y el Pipeline, vista de otra forma.
- **Agencia → Departamentos**: los equipos de la agencia y quién pertenece a cada uno. Las personas se asignan en
  **Team → editar persona → Departamento**; los agentes, en **Agentes → Editar**.
- **Agencia → Tipos de tarea**: plantilla de brief (campos obligatorios), checklist, rol que la hace, rol que la
  revisa, formato de entrega y **permisos extra** que recibe cualquier agente que haga ese tipo de tarea.
- **Agencia → Modelos de IA**: agrega proveedores compatibles con OpenAI. La clave se guarda en tu Firebase y
  **solo la lee el motor**: el panel no puede volver a mostrarla. Los agentes que usan herramientas (web, archivos,
  video) siempre van con Claude Code.
- **Agencia → Skills**: el buscador de skills (abajo).

### Skills de los agentes

Las skills son paquetes de instrucciones y scripts que hacen a un agente mejor en algo (copywriting, SEO, video,
presentaciones…). Viven en `motor/.claude/skills/` y se asignan a cada agente en **Agentes → Editar → Skills**.

En **Agencia → Skills**:

1. **Buscar**: escribe lo que necesitas ("video", "seo") o pega el link de un repo de GitHub. Los resultados vienen
   de [skills.sh](https://skills.sh); primero salen las **fuentes confiables**. Las instalaciones solo miden
   popularidad, no seguridad: hay repos que copian skills populares.
2. **Revisar**: el motor descarga la skill a una cuarentena **sin ejecutar nada** y te muestra sus archivos, sus
   scripts, los servidores a los que se conectan, los patrones de riesgo que encontró y el `SKILL.md` que leerá el
   agente.
3. **Instalar**: copia exactamente lo que revisaste. Si el repo cambió desde la revisión, te pide revisarla otra
   vez. Con fuente desconocida o alertas, tienes que confirmar que confías en ella.
4. **Buscar actualización** y **Quitar** en la lista de instaladas.

Las fuentes confiables por defecto son `anthropics/skills`, `coreyhaines31/marketingskills`, `heygen-com/hyperframes`,
`remotion-dev/skills` y las de `vercel-labs`. Agrega las tuyas en `motor/negocio.json → fuentesSkills`.

Paquetes recomendados para una agencia:

| Paquete | Para |
|---|---|
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | Copies, redes, anuncios, email, lanzamientos, SEO, CRO, estrategia. |
| [anthropics/skills](https://github.com/anthropics/skills) | Word, PowerPoint, Excel, PDF, diseño visual, crear skills propias. |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Video, subtítulos, música y voz. Su telemetría se apaga con `HYPERFRAMES_NO_TELEMETRY=1` en `motor/.env`. |
| [Design Skills de typeui.sh](https://www.typeui.sh/design-skills) | Más de 60 estilos para el agente de diseño web (MIT, de sus autores). |

[Remotion](https://github.com/remotion-dev/skills) también hace video, pero exige licencia de pago a empresas de
más de 3 personas.

## Cómo funciona por dentro

```
 Tú y tu equipo (app web o Telegram)      Firebase (gratis)            Tu PC
 ──────────────────────────────────  →  ──────────────────  →  ─────────────────────────────
 crean tareas, aprueban, chatean         tareas, agentes,        motor/ toma las tareas y las
 con los agentes, piden skills           clientes, chats         ejecuta con Claude Code
```

- El motor entra a Firebase con un **usuario robot** con permisos mínimos: solo toca tareas de agentes, responde
  los pedidos de skills y puede dar una tarea de departamento sin tomar a uno de sus agentes. No puede reasignar
  tareas de personas.
- Los agentes solo pueden escribir en la carpeta `salida/` de su tarea y nunca ejecutan comandos. El motor convierte
  a PDF el HTML que dejan ahí, sin JavaScript y sin dejar que la página abra archivos fuera de esa carpeta.
- Cada tarea se trabaja en su propia carpeta `motor/trabajos/<id>`; las entregas quedan en
  `<Cliente>/<Departamento>/<fecha>/v<n>/`.
- Reglas de los agentes (`motor/CLAUDE.md`): nada se publica ni se envía, no inventan datos del cliente y nunca
  piden contraseñas.
- Tus claves viven solo en `motor/.env` y `app/.env`, que nunca se suben a GitHub.

## Archivos de configuración

| Archivo | Qué guarda | ¿Se sube a GitHub? |
|---|---|---|
| `app/.env` | Marca y configuración pública de Firebase | No |
| `motor/.env` | Usuario robot, Telegram, modelo alterno, opciones de las skills | **Nunca** |
| `motor/negocio.json` | Tu negocio, tus agentes, `fuentesSkills`, `esperaDepartamentoMin` | No |
| `motor/media-config.json` | Entregas: `agenciaDrive` (carpeta sincronizada con Drive), `rcloneRemote` (p. ej. `gdrive:Agencia`), `driveLocal` | No |
| `firestore.rules` | Reglas de seguridad. En el repo lleva `__CORREO_ROBOT__`; `configurar.mjs` pone tu robot | Solo la plantilla |
| `roles/catalogo.json` | Roles: misión, herramientas y forma de entrega | Sí |
| `motor/.claude/skills/` | Skills instaladas y su origen (`skills-origen.json`) | No |

## Problemas comunes

- **`permission-denied` en el motor**: falta publicar las reglas, o el correo del robot en `firestore.rules` no
  coincide con el de `motor/.env`. Ejecuta `tools/configurar.mjs` y publica con
  `npx firebase-tools deploy --only firestore:rules`.
- **El panel dice que el motor está apagado**: enciéndelo (ver arriba) y espera un minuto.
- **No veo los cambios después de publicar**: recarga con `Ctrl + F5`.
- **El buscador de skills no responde**: el motor debe estar encendido y el PC necesita `git` y salida a internet.
- **Una tarea de departamento no la toma ningún agente**: el departamento necesita al menos un agente activo
  (Agentes → Editar → Departamento).
- **El agente dice que no tiene permiso para una herramienta**: revisa su rol en `roles/catalogo.json` y
  `motor/negocio.json → agentes[id]`.
- **"No se pudo crear el PDF"**: en Linux/WSL faltan librerías del navegador
  (`sudo apt-get install -y libnss3 libnspr4 libasound2t64`), o define `navegador` en `motor/media-config.json`
  con la ruta de Chrome.
- **Telegram no conecta**: algunas redes bloquean api.telegram.org; el motor reintenta solo.

## Estructura

```
app/        App web (React, Vite, Three.js, Firebase)
motor/      Motor local de agentes (Node + Claude Code): worker, skills, Telegram, voz, medios
roles/      Catálogo de roles y herramientas
tools/      Configurador e inicio automático
.claude/    Skill /instalar
```

## Licencia

MIT. Usa, modifica y comparte libremente. Los nombres y marcas de terceros pertenecen a sus dueños;
el proyecto no incluye personajes con marca registrada: cada negocio nombra a sus agentes.
