// Ciclo del agente: prompt → modelo → llamadas a herramientas → respuesta.
// Topes de iteraciones y de tokens por sesión (CA1, costo). Nunca afirma valores
// fuera de las herramientas (CA2, garantizado por el diseño de las tools).

import type { AdaptadorLLM } from "../llm/adapter.ts";
import { ErrorProveedor } from "../llm/adapter.ts";
import type { ContextoTool } from "../dominio/tipos.ts";
import { listaHerramientas, ejecutarHerramienta } from "../tools/registro.ts";
import type { Sesion } from "./sesiones.ts";

/** Una llamada a herramienta tal como la ve el front (CA4: visible en el chat). */
export interface LlamadaVisible {
  nombre: string;
  args: unknown;
  ok: boolean;
  resumen: string;
}

export interface ResultadoCiclo {
  reply: string;
  toolCalls: LlamadaVisible[];
  needsConfirmation: boolean;
}

export interface LimitesCiclo {
  maxIteraciones: number;
  maxTokensSesion: number;
}

const HERRAMIENTAS = listaHerramientas();

export async function ejecutarCiclo(
  adaptador: AdaptadorLLM,
  sesion: Sesion,
  system: string,
  mensajeUsuario: string,
  ctx: ContextoTool,
  limites: LimitesCiclo,
): Promise<ResultadoCiclo> {
  sesion.historial.push({ rol: "usuario", texto: mensajeUsuario });

  const toolCalls: LlamadaVisible[] = [];
  let reply = "";

  for (let iteracion = 0; iteracion < limites.maxIteraciones; iteracion++) {
    if (sesion.tokensUsados >= limites.maxTokensSesion) {
      reply = "Alcancé el tope de tokens de esta sesión. Inicia una sesión nueva para continuar.";
      break;
    }

    let respuesta;
    try {
      respuesta = await adaptador.enviar(system, sesion.historial, HERRAMIENTAS);
    } catch (e) {
      const msg = e instanceof ErrorProveedor ? e.message : "Error inesperado con el proveedor LLM.";
      reply = `No pude completar la consulta al modelo: ${msg}`;
      break;
    }

    sesion.tokensUsados += respuesta.tokens;
    sesion.historial.push({
      rol: "asistente",
      texto: respuesta.texto,
      llamadas: respuesta.llamadas,
    });

    // El modelo cerró el turno sin pedir herramientas: esa es la respuesta final.
    if (respuesta.fin === "fin" || respuesta.llamadas.length === 0) {
      reply = respuesta.texto;
      break;
    }

    // Ejecuta cada herramienta pedida y devuelve los resultados al modelo.
    const resultados: Array<{ id: string; contenido: string }> = [];
    for (const llamada of respuesta.llamadas) {
      const contenido = await ejecutarHerramienta(llamada.nombre, llamada.args, ctx);
      resultados.push({ id: llamada.id, contenido });
      const { ok, resumen } = resumir(contenido);
      toolCalls.push({ nombre: llamada.nombre, args: llamada.args, ok, resumen });
    }
    sesion.historial.push({ rol: "herramienta", resultados });

    // Tope de iteraciones alcanzado en la próxima vuelta: deja constancia.
    if (iteracion === limites.maxIteraciones - 1) {
      reply =
        respuesta.texto ||
        "Alcancé el tope de iteraciones por turno. Esto es lo que logré avanzar; pídeme continuar.";
    }
  }

  return { reply, toolCalls, needsConfirmation: pideConfirmacion(reply, toolCalls) };
}

/** Resume el resultado JSON de una herramienta para mostrarlo en el chat. */
function resumir(contenido: string): { ok: boolean; resumen: string } {
  try {
    const r = JSON.parse(contenido) as { ok: boolean; data?: unknown; error?: string };
    if (r.ok) return { ok: true, resumen: truncar(JSON.stringify(r.data ?? {})) };
    return { ok: false, resumen: r.error ?? "error" };
  } catch {
    return { ok: false, resumen: "resultado no legible" };
  }
}

function truncar(s: string, max = 180): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Señala si el agente está pidiendo confirmación para que el front lo resalte (CA3).
 * Heurística: el envío fue rechazado por falta de confirmación, o la respuesta final
 * pregunta explícitamente por confirmar/enviar/firmar.
 */
function pideConfirmacion(reply: string, toolCalls: LlamadaVisible[]): boolean {
  const rechazado = toolCalls.some(
    (t) => t.nombre === "proveedor_simular_envio" && !t.ok && /confirm/i.test(t.resumen),
  );
  const preguntaConfirm = /confirm/i.test(reply) || /¿[^?]*\b(env[ií]|firm)/i.test(reply);
  return rechazado || preguntaConfirm;
}
