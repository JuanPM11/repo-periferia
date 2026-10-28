// Mapeo determinista de campos solicitados contra el maestro (HU-2, RN1).
// Esta es la ÚNICA fuente de valores que el agente puede afirmar: el modelo nunca
// inventa un dato, solo orquesta llamadas a estas funciones a través de las herramientas.

import type { CampoSolicitado, Mapeo, Pais } from "./tipos.ts";
import { resolverRuta, type Glosario, type Maestro } from "./fixtures.ts";

/** Identificador tributario equivalente por país (RN1). */
const IDENTIFICADOR_POR_PAIS: Record<Pais, string> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
};

/** Etiquetas genéricas de identificador tributario que exigen confirmación (HU-1). */
const ETIQUETAS_TRIBUTARIAS_AMBIGUAS = new Set([
  "identificacion tributaria",
  "numero de identificacion fiscal",
]);

export function identificadorPorPais(pais: Pais): string {
  return IDENTIFICADOR_POR_PAIS[pais];
}

/** Normaliza una etiqueta para comparar: minúsculas, sin acentos, espacios colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Busca una etiqueta en el glosario: coincidencia exacta y luego normalizada. */
function buscarClave(glosario: Glosario, etiqueta: string): string | undefined {
  if (etiqueta in glosario) return glosario[etiqueta];
  const objetivo = normalizar(etiqueta);
  for (const [clave, valor] of Object.entries(glosario)) {
    if (normalizar(clave) === objetivo) return valor;
  }
  return undefined;
}

/** Representa un valor del maestro como texto plano para el formulario. */
function valorComoTexto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return JSON.stringify(valor);
}

/**
 * Cruza cada campo solicitado con el maestro y lo clasifica en uno de tres estados.
 * Determinista: mismas entradas → mismas salidas.
 */
export function mapearCampos(
  campos: CampoSolicitado[],
  pais: Pais,
  maestro: Maestro,
  glosario: Glosario,
): Mapeo {
  const mapeo: Mapeo = { llenos: [], faltantes: [], requiere_confirmacion: [] };

  for (const campo of campos) {
    const clave = buscarClave(glosario, campo.etiqueta);

    // Sin entrada en el glosario → faltante. El agente nunca inventa (O2, CA2).
    if (clave === undefined) {
      mapeo.faltantes.push({
        etiqueta: campo.etiqueta,
        obligatorio: campo.obligatorio,
        motivo: "No existe en el glosario ni en el maestro.",
      });
      continue;
    }

    const valorRaw = resolverRuta(maestro, clave);
    if (valorRaw === undefined || valorRaw === null) {
      mapeo.faltantes.push({
        etiqueta: campo.etiqueta,
        obligatorio: campo.obligatorio,
        motivo: `Mapea a "${clave}" pero el maestro no tiene ese dato.`,
      });
      continue;
    }

    const valor = valorComoTexto(valorRaw);
    const esTributario = clave === "nit";
    const esAmbigua = ETIQUETAS_TRIBUTARIAS_AMBIGUAS.has(normalizar(campo.etiqueta));

    // RN1: el identificador tributario se traduce por país. Periferia solo tiene NIT
    // colombiano; para el resto se llena con el NIT y se marca requiere_confirmacion.
    if (esTributario && (pais !== "CO" || esAmbigua)) {
      const equivalente = identificadorPorPais(pais);
      const nota =
        pais !== "CO"
          ? `Identificador extranjero: Periferia solo posee NIT colombiano; se usa como ${equivalente} de ${pais}.`
          : `Etiqueta genérica: confirmar que corresponde al ${equivalente}.`;
      mapeo.requiere_confirmacion.push({
        etiqueta: campo.etiqueta,
        clave,
        valor,
        nota,
        propuesta: `${equivalente} = ${valor}`,
      });
      continue;
    }

    mapeo.llenos.push({ etiqueta: campo.etiqueta, clave, valor });
  }

  return mapeo;
}

/** Valor a escribir en el formulario para una etiqueta, según el mapeo. */
export function valorParaEtiqueta(mapeo: Mapeo, etiqueta: string): string | null {
  const lleno = mapeo.llenos.find((c) => c.etiqueta === etiqueta);
  if (lleno) return lleno.valor;
  const confirmar = mapeo.requiere_confirmacion.find((c) => c.etiqueta === etiqueta);
  if (confirmar) return confirmar.valor;
  return null; // faltante → celda vacía, nunca un valor inventado.
}
