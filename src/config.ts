// Configuración leída del entorno. La clave del modelo vive solo aquí (backend) y
// nunca se expone por la API ni se registra en logs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdaptadorLLM } from "./llm/adapter.ts";
import { AdaptadorAnthropic } from "./llm/anthropic.ts";

export interface Config {
  proveedor: string;
  modelo: string;
  apiKey: string;
  maxIteraciones: number;
  maxTokensSesion: number;
  puerto: number;
}

function numeroEnv(nombre: string, porDefecto: number): number {
  const v = process.env[nombre];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export function cargarConfig(): Config {
  return {
    proveedor: process.env.LLM_PROVIDER ?? "anthropic",
    modelo: process.env.LLM_MODEL ?? "claude-haiku-5-5",
    // trim: tolera espacios o saltos de línea accidentales al pegar la clave
    // (un valor con \n es un header HTTP inválido).
    apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
    maxIteraciones: numeroEnv("MAX_ITERACIONES", 25),
    maxTokensSesion: numeroEnv("MAX_TOKENS_SESION", 120_000),
    puerto: numeroEnv("PORT", 3000),
  };
}

/** Crea el adaptador del proveedor configurado. Cambiar de proveedor se hace aquí. */
export function crearAdaptador(cfg: Config): AdaptadorLLM {
  switch (cfg.proveedor) {
    case "anthropic":
      if (cfg.apiKey.trim() === "") {
        throw new Error("Falta ANTHROPIC_API_KEY en el entorno del backend.");
      }
      return new AdaptadorAnthropic(cfg.apiKey, cfg.modelo);
    default:
      throw new Error(`Proveedor LLM no soportado: "${cfg.proveedor}".`);
  }
}

/** Ensambla el system prompt: comportamiento (agent/prompt.md) + conocimiento del proceso. */
export function cargarSystemPrompt(directory: string): string {
  const prompt = readFileSync(join(directory, "agent", "prompt.md"), "utf8");
  const conocimiento = readFileSync(
    join(directory, "src", "knowledge", "registro-proveedor.md"),
    "utf8",
  );
  return `${prompt}\n\n---\n\n# Conocimiento del proceso (referencia)\n\n${conocimiento}`;
}
