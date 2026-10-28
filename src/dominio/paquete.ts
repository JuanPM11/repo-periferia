// Armado del paquete para firma (HU-4): formulario + soportes + checklist + borrador de correo.

import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ItemChecklist, Solicitud, SoporteIndice } from "./tipos.ts";
import { rutaOutCaso, asegurarDir } from "./salida.ts";
import { rutaRepositorio } from "./fixtures.ts";
import { construirChecklist, fechaEjecucion, listoParaFirma } from "./soportes.ts";

export interface ResultadoPaquete {
  ruta: string;
  listo_para_firma: boolean;
  checklist: ItemChecklist[];
}

/** Nombres posibles del formulario ya generado, por orden de preferencia. */
const ARCHIVOS_FORMULARIO = ["formulario.xlsx", "formulario.pdf", "valores-portal.md"];

export function construirPaquete(
  directory: string,
  solicitud: Solicitud,
  exigidos: string[],
  indice: SoporteIndice[],
  fechaInyectada?: string,
): ResultadoPaquete {
  const hoy = fechaEjecucion(fechaInyectada);
  const dirCaso = rutaOutCaso(directory, solicitud.id);
  const dirPaquete = asegurarDir(join(dirCaso, "paquete"));
  const dirSoportes = join(rutaRepositorio(directory), "soportes");

  // 1) Formulario generado (si existe alguno).
  for (const nombre of ARCHIVOS_FORMULARIO) {
    const origen = join(dirCaso, nombre);
    if (existsSync(origen)) {
      copyFileSync(origen, join(dirPaquete, nombre));
      break;
    }
  }

  // 2) Checklist y copia de los soportes exigidos que existan en el repositorio.
  const checklist = construirChecklist(exigidos, indice, hoy);
  for (const item of checklist) {
    if (item.estado === "ausente") continue;
    const soporte = indice.find((s) => s.tipo === item.tipo);
    if (!soporte) continue;
    const origen = join(dirSoportes, soporte.archivo);
    if (existsSync(origen)) copyFileSync(origen, join(dirPaquete, soporte.archivo));
  }

  const listo = listoParaFirma(checklist);

  // 3) checklist.md
  writeFileSync(join(dirPaquete, "checklist.md"), renderChecklist(checklist, hoy, listo), "utf8");

  // 4) borrador-correo.md (RN2: nunca incluye datos bancarios).
  writeFileSync(join(dirPaquete, "borrador-correo.md"), renderBorradorCorreo(solicitud, checklist), "utf8");

  return { ruta: dirPaquete, listo_para_firma: listo, checklist };
}

function renderChecklist(checklist: ItemChecklist[], hoy: string, listo: boolean): string {
  const filas = checklist.map(
    (i) => `| ${i.tipo} | ${i.estado} | ${i.vigencia_hasta ?? "—"} | ${i.detalle} |`,
  );
  return [
    "# Checklist de soportes",
    "",
    `Fecha de evaluación: ${hoy}`,
    `Estado: **${listo ? "LISTO PARA FIRMA" : "NO listo para firma"}**`,
    "",
    "| Soporte | Estado | Vigencia hasta | Detalle |",
    "|---|---|---|---|",
    ...filas,
    "",
    listo
      ? "Todos los soportes exigidos están presentes y vigentes."
      : "Un soporte ausente o vencido bloquea la firma. Debe actualizarse antes de continuar.",
    "",
  ].join("\n");
}

function renderBorradorCorreo(solicitud: Solicitud, checklist: ItemChecklist[]): string {
  const presentes = checklist.filter((i) => i.estado === "presente").map((i) => i.tipo);
  const pendientes = checklist.filter((i) => i.estado !== "presente").map((i) => `${i.tipo} (${i.estado})`);
  return [
    "# Borrador de correo (no enviado)",
    "",
    `Para: ${solicitud.de}`,
    `Asunto: RE: ${solicitud.asunto}`,
    "",
    "Estimados,",
    "",
    "Adjuntamos el formulario de registro como proveedor diligenciado, pendiente de firma",
    "del representante legal, junto con los siguientes soportes:",
    "",
    ...(presentes.length ? presentes.map((t) => `- ${t}`) : ["- (ningún soporte vigente disponible)"]),
    "",
    ...(pendientes.length
      ? ["Soportes pendientes de actualizar antes del envío:", ...pendientes.map((t) => `- ${t}`), ""]
      : []),
    "Quedamos atentos.",
    "",
    "Periferia IT Group S.A.S.",
    "",
    "> Nota interna: este borrador no incluye datos bancarios por política (RN2).",
    "",
  ].join("\n");
}
