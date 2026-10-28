// Herramientas del agente. Son la ÚNICA fuente de valores que el modelo puede afirmar.
// Cada export es un objeto { description, args (zod), execute }. El nombre que ve el
// modelo es `proveedor_<export>`. Ninguna execute lanza: devuelve `{ ok, data }` o
// `{ ok: false, error }` serializado a string.

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ContextoTool, ResultadoTool } from "../dominio/tipos.ts";
import {
  leerSolicitud,
  leerCampos,
  leerMaestro,
  leerGlosario,
  leerSoportesExigidos,
  leerSoportesIndice,
  ErrorDominio,
} from "../dominio/fixtures.ts";
import { mapearCampos, identificadorPorPais } from "../dominio/mapeo.ts";
import {
  generarExcel,
  generarPdf,
  generarPortalMarkdown,
} from "../dominio/generadores.ts";
import { construirPaquete } from "../dominio/paquete.ts";
import { reiniciarCaso, rutaOutCaso, registrarLog } from "../dominio/salida.ts";

/** Envuelve una execute para que nunca lance y deje registro en el log. */
async function ejecutar<T>(
  ctx: ContextoTool,
  caso: string,
  herramienta: string,
  fn: () => Promise<{ data: T; resumen: string }>,
): Promise<string> {
  try {
    const { data, resumen } = await fn();
    registrarLog(ctx.directory, caso, { herramienta, ok: true, resumen });
    return JSON.stringify({ ok: true, data } satisfies ResultadoTool<T>);
  } catch (e) {
    const error = e instanceof ErrorDominio ? e.message : "Error inesperado procesando la solicitud.";
    registrarLog(ctx.directory, caso, { herramienta, ok: false, resumen: error });
    return JSON.stringify({ ok: false, error } satisfies ResultadoTool<T>);
  }
}

// ── P0 ─ Leer la solicitud (HU-1) ───────────────────────────────────────────
export const leer_solicitud = {
  description:
    "Lee el correo del cliente y su plantilla para un caso; devuelve país, cliente, formato de salida, campos solicitados y soportes exigidos.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute(args: { caso: string }, ctx: ContextoTool): Promise<string> {
    return ejecutar(ctx, args.caso, "proveedor_leer_solicitud", async () => {
      const solicitud = leerSolicitud(ctx.directory, args.caso);
      const campos = leerCampos(ctx.directory, solicitud);
      const soportes = leerSoportesExigidos(ctx.directory, args.caso);
      const glosario = leerGlosario(ctx.directory);
      // Reinicia la salida del caso para que reprocesarlo sea idempotente.
      reiniciarCaso(ctx.directory, args.caso);

      // HU-1: marca el identificador tributario ambiguo según el país.
      const camposSalida = campos.map((c) => {
        const clave = glosario[c.etiqueta];
        if (clave === "nit" && solicitud.pais !== "CO") {
          const equiv = identificadorPorPais(solicitud.pais);
          return {
            etiqueta: c.etiqueta,
            obligatorio: c.obligatorio,
            requiere_confirmacion: true as const,
            propuesta: `${equiv} (identificador de ${solicitud.pais})`,
          };
        }
        return { etiqueta: c.etiqueta, obligatorio: c.obligatorio };
      });

      return {
        data: {
          pais: solicitud.pais,
          cliente: solicitud.cliente,
          formato: solicitud.formato,
          campos: camposSalida,
          soportes,
        },
        resumen: `Caso ${args.caso}: ${campos.length} campos, formato ${solicitud.formato}, ${soportes.length} soportes exigidos.`,
      };
    });
  },
};

// ── P0 ─ Mapear campos al maestro (HU-2) ─────────────────────────────────────
export const mapear_campos = {
  description:
    "Cruza los campos solicitados de un caso con el repositorio maestro y los clasifica en llenos, faltantes o requiere_confirmacion. Nunca inventa valores.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    campos: z
      .array(z.string())
      .optional()
      .describe("Opcional: etiquetas sugeridas. Se ignoran para los valores; la plantilla del caso es la fuente."),
  },
  async execute(args: { caso: string; campos?: string[] }, ctx: ContextoTool): Promise<string> {
    return ejecutar(ctx, args.caso, "proveedor_mapear_campos", async () => {
      const solicitud = leerSolicitud(ctx.directory, args.caso);
      const campos = leerCampos(ctx.directory, solicitud);
      const maestro = leerMaestro(ctx.directory);
      const glosario = leerGlosario(ctx.directory);
      const mapeo = mapearCampos(campos, solicitud.pais, maestro, glosario);
      return {
        data: mapeo,
        resumen: `${mapeo.llenos.length} llenos, ${mapeo.faltantes.length} faltantes, ${mapeo.requiere_confirmacion.length} por confirmar.`,
      };
    });
  },
};

// ── P0 xlsx · P1 pdf · P2 portal ─ Generar el formulario (HU-3) ──────────────
export const generar_formulario = {
  description:
    "Genera el formulario diligenciado en el formato que pidió el cliente (xlsx, pdf) o, si es portal web, deja los valores listos para copiar. Los valores se re-derivan del maestro.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    mapeo: z
      .unknown()
      .optional()
      .describe("Opcional y no confiable: el formulario siempre re-deriva los valores del maestro."),
  },
  async execute(args: { caso: string }, ctx: ContextoTool): Promise<string> {
    return ejecutar<{ ruta: string; formato: string; soportado: boolean; nota?: string }>(ctx, args.caso, "proveedor_generar_formulario", async () => {
      const solicitud = leerSolicitud(ctx.directory, args.caso);
      const campos = leerCampos(ctx.directory, solicitud);
      const maestro = leerMaestro(ctx.directory);
      const glosario = leerGlosario(ctx.directory);
      const mapeo = mapearCampos(campos, solicitud.pais, maestro, glosario);
      const dirCaso = rutaOutCaso(ctx.directory, args.caso);

      if (solicitud.formato === "xlsx") {
        const ruta = await generarExcel(dirCaso, campos, mapeo);
        return { data: { ruta, formato: "xlsx", soportado: true }, resumen: `Excel generado en ${ruta}.` };
      }
      if (solicitud.formato === "pdf") {
        const ruta = await generarPdf(dirCaso, campos, mapeo, solicitud.cliente);
        return { data: { ruta, formato: "pdf", soportado: true }, resumen: `PDF generado en ${ruta}.` };
      }
      // portal: formato no soportado; se dejan los valores copiables.
      const ruta = join(dirCaso, "valores-portal.md");
      writeFileSync(ruta, generarPortalMarkdown(campos, mapeo, solicitud.cliente), "utf8");
      return {
        data: { ruta, formato: "portal", soportado: false, nota: "formato no soportado: valores listos para copiar" },
        resumen: `Portal no soportado; valores en ${ruta}.`,
      };
    });
  },
};

// ── P0 ─ Armar el paquete para firma (HU-4) ──────────────────────────────────
export const armar_paquete = {
  description:
    "Arma el paquete para firma de un caso: formulario, copias de los soportes exigidos, checklist (presentes/ausentes/vencidos) y borrador de correo. Indica si está listo para firma.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute(args: { caso: string }, ctx: ContextoTool): Promise<string> {
    return ejecutar(ctx, args.caso, "proveedor_armar_paquete", async () => {
      const solicitud = leerSolicitud(ctx.directory, args.caso);
      const exigidos = leerSoportesExigidos(ctx.directory, args.caso);
      const indice = leerSoportesIndice(ctx.directory);
      const r = construirPaquete(ctx.directory, solicitud, exigidos, indice, ctx.fechaEjecucion);
      const bloqueantes = r.checklist.filter((i) => i.estado !== "presente").map((i) => `${i.tipo}:${i.estado}`);
      return {
        data: r,
        resumen: r.listo_para_firma
          ? "Paquete listo para firma."
          : `No listo. Bloquean: ${bloqueantes.join(", ")}.`,
      };
    });
  },
};

// ── P1 ─ Simular envío (HU-4, RN4) ───────────────────────────────────────────
export const simular_envio = {
  description:
    "Simula el envío del paquete SOLO si el usuario confirmó explícitamente en el turno anterior. Sin confirmación, rechaza. 'Enviar' aquí solo escribe un archivo ENVIO-SIMULADO.md.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
    confirmado: z.boolean().describe("true solo si el usuario confirmó el envío en su último mensaje."),
  },
  async execute(args: { caso: string; confirmado: boolean }, ctx: ContextoTool): Promise<string> {
    if (!args.confirmado) {
      registrarLog(ctx.directory, args.caso, {
        herramienta: "proveedor_simular_envio",
        ok: false,
        resumen: "Rechazado: requiere confirmación explícita.",
      });
      return JSON.stringify({ ok: false, error: "requiere confirmación explícita" } satisfies ResultadoTool<never>);
    }
    return ejecutar(ctx, args.caso, "proveedor_simular_envio", async () => {
      const dirCaso = rutaOutCaso(ctx.directory, args.caso);
      if (!existsSync(dirCaso)) {
        throw new ErrorDominio(`No hay nada que enviar para "${args.caso}": procesa el caso primero.`);
      }
      const ruta = join(dirCaso, "ENVIO-SIMULADO.md");
      const solicitud = leerSolicitud(ctx.directory, args.caso);
      writeFileSync(
        ruta,
        [
          "# Envío simulado",
          "",
          `Caso: ${args.caso}`,
          `Destinatario: ${solicitud.de}`,
          `Confirmado por el usuario: sí`,
          `Marca de tiempo: ${new Date().toISOString()}`,
          "",
          "> En este reto el envío no sale a ningún sistema externo; solo deja esta constancia.",
          "",
        ].join("\n"),
        "utf8",
      );
      return { data: { ruta }, resumen: `Envío simulado registrado en ${ruta}.` };
    });
  },
};
