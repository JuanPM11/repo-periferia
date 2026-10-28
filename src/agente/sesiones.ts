// Almacén de sesiones en memoria (sin base de datos, PRD §3.2). Cada sesión guarda
// el historial neutral de la conversación y los tokens consumidos (tope de costo).

import { randomUUID } from "node:crypto";
import type { Entrada } from "../llm/adapter.ts";

export interface Sesion {
  id: string;
  historial: Entrada[];
  tokensUsados: number;
  creado: string;
}

const sesiones = new Map<string, Sesion>();

export function obtenerOCrear(id?: string): Sesion {
  if (id && sesiones.has(id)) return sesiones.get(id)!;
  const nueva: Sesion = {
    id: id && id.trim() !== "" ? id : randomUUID(),
    historial: [],
    tokensUsados: 0,
    creado: new Date().toISOString(),
  };
  sesiones.set(nueva.id, nueva);
  return nueva;
}

export function obtener(id: string): Sesion | undefined {
  return sesiones.get(id);
}
