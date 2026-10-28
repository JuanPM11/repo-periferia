// API HTTP del chat y arranque del ciclo del agente. Sirve también el front estático.
// Un solo proceso levanta front + backend (PRD §8).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cargarConfig, crearAdaptador, cargarSystemPrompt } from "./config.ts";
import type { AdaptadorLLM } from "./llm/adapter.ts";
import type { ContextoTool } from "./dominio/tipos.ts";
import { obtenerOCrear, obtener } from "./agente/sesiones.ts";
import { ejecutarCiclo } from "./agente/ciclo.ts";

const DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = cargarConfig();
const SYSTEM = cargarSystemPrompt(DIRECTORY);

// El adaptador se crea perezosamente: /api/health no necesita clave.
let adaptador: AdaptadorLLM | null = null;
function obtenerAdaptador(): AdaptadorLLM {
  if (!adaptador) adaptador = crearAdaptador(cfg);
  return adaptador;
}

const app = new Hono();

app.get("/", (c) => c.html(readFileSync(join(DIRECTORY, "web", "index.html"), "utf8")));

app.get("/api/health", (c) =>
  c.json({ ok: true, provider: cfg.proveedor, model: cfg.modelo }),
);

app.get("/api/sessions/:id", (c) => {
  const sesion = obtener(c.req.param("id"));
  if (!sesion) return c.json({ ok: false, error: "Sesión no encontrada" }, 404);
  return c.json({ id: sesion.id, creado: sesion.creado, historial: sesion.historial });
});

app.post("/api/chat", async (c) => {
  let cuerpo: { sessionId?: string; message?: string };
  try {
    cuerpo = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Cuerpo JSON inválido" }, 400);
  }
  const message = (cuerpo.message ?? "").trim();
  if (message === "") return c.json({ ok: false, error: "El mensaje está vacío" }, 400);

  const sesion = obtenerOCrear(cuerpo.sessionId);
  const ctx: ContextoTool = { directory: DIRECTORY, sessionId: sesion.id };

  try {
    const resultado = await ejecutarCiclo(obtenerAdaptador(), sesion, SYSTEM, message, ctx, {
      maxIteraciones: cfg.maxIteraciones,
      maxTokensSesion: cfg.maxTokensSesion,
    });
    return c.json({ sessionId: sesion.id, ...resultado });
  } catch (e) {
    // Falla de configuración (p. ej. clave ausente): mensaje claro, la sesión no muere.
    const error = e instanceof Error ? e.message : "Error inesperado en el servidor.";
    return c.json({ sessionId: sesion.id, reply: `No pude iniciar el agente: ${error}`, toolCalls: [], needsConfirmation: false });
  }
});

serve({ fetch: app.fetch, port: cfg.puerto }, (info) => {
  console.log(`Agente de registro como proveedor escuchando en http://localhost:${info.port}`);
  console.log(`Proveedor: ${cfg.proveedor} · Modelo: ${cfg.modelo} · Clave: ${cfg.apiKey ? "presente" : "AUSENTE"}`);
});
