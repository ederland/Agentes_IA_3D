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
- Modelo alterno: un agente con `modelo.proveedor = 'alterno'` usa una API compatible con OpenAI (`ALT_LLM_*` en
  `motor/.env`), solo texto y sin herramientas.
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
