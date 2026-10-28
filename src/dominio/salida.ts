// Gestión del directorio out/ y del registro de ejecución (CA4, RN5).

import { mkdirSync, rmSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function rutaOut(directory: string): string {
  return join(directory, "out");
}

export function rutaOutCaso(directory: string, caso: string): string {
  return join(rutaOut(directory), caso);
}

/** Limpia todo out/ (determinismo: demo.ts lo invoca al inicio). */
export function limpiarOut(directory: string): void {
  rmSync(rutaOut(directory), { recursive: true, force: true });
}

/** Reinicia el directorio de un caso para que reprocesarlo sea idempotente. */
export function reiniciarCaso(directory: string, caso: string): string {
  const dir = rutaOutCaso(directory, caso);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function asegurarDir(ruta: string): string {
  if (!existsSync(ruta)) mkdirSync(ruta, { recursive: true });
  return ruta;
}

export interface EntradaLog {
  herramienta: string;
  ok: boolean;
  resumen: string;
}

/** Registra una línea en out/<caso>/log.jsonl y en el log global out/log.jsonl. */
export function registrarLog(directory: string, caso: string, entrada: EntradaLog): void {
  const linea = JSON.stringify({ ts: new Date().toISOString(), ...entrada }) + "\n";
  asegurarDir(rutaOut(directory));
  appendFileSync(join(rutaOut(directory), "log.jsonl"), linea, "utf8");
  const dirCaso = rutaOutCaso(directory, caso);
  if (existsSync(dirCaso)) {
    appendFileSync(join(dirCaso, "log.jsonl"), linea, "utf8");
  }
}
