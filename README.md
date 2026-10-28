# Agente conversacional — Registro como Proveedor

Agente que automatiza el llenado de formularios de registro como proveedor: lee la
solicitud del cliente, llena los campos desde el repositorio maestro, genera el
formulario en el formato pedido (Excel / PDF / portal) y arma el paquete para la firma
del representante legal. **Nunca firma ni envía sin confirmación humana.**

Reto técnico 01 · Perxia 2.0 · Periferia IT Group.

## Requisitos

- **Node 22.6+** (recomendado 24; probado en Node 24) o **Bun**. El TypeScript se
  ejecuta directamente, sin paso de build. Node 24 corre `.ts` de forma nativa; en
  22.6–23.5 se requiere el flag `--experimental-strip-types`.

## Levantar en local (un comando)

```bash
npm install
npm run dev
```

Luego abre <http://localhost:3000>. Un solo proceso sirve el front y la API.

Con Bun: `bun install && bun run src/server.ts`.

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. La clave del modelo vive **solo** aquí
(backend) y nunca se expone en el front, el repositorio, los logs ni la API.

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `LLM_PROVIDER` | sí | Proveedor del adaptador. Implementado: `anthropic`. |
| `LLM_MODEL` | sí | Modelo. Por defecto `claude-haiku-5-5`. |
| `ANTHROPIC_API_KEY` | sí (para chat en vivo) | Clave del proveedor. El chat no funciona sin ella; `demo.ts` sí. |
| `MAX_ITERACIONES` | no | Tope de iteraciones por turno (25). |
| `MAX_TOKENS_SESION` | no | Tope de tokens por sesión (120000). |
| `PORT` | no | Puerto del backend (3000). |
| `FECHA_EJECUCION` | no | `yyyy-mm-dd` para fijar la fecha que evalúa vigencias (reproducibilidad). |

Node carga `.env` automáticamente si lo pasas con `node --env-file=.env src/server.ts`,
o exporta las variables en tu shell antes de `npm run dev`.

## Verificación sin modelo (`demo.ts`)

Ejecuta todas las herramientas sobre los 4 casos **sin clave de ningún proveedor** y
escribe los artefactos en `out/`:

```bash
npm run demo
```

Imprime, por caso: país y formato, conteo de campos llenos/faltantes/por confirmar, la
ruta del formulario, el estado `listo_para_firma` con los soportes que bloquean, y la
verificación de que el envío se rechaza sin confirmación.

## API

| Método | Ruta | Cuerpo → respuesta |
|--------|------|--------------------|
| `POST` | `/api/chat` | `{ sessionId?, message }` → `{ sessionId, reply, toolCalls[], needsConfirmation }` |
| `GET`  | `/api/sessions/:id` | Historial completo de la sesión |
| `GET`  | `/api/health` | `{ ok, provider, model }` (sin exponer la clave) |

## Prueba rápida en el chat

```
Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan,
si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.
```

El agente mostrará sus llamadas a herramientas, el resumen y cerrará con una pregunta.
Un segundo mensaje "envía" solo produce `out/ec-corp-andina/ENVIO-SIMULADO.md` tras tu
confirmación explícita.

## Estructura

```
agent/prompt.md                 comportamiento (system prompt)
src/knowledge/                  conocimiento del proceso
src/tools/proveedor.ts          las 5 herramientas (zod, nunca lanzan)
src/dominio/                    lógica determinista (mapeo, vigencias, generadores)
src/llm/                        adaptador del proveedor + implementación Anthropic
src/agente/                     ciclo del agente y sesiones
src/server.ts                   API HTTP + sirve el front
web/index.html                  front de chat
demo.ts                         verificación sin modelo
modulo/                         bonus: agente empaquetado (mismas tools y prompt)
fixtures/reto-01/               insumos entregados (solo lectura)
out/                            artefactos generados
```

## Despliegue (link público)

El repositorio incluye `render.yaml` para desplegar en [Render](https://render.com):

1. Entra a Render → **New** → **Web Service** → conecta el repo `JuanPM11/repo-periferia`.
2. Render detecta `render.yaml`. Deja `buildCommand: npm install` y `startCommand: npm start`.
3. En **Environment**, agrega `ANTHROPIC_API_KEY` con tu clave (las demás vienen del blueprint).
4. Deploy. Render asigna una URL pública; el servidor lee `PORT` automáticamente.

Equivalente en Railway/Fly.io: mismo build/start y la misma variable de entorno.

## Link de prueba

> URL pública: _(pegar aquí tras el deploy)_. Mientras tanto, corre en local con los
> comandos de arriba.
