// Lectura de los fixtures (solo lectura) y resolución de rutas desde la raíz del proyecto.
// Ninguna ruta es absoluta: todo cuelga de `directory` (ctx.directory).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Solicitud,
  CeldaPlantilla,
  CampoPlantilla,
  CampoSolicitado,
  SoporteIndice,
} from "./tipos.ts";

/** Error de dominio con mensaje claro; las herramientas lo convierten en `{ ok: false }`. */
export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDominio";
  }
}

/** Mapa del maestro: objeto JSON arbitrario con claves en snake_case. */
export type Maestro = Record<string, unknown>;
/** Glosario: etiqueta del cliente → clave (posiblemente con punto) del maestro. */
export type Glosario = Record<string, string>;

const RAIZ_FIXTURES = ["fixtures", "reto-01"];

function leerJson<T>(ruta: string): T {
  if (!existsSync(ruta)) {
    throw new ErrorDominio(`No se encontró el archivo requerido: ${ruta}`);
  }
  let crudo: string;
  try {
    crudo = readFileSync(ruta, "utf8");
  } catch {
    throw new ErrorDominio(`No se pudo leer el archivo: ${ruta}`);
  }
  try {
    return JSON.parse(crudo) as T;
  } catch {
    throw new ErrorDominio(`El archivo no es JSON válido (posible plantilla corrupta): ${ruta}`);
  }
}

export function rutaCaso(directory: string, caso: string): string {
  // Evita traversal: el nombre del caso no puede contener separadores ni "..".
  if (/[\\/]|\.\./.test(caso)) {
    throw new ErrorDominio(`Nombre de caso inválido: "${caso}"`);
  }
  return join(directory, ...RAIZ_FIXTURES, "casos", caso);
}

export function rutaRepositorio(directory: string): string {
  return join(directory, ...RAIZ_FIXTURES, "repositorio");
}

export function leerMaestro(directory: string): Maestro {
  return leerJson<Maestro>(join(rutaRepositorio(directory), "maestro.json"));
}

export function leerGlosario(directory: string): Glosario {
  return leerJson<Glosario>(join(directory, ...RAIZ_FIXTURES, "glosario-campos.json"));
}

export function leerSoportesIndice(directory: string): SoporteIndice[] {
  return leerJson<SoporteIndice[]>(join(rutaRepositorio(directory), "soportes", "index.json"));
}

export function leerSolicitud(directory: string, caso: string): Solicitud {
  const dir = rutaCaso(directory, caso);
  if (!existsSync(dir)) {
    throw new ErrorDominio(`El caso "${caso}" no existe en fixtures/reto-01/casos/`);
  }
  return leerJson<Solicitud>(join(dir, "solicitud.json"));
}

export function leerSoportesExigidos(directory: string, caso: string): string[] {
  return leerJson<string[]>(join(rutaCaso(directory, caso), "soportes-exigidos.json"));
}

/**
 * Normaliza la plantilla del caso a una lista de campos solicitados,
 * independientemente del formato (xlsx usa celdas; pdf/portal usan orden).
 */
export function leerCampos(directory: string, solicitud: Solicitud): CampoSolicitado[] {
  const dir = rutaCaso(directory, solicitud.id);
  if (solicitud.formato === "xlsx") {
    const celdas = leerJson<CeldaPlantilla[]>(join(dir, "plantilla-celdas.json"));
    return celdas.map((c) => ({
      etiqueta: c.etiqueta,
      obligatorio: true,
      hoja: c.hoja,
      celda_etiqueta: c.celda_etiqueta,
      celda_valor: c.celda_valor,
    }));
  }
  // pdf y portal comparten plantilla-campos.json.
  const campos = leerJson<CampoPlantilla[]>(join(dir, "plantilla-campos.json"));
  return campos.map((c) => ({ etiqueta: c.etiqueta, obligatorio: c.obligatorio }));
}

/** Resuelve una clave con puntos ("banco.numero_cuenta") sobre un objeto. */
export function resolverRuta(obj: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, parte) => {
    if (acc !== null && typeof acc === "object" && parte in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[parte];
    }
    return undefined;
  }, obj);
}
