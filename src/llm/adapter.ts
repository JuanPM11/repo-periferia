// Interfaz propia del proveedor LLM. El ciclo del agente habla SOLO con estos tipos;
// cambiar de proveedor significa escribir otra implementación de AdaptadorLLM, sin
// tocar el ciclo. Las claves nunca viven aquí: cada implementación las lee del entorno.

/** Herramienta expuesta al modelo (JSON Schema de entrada). */
export interface HerramientaLLM {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

/** Una llamada a herramienta pedida por el modelo. */
export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  args: unknown;
}

/** Historial neutral de la conversación, independiente del proveedor. */
export type Entrada =
  | { rol: "usuario"; texto: string }
  | { rol: "asistente"; texto: string; llamadas: LlamadaHerramienta[] }
  | { rol: "herramienta"; resultados: Array<{ id: string; contenido: string }> };

/** Respuesta de un turno del modelo. */
export interface RespuestaLLM {
  texto: string;
  llamadas: LlamadaHerramienta[];
  /** "herramienta" si el modelo pidió herramientas; "fin" si cerró el turno. */
  fin: "herramienta" | "fin";
  tokens: number;
}

export interface AdaptadorLLM {
  readonly proveedor: string;
  readonly modelo: string;
  enviar(
    system: string,
    historial: Entrada[],
    herramientas: HerramientaLLM[],
  ): Promise<RespuestaLLM>;
}

/** Error del proveedor con mensaje claro (el ciclo lo muestra sin traza cruda). */
export class ErrorProveedor extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorProveedor";
  }
}
