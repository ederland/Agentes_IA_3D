---
name: instalar
description: Asistente de instalación de Agentes IA 3D. Entrevista al usuario (negocio, marca, equipo de agentes y sus roles, conectores), configura Firebase, crea los agentes, publica la app y deja el motor funcionando. Úsala cuando el usuario diga /instalar, "instalar", "configurar mi oficina", "poner en marcha" o abra el repositorio por primera vez.
---

# Instalar Agentes IA 3D

Vas a dejar funcionando, para el negocio de esta persona: la app web (Pipeline, Oficina 3D, chat con agentes),
sus agentes de IA y el motor que los ejecuta en su PC con Claude Code. Habla en el idioma del usuario
(español por defecto), en pasos cortos, y confirma cada fase antes de seguir.

## Reglas de seguridad (no negociables)

- **Nunca** pidas, leas, escribas ni repitas contraseñas, tokens o claves privadas. Cuando haga falta una,
  abre el archivo `motor/.env` para que la persona la pegue ella misma (en Windows: `notepad motor\.env`;
  en Mac: `open -e motor/.env`) y espera a que diga "listo".
  Para verificar sin ver el valor, comprueba solo que la línea ya no diga `PEGA_AQUI`.
- La configuración web de Firebase (apiKey, projectId, appId…) **es pública** y sí puedes recibirla.
- Inicios de sesión (Google, Firebase CLI, Claude Code, Magnific) los hace la persona en su navegador.
- No publiques nada en redes ni envíes mensajes en su nombre.

## Fase 0 · Requisitos

Comprueba con comandos: `node --version` (necesita 22 o superior) y `git --version`.
Si falta Node, indica que lo instale desde https://nodejs.org (versión LTS) y que reabra la terminal.
Explica lo que va a necesitar: una cuenta de Google, una suscripción de Claude (Pro o Max) y unos 30 minutos.

## Fase 1 · Entrevista

Usa la herramienta de preguntas (AskUserQuestion) cuando las opciones sean cerradas; si no, pregunta en texto.
Reúne:

1. **Negocio:** nombre, a qué se dedica (2-3 líneas), tono de comunicación, idioma.
2. **Marca:** color principal (hex), descripción corta de la identidad visual, logo opcional
   (si da un archivo, cópialo a `app/public/marca/` —carpeta ignorada por git— y usa `/marca/<archivo>`;
   si tiene versión para fondo oscuro, va en `logoOscuro`, y un ícono cuadrado en `favicon`).
3. **Dueño:** nombre y correo de Google con el que entrará (será el super admin).
4. **Nombre de la app** (por defecto "<Negocio> · Oficina IA").
5. **Equipo de agentes.** Muestra los roles de `roles/catalogo.json` (nombre y descripción de cada uno) y pregunta
   cuántos agentes quiere (recomienda empezar con 3 a 6) y, para cada uno: **nombre** que le quiere poner y **rol**.
   - Recomienda siempre un agente con rol `coordinador`: es quien reparte el trabajo y habla por Telegram.
   - Avisa qué roles necesitan algo extra (campo `conectores`): `imagenes` requiere Magnific (de pago);
     `coordinador` aprovecha Gmail, Calendar y Telegram (opcionales).
   - Los nombres los elige la persona. No propongas nombres de personajes con marca registrada (Marvel, Disney, etc.).
6. **Conectores opcionales:** Telegram (hablar con el coordinador y recibir avisos), Gmail/Calendar/Drive,
   Magnific, editor de video.

Resume todo en una tabla y pide confirmación.

## Fase 2 · Firebase (la persona hace los clics, tú guías)

Guíala paso a paso en https://console.firebase.google.com :

1. **Crear proyecto** (plan gratuito Spark; Google Analytics no es necesario).
2. **Agregar app web** (ícono `</>`), sin Hosting en ese paso. Pídele que copie el objeto `firebaseConfig`
   y te lo pegue (es público).
3. **Authentication → Comenzar → Método de acceso:** habilitar **Google** y **Correo electrónico/contraseña**
   (solo el primer interruptor).
4. **Authentication → Usuarios → Agregar usuario:** el **robot del motor**. Sugiere un alias de su Gmail,
   por ejemplo `sunombre+agentes@gmail.com` (no hay que crear ningún correo nuevo), y que invente una
   contraseña larga. **No te la debe decir.**
5. **No** desmarques "Habilitar creación (registro)" en Authentication → Configuración: ese interruptor bloquea
   también las cuentas nuevas de Google (el dueño no podría entrar: `auth/admin-restricted-operation`).
   La protección está en `firestore.rules`: toda cuenta nueva queda "pendiente" hasta que un admin la apruebe.
6. **Firestore Database → Crear base de datos:** modo producción, la ubicación más cercana.

## Fase 3 · Configurar

1. Escribe `instalacion.json` en la raíz con lo reunido (formato al inicio de `tools/configurar.mjs`; sin contraseñas)
   y ejecuta `node tools/configurar.mjs instalacion.json`. Luego borra `instalacion.json`.
2. Abre `motor/.env` para que la persona pegue la **contraseña del robot** en `AGENT_PASSWORD` y guarde.
3. Instala dependencias: `npm install` dentro de `app/` y dentro de `motor/`
   (en Windows con PowerShell usa `npm.cmd` si los scripts están bloqueados).

## Fase 4 · Publicar la app y las reglas

1. La persona inicia sesión en Firebase CLI: `npx firebase-tools login` (se abre el navegador).
2. `npm run build` en `app/`, y luego en la raíz: `npx firebase-tools deploy --only hosting,firestore:rules`.
3. Dale la URL (`https://<projectId>.web.app`) y pídele que entre con su cuenta de Google (la del dueño).
   Debe quedar como Super Admin automáticamente.

## Fase 5 · Agentes y motor

1. En `motor/`: `npm run check` (debe decir "Verificación OK"). Si falla con credenciales, revisa el `.env` (sin leer la clave)
   y el usuario robot en Authentication.
2. `npm run crear-agentes`: crea en la app los agentes de la entrevista y guarda sus IDs en `motor/negocio.json`.
3. **Claude Code para el motor:** el motor usa el Claude Code instalado en `motor/node_modules`. Si la persona no ha
   iniciado sesión en Claude Code en este equipo, que ejecute en `motor/`: `npx claude auth login`
   (en Windows: `node_modules\.bin\claude.cmd auth login`).
4. Según los roles elegidos:
   - `editor_video`, `imagenes` o `diseno_web` → registra el servidor de medios:
     `npx claude mcp add --scope user agentes-media -- node <ruta absoluta>/motor/media-server.mjs`
   - `diseno_web` → recomienda las Design Skills de typeui.sh (https://www.typeui.sh/design-skills, MIT, de sus autores).
     Si la persona las quiere, que las descargue desde ese sitio y copie cada carpeta de skill dentro de
     `motor/.claude/skills/`. No las copies tú desde otra fuente.
   - `editor_video` → skills de animación: en `motor/`, `npx skills add heygen-com/hyperframes --all -a claude-code -y`
   - `imagenes` → Magnific: `npx claude mcp add --transport http --scope user magnific https://mcp.magnific.com`,
     y luego la persona abre `claude`, escribe `/mcp`, elige magnific → Authenticate.
   - Gmail / Calendar / Drive → la persona los conecta en claude.ai → Configuración → Conectores
     (el motor los usa automáticamente si están conectados).
   - Entregas directo a Google Drive (opcional): si tiene Google Drive para escritorio, crea una carpeta en
     "Mi unidad" (p. ej. `Agentes IA`) y escribe `motor/media-config.json` con `{ "driveLocal": "<ruta de esa carpeta>" }`.
     Si no, los archivos quedan en `motor/entregas/<agente>`.
5. Arranca el motor: Windows `motor\iniciar-agentes.bat`; Mac/Linux `bash motor/iniciar-agentes.sh`.
   En la Oficina debe aparecer "Motor de agentes conectado".
6. Inicio automático (opcional): Windows `powershell -ExecutionPolicy Bypass -File tools\inicio-automatico-windows.ps1`;
   Mac `bash tools/inicio-automatico-mac.sh`.

## Fase 6 · Telegram (opcional)

1. En Telegram, @BotFather → `/newbot` → nombre y usuario terminado en `bot`. Recibe un token.
2. Abre `motor/.env` para que pegue el token en `TELEGRAM_BOT_TOKEN` (no te lo debe decir) y reinicia el motor.
3. Que le escriba "hola" a su bot: el bot responde con su ID. Escribe ese ID en `TELEGRAM_OWNER_ID`
   (el ID no es secreto) y reinicia el motor. Desde ahí el bot solo le responde a esa persona.

## Fase 7 · Prueba final

Pídele que cree una tarea corta para uno de sus agentes en el Pipeline (por ejemplo, "3 ideas de posts para esta semana").
Debe pasar a "En progreso", el agente aparece trabajando en la Oficina y la entrega llega a "Espera Aprobación".
Termina con un resumen: URL, agentes creados, cómo encender el motor, y dónde editar agentes (sección **Agentes**).

## Problemas comunes

- `permission-denied` en el motor: las reglas no se publicaron, o el correo del robot en `firestore.rules`
  no coincide con el de `motor/.env`. Vuelve a ejecutar `tools/configurar.mjs` y publica las reglas.
- Telegram no conecta: algunas redes bloquean api.telegram.org; el motor reintenta solo cada 30 s.
- El agente dice que no tiene permiso para una herramienta: revisa su rol en `roles/catalogo.json`
  y `motor/negocio.json → agentes[id]`.
