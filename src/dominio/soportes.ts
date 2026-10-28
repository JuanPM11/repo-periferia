// Lógica de soportes: vigencia y checklist del paquete (HU-4, RN3).

import type { ItemChecklist, SoporteIndice } from "./tipos.ts";

/** Fecha de ejecución efectiva (yyyy-mm-dd): inyectada, por entorno o la de hoy. */
export function fechaEjecucion(inyectada?: string): string {
  const env = process.env.FECHA_EJECUCION;
  const valor = inyectada ?? (env && env.trim() !== "" ? env : undefined);
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return new Date().toISOString().slice(0, 10);
}

/** Un soporte está vencido si tiene vigencia y es anterior a la fecha de ejecución. */
export function estaVencido(soporte: SoporteIndice, hoy: string): boolean {
  return soporte.vigencia_hasta !== null && soporte.vigencia_hasta < hoy;
}

/**
 * Construye el checklist de soportes exigidos contra el índice del repositorio.
 * Cada exigido queda como presente, ausente o vencido.
 */
export function construirChecklist(
  exigidos: string[],
  indice: SoporteIndice[],
  hoy: string,
): ItemChecklist[] {
  return exigidos.map((tipo) => {
    const soporte = indice.find((s) => s.tipo === tipo);
    if (!soporte) {
      return {
        tipo,
        estado: "ausente",
        vigencia_hasta: null,
        detalle: "Exigido por el cliente pero no existe en el repositorio.",
      };
    }
    if (estaVencido(soporte, hoy)) {
      return {
        tipo,
        estado: "vencido",
        vigencia_hasta: soporte.vigencia_hasta,
        detalle: `Vigente hasta ${soporte.vigencia_hasta}; vencido a la fecha ${hoy}.`,
      };
    }
    return {
      tipo,
      estado: "presente",
      vigencia_hasta: soporte.vigencia_hasta,
      detalle: soporte.descripcion,
    };
  });
}

/** Un vencido o un ausente bloquean la firma. Un campo faltante NO (RN3). */
export function listoParaFirma(checklist: ItemChecklist[]): boolean {
  return checklist.every((item) => item.estado === "presente");
}
