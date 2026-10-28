// Generación del formulario en el formato pedido (HU-3).
// P0 xlsx · P1 pdf · P2 portal (no soportado, solo valores copiables).

import { createWriteStream } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { CampoSolicitado, Mapeo } from "./tipos.ts";
import { valorParaEtiqueta } from "./mapeo.ts";

/** Etiqueta de estado de un campo para los formatos legibles. */
function estadoDe(mapeo: Mapeo, etiqueta: string): "lleno" | "requiere_confirmacion" | "faltante" {
  if (mapeo.requiere_confirmacion.some((c) => c.etiqueta === etiqueta)) return "requiere_confirmacion";
  if (mapeo.llenos.some((c) => c.etiqueta === etiqueta)) return "lleno";
  return "faltante";
}

/** P0 — Excel: escribe cada etiqueta y su valor en la hoja y celda indicadas. */
export async function generarExcel(
  dirCaso: string,
  campos: CampoSolicitado[],
  mapeo: Mapeo,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  for (const campo of campos) {
    if (!campo.hoja || !campo.celda_etiqueta || !campo.celda_valor) continue;
    const hoja = wb.getWorksheet(campo.hoja) ?? wb.addWorksheet(campo.hoja);
    hoja.getCell(campo.celda_etiqueta).value = campo.etiqueta;
    const valor = valorParaEtiqueta(mapeo, campo.etiqueta);
    hoja.getCell(campo.celda_valor).value = valor ?? ""; // faltante → celda vacía, nunca inventado.
  }
  const ruta = join(dirCaso, "formulario.xlsx");
  await wb.xlsx.writeFile(ruta);
  return ruta;
}

/** P1 — PDF: reproduce todos los campos con etiqueta y valor en el orden dado. */
export function generarPdf(
  dirCaso: string,
  campos: CampoSolicitado[],
  mapeo: Mapeo,
  cliente: string,
): Promise<string> {
  const ruta = join(dirCaso, "formulario.pdf");
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = createWriteStream(ruta);
    stream.on("finish", () => resolver(ruta));
    stream.on("error", rechazar);
    doc.pipe(stream);

    doc.fontSize(16).text("Formulario de registro como proveedor", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#555").text(`Cliente: ${cliente}`, { align: "center" });
    doc.moveDown(1).fillColor("#000");

    for (const campo of campos) {
      const estado = estadoDe(mapeo, campo.etiqueta);
      const valor = valorParaEtiqueta(mapeo, campo.etiqueta);
      doc.fontSize(11).fillColor("#000").text(`${campo.etiqueta}:`, { continued: true });
      if (estado === "faltante") {
        doc.fillColor("#b00").text("  (faltante)");
      } else if (estado === "requiere_confirmacion") {
        doc.fillColor("#a60").text(`  ${valor}  (requiere confirmación)`);
      } else {
        doc.fillColor("#000").text(`  ${valor}`);
      }
      doc.moveDown(0.3);
    }

    doc.end();
  });
}

/** P2 — Portal: no se rellena en línea; se dejan los valores listos para copiar. */
export function generarPortalMarkdown(
  campos: CampoSolicitado[],
  mapeo: Mapeo,
  cliente: string,
): string {
  const filas = campos.map((campo) => {
    const estado = estadoDe(mapeo, campo.etiqueta);
    const valor = valorParaEtiqueta(mapeo, campo.etiqueta) ?? "";
    return `| ${campo.etiqueta} | ${valor} | ${estado} |`;
  });
  return [
    `# Valores para el portal — ${cliente}`,
    "",
    "> Formato **portal web** no soportado por el agente. El ingreso de credenciales y el",
    "> clic final en el portal los realiza una persona. Aquí están los valores para copiar.",
    "",
    "| Campo | Valor | Estado |",
    "|---|---|---|",
    ...filas,
    "",
  ].join("\n");
}
