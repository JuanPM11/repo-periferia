// Implementación del adaptador para Anthropic. Traduce el historial neutral al
// formato de la API de Mensajes y de vuelta. La clave se lee de ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import type {
  AdaptadorLLM,
  Entrada,
  HerramientaLLM,
  LlamadaHerramienta,
  RespuestaLLM,
} from "./adapter.ts";
import { ErrorProveedor } from "./adapter.ts";

const TIMEOUT_MS = 60_000;
const MAX_TOKENS_RESPUESTA = 1536;

export class AdaptadorAnthropic implements AdaptadorLLM {
  readonly proveedor = "anthropic";
  readonly modelo: string;
  private readonly cliente: Anthropic;

  constructor(apiKey: string, modelo: string) {
    this.modelo = modelo;
    this.cliente = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
  }

  async enviar(
    system: string,
    historial: Entrada[],
    herramientas: HerramientaLLM[],
  ): Promise<RespuestaLLM> {
    try {
      const respuesta = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: MAX_TOKENS_RESPUESTA,
        system,
        messages: historial.map(aMensaje),
        tools: herramientas.map((h) => ({
          name: h.name,
          description: h.description,
          input_schema: h.input_schema,
        })),
      });

      let texto = "";
      const llamadas: LlamadaHerramienta[] = [];
      for (const bloque of respuesta.content) {
        if (bloque.type === "text") texto += bloque.text;
        else if (bloque.type === "tool_use") {
          llamadas.push({ id: bloque.id, nombre: bloque.name, args: bloque.input });
        }
      }
      return {
        texto,
        llamadas,
        fin: respuesta.stop_reason === "tool_use" ? "herramienta" : "fin",
        tokens: respuesta.usage.input_tokens + respuesta.usage.output_tokens,
      };
    } catch (e) {
      // Visibilidad en el servidor (no se expone al cliente): causa real de la falla.
      const causa = e instanceof Error && "cause" in e ? (e as { cause?: unknown }).cause : undefined;
      console.error("[LLM] fallo al llamar al proveedor:", e instanceof Error ? e.message : e, causa ?? "");
      throw new ErrorProveedor(mensajeError(e));
    }
  }
}

function aMensaje(entrada: Entrada): Anthropic.MessageParam {
  if (entrada.rol === "usuario") {
    return { role: "user", content: entrada.texto };
  }
  if (entrada.rol === "asistente") {
    const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
    if (entrada.texto.trim() !== "") content.push({ type: "text", text: entrada.texto });
    for (const l of entrada.llamadas) {
      content.push({ type: "tool_use", id: l.id, name: l.nombre, input: l.args as object });
    }
    return { role: "assistant", content };
  }
  // resultados de herramientas → bloques tool_result en un mensaje de usuario.
  return {
    role: "user",
    content: entrada.resultados.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.id,
      content: r.contenido,
    })),
  };
}

function mensajeError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "La clave del proveedor es inválida o falta (ANTHROPIC_API_KEY).";
    if (e.status === 429) return "El proveedor está limitando por tasa (429). Intenta de nuevo en unos segundos.";
    if (e.status && e.status >= 500) return "El proveedor tuvo un error interno. Intenta de nuevo.";
    return `Error del proveedor: ${e.message}`;
  }
  if (e instanceof Error && e.name === "APIConnectionTimeoutError") {
    return "El proveedor no respondió a tiempo (timeout).";
  }
  return "Error de conexión con el proveedor LLM.";
}
