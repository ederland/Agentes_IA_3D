# Agentes IA 3D

> Si eres un agente de IA ejecutando una tarea del motor (tu carpeta de trabajo está dentro de `motor/trabajos/`),
> ignora este archivo: tus reglas están en `motor/CLAUDE.md` y en el texto de tu tarea.

Proyecto de código abierto: una oficina 3D con agentes de IA para cualquier negocio.

- `app/` — app web (React + Vite + Three.js + Firebase): Pipeline de tareas, Oficina 3D, chat con agentes, equipo.
- `motor/` — motor local (Node): toma las tareas de los agentes y las ejecuta con Claude Code; Telegram, voz, medios.
- `roles/catalogo.json` — catálogo de roles (habilidades) que comparten la app y el motor.
- **Agencia** (multi-cliente): colecciones `clients` (ficha de contexto por cliente), `departments` y `taskTypes`
  (plantilla de brief, checklist y rol revisor). Las tareas guardan `clienteId`, `departamentoId`, `tipoTareaId`,
  `brief`, `briefCampos`, `versiones`, `revisionAgente` y `driveSync`/`drivePath`/`driveUrl`. Se conserva el campo
  `cliente` (nombre) para tareas viejas. Pantallas: Clientes (ficha), Agencia (departamentos y tipos), panel de
  revisión en la tarea (`ReviewPanel`).
- En el motor, `motor/agencia.mjs` arma la ficha y el brief (funciones puras, `npm test` en `motor/`). Regla: un
  agente solo recibe la ficha del cliente de su tarea; el coordinador, en una tarea de cliente, solo ve las tareas
  de ese cliente.
- Versiones y Drive: cada entrega queda en `<agenciaDrive>/<Cliente>/<Departamento>/<fecha tarea>/v<n>/` y al aprobar
  se copia a `<Cliente>/Aprobados/`. `agenciaDrive` (carpeta sincronizada con Google Drive) y `rcloneRemote` van en
  `motor/media-config.json`; sin configurar, todo queda en `motor/agencia/`.
- Modelos de IA: Claude Code por defecto. En Agencia → Modelos de IA se agregan proveedores con API compatible con
  OpenAI (`providers/{id}`); la clave va en `providerSecrets/{id}`, que el panel escribe pero solo el motor lee.
  Un agente con `modelo = { proveedor: 'api', proveedorId, nombre }` usa ese modelo (solo texto). Los roles con
  `modelo.requiereHerramientas` y los tipos de tarea de video/archivos/código siempre van con Claude Code.
  `modelo.proveedor = 'alterno'` usa `ALT_LLM_*` de `motor/.env`.
- Skills por agente (`agents.skills`): el motor publica las skills instaladas en `config/agentWorker.skills`.
  Lecciones por agente (`agents.aprendizajes`) y por cliente (`clients.aprendizajes`) se agregan desde la revisión.
- Buscador de skills (Agencia → Skills): el panel crea pedidos en `skillOps` (buscar, revisar, instalar, actualizar,
  desinstalar) y solo el motor los responde (`motor/skills.mjs`). Busca en skills.sh o en un repo de GitHub, descarga a
  `motor/.skills-cuarentena/`, analiza sin ejecutar nada e instala en `motor/.claude/skills/` solo la revisión aprobada
  (mismo commit). El origen de cada skill queda en `motor/.claude/skills-origen.json`. Fuentes confiables:
  `FUENTES_BASE` + `negocio.json → fuentesSkills`.
- Tareas de departamento: `asignado: ''` + `paraDepartamento: true` + `departamentoId`. Las personas tienen
  `users.departamentoId`. La toma quien llegue primero; si nadie del equipo humano la toma en
  `negocio.json → esperaDepartamentoMin` (30 min), el motor se la da a un agente del departamento.
  Agencia → Tareas muestra la misma colección `tasks` agrupada por departamento.
- Entregables con vista previa: los roles con el grupo `salida` (`roles/catalogo.json`) pueden escribir solo en
  `./salida/` de su tarea (`Write(./salida/**)`). Al terminar, `motor/entregables.mjs` convierte cada HTML de
  `salida/` en PDF con Chromium (sin JavaScript, solo archivos de esa carpeta e imágenes/fuentes por https) y guarda
  imágenes de las páginas en `previews/{taskId}`. `ReviewPanel` las muestra; `entregaDrive` guarda los links de Drive.
- Permisos por tarea: `toolsFor(agent, t)` = grupos del rol + `taskTypes.herramientas` + `tasks.permisosExtra`
  (`permisosDeTarea` en `motor/agencia.mjs`, solo nombres de grupos del catálogo). Solo un admin puede poner o cambiar
  `permisosExtra` (reglas `sinPermisosNuevos` / `mismosPermisos`). Una tarea con permisos extra siempre va a Claude Code.
- `firestore.rules` — reglas de seguridad. `tools/configurar.mjs` las personaliza.
- `.claude/skills/instalar/` — asistente de instalación.

## Si la persona quiere instalarlo o configurarlo

Usa la skill **instalar** (`/instalar`). Si `app/.env` o `motor/negocio.json` no existen, el proyecto aún no está
instalado: ofrece empezar la instalación.

## Reglas para trabajar en este repo

- Nunca leas, muestres ni subas `motor/.env`, `app/.env`, `motor/negocio.json` ni contraseñas o tokens.
- Nada específico de un negocio va en el código: va en `.env`, `motor/negocio.json` o `roles/catalogo.json`.
- Los textos de la interfaz están en español.
- Para agregar una habilidad nueva, crea un rol en `roles/catalogo.json` (misión, herramientas, entrega).
