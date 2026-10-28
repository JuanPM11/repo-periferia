// Verificación sin modelo (PRD §6.6). Ejecuta todos los casos llamando directamente
// a las herramientas e imprime un resumen por caso. No requiere clave de ningún proveedor.
//
//   npm run demo     (o: bun run demo.ts)

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextoTool, Mapeo, ItemChecklist } from "./src/dominio/tipos.ts";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor.ts";
import { limpiarOut } from "./src/dominio/salida.ts";

const DIRECTORY = dirname(fileURLToPath(import.meta.url));

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
function parse<T>(s: string): Res<T> {
  return JSON.parse(s) as Res<T>;
}

function casos(): string[] {
  const dir = join(DIRECTORY, "fixtures", "reto-01", "casos");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function procesar(caso: string, ctx: ContextoTool): Promise<void> {
  console.log(`\n═══ Caso: ${caso} ${"═".repeat(Math.max(0, 48 - caso.length))}`);

  const solicitud = parse<{ pais: string; cliente: string; formato: string; campos: unknown[]; soportes: string[] }>(
    await leer_solicitud.execute({ caso }, ctx),
  );
  if (!solicitud.ok) return void console.log(`  leer_solicitud → ERROR: ${solicitud.error}`);
  console.log(`  País: ${solicitud.data.pais} · Cliente: ${solicitud.data.cliente} · Formato: ${solicitud.data.formato}`);
  console.log(`  Campos solicitados: ${solicitud.data.campos.length} · Soportes exigidos: ${solicitud.data.soportes.length}`);

  const mapeo = parse<Mapeo>(await mapear_campos.execute({ caso }, ctx));
  if (mapeo.ok) {
    const m = mapeo.data;
    console.log(`  Mapeo → llenos: ${m.llenos.length} · faltantes: ${m.faltantes.length} · por confirmar: ${m.requiere_confirmacion.length}`);
    for (const f of m.faltantes) console.log(`     · faltante: ${f.etiqueta} (${f.motivo})`);
    for (const c of m.requiere_confirmacion) console.log(`     · confirmar: ${c.etiqueta} → ${c.propuesta}`);
  } else {
    console.log(`  mapear_campos → ERROR: ${mapeo.error}`);
  }

  const form = parse<{ ruta: string; formato: string; soportado: boolean }>(
    await generar_formulario.execute({ caso }, ctx),
  );
  console.log(form.ok ? `  Formulario (${form.data.formato}${form.data.soportado ? "" : ", no soportado"}): ${rel(form.data.ruta)}` : `  generar_formulario → ERROR: ${form.error}`);

  const paquete = parse<{ ruta: string; listo_para_firma: boolean; checklist: ItemChecklist[] }>(
    await armar_paquete.execute({ caso }, ctx),
  );
  if (paquete.ok) {
    console.log(`  Paquete: ${rel(paquete.data.ruta)} · listo_para_firma: ${paquete.data.listo_para_firma ? "SÍ" : "NO"}`);
    for (const i of paquete.data.checklist.filter((x) => x.estado !== "presente")) {
      console.log(`     · soporte ${i.estado}: ${i.tipo}`);
    }
  } else {
    console.log(`  armar_paquete → ERROR: ${paquete.error}`);
  }

  // RN4: sin confirmación, el envío se rechaza.
  const rechazo = parse<{ ruta: string }>(await simular_envio.execute({ caso, confirmado: false }, ctx));
  console.log(`  simular_envio(confirmado=false) → ${rechazo.ok ? "ACEPTÓ (incorrecto)" : `rechazado correctamente ("${rechazo.error}")`}`);
}

function rel(ruta: string): string {
  return ruta.startsWith(DIRECTORY) ? ruta.slice(DIRECTORY.length + 1) : ruta;
}

async function main(): Promise<void> {
  limpiarOut(DIRECTORY); // determinismo: out/ se limpia al inicio.
  const ctx: ContextoTool = { directory: DIRECTORY, sessionId: "demo" };
  console.log("Reto 01 — verificación de herramientas sin modelo");
  console.log(`Fecha de evaluación de vigencias: ${new Date().toISOString().slice(0, 10)} (override con FECHA_EJECUCION)`);
  for (const caso of casos()) await procesar(caso, ctx);
  console.log("\nListo. Revisa la carpeta out/ para los artefactos generados.\n");
}

main().catch((e) => {
  console.error("Fallo inesperado en la demo:", e);
  process.exit(1);
});
