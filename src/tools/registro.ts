// Registro de herramientas: expone el catálogo al modelo y valida los argumentos
// con zod antes de ejecutar. El nombre que ve el modelo es `proveedor_<export>`.

import { z, ZodType } from "zod";
import type { ContextoTool } from "../dominio/tipos.ts";
import * as proveedor from "./proveedor.ts";

interface DefinicionTool {
  description: string;
  args: Record<string, ZodType>;
  execute: (args: Record<string, unknown>, ctx: ContextoTool) => Promise<string>;
}

/** Catálogo: nombre completo (`proveedor_<export>`) → definición. */
const CATALOGO: Record<string, DefinicionTool> = Object.fromEntries(
  Object.entries(proveedor).map(([nombre, def]) => [
    `proveedor_${nombre}`,
    def as unknown as DefinicionTool,
  ]),
);

/** JSON Schema para el proveedor LLM, derivado de los esquemas zod. */
export interface EsquemaHerramienta {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type?: string; description?: string; items?: { type: string } }>;
    required: string[];
  };
}

function propiedadDesdeZod(tipo: ZodType): { type?: string; description?: string; items?: { type: string } } {
  let actual: ZodType = tipo;
  const description = actual.description;
  // Desenvuelve optional para leer el tipo base.
  if (actual instanceof z.ZodOptional) actual = actual.unwrap();
  if (actual instanceof z.ZodString) return { type: "string", description };
  if (actual instanceof z.ZodBoolean) return { type: "boolean", description };
  if (actual instanceof z.ZodNumber) return { type: "number", description };
  if (actual instanceof z.ZodArray) return { type: "array", description, items: { type: "string" } };
  // z.unknown() u otros: sin restricción de tipo.
  return { description };
}

export function listaHerramientas(): EsquemaHerramienta[] {
  return Object.entries(CATALOGO).map(([name, def]) => {
    const properties: EsquemaHerramienta["input_schema"]["properties"] = {};
    const required: string[] = [];
    for (const [campo, tipo] of Object.entries(def.args)) {
      properties[campo] = propiedadDesdeZod(tipo);
      if (!(tipo instanceof z.ZodOptional)) required.push(campo);
    }
    return { name, description: def.description, input_schema: { type: "object", properties, required } };
  });
}

/** Ejecuta una herramienta validando args. Devuelve siempre un string (nunca lanza). */
export async function ejecutarHerramienta(
  name: string,
  rawArgs: unknown,
  ctx: ContextoTool,
): Promise<string> {
  const def = CATALOGO[name];
  if (!def) {
    return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
  }
  const esquema = z.object(def.args);
  const parseado = esquema.safeParse(rawArgs ?? {});
  if (!parseado.success) {
    const detalle = parseado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return JSON.stringify({ ok: false, error: `Argumentos inválidos para ${name}: ${detalle}` });
  }
  return def.execute(parseado.data as Record<string, unknown>, ctx);
}

export const nombresHerramientas = Object.keys(CATALOGO);
