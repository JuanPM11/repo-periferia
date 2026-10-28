// Tipos del dominio del reto. Sin `any`: todo lo que cruza una frontera está tipado.

/** Formato de salida que pide el cliente. */
export type Formato = "xlsx" | "pdf" | "portal";

/** País del cliente que solicita el registro. */
export type Pais = "CO" | "EC" | "PE" | "PA" | "HN";

/** Correo normalizado del cliente (fixtures/.../solicitud.json). */
export interface Solicitud {
  id: string;
  de: string;
  para: string;
  asunto: string;
  fecha: string;
  pais: Pais;
  cliente: string;
  cuerpo: string;
  formato: Formato;
  adjuntos: string[];
}

/** Una fila de la plantilla Excel (plantilla-celdas.json). */
export interface CeldaPlantilla {
  hoja: string;
  celda_etiqueta: string;
  etiqueta: string;
  celda_valor: string;
}

/** Un campo de la plantilla PDF/portal (plantilla-campos.json). */
export interface CampoPlantilla {
  etiqueta: string;
  obligatorio: boolean;
}

/**
 * Campo normalizado que el agente debe diligenciar, independiente del formato.
 * Para xlsx arrastra la ubicación de celda; para pdf/portal solo etiqueta y orden.
 */
export interface CampoSolicitado {
  etiqueta: string;
  obligatorio: boolean;
  hoja?: string;
  celda_etiqueta?: string;
  celda_valor?: string;
}

/** Entrada del índice de soportes (repositorio/soportes/index.json). */
export interface SoporteIndice {
  tipo: string;
  archivo: string;
  vigencia_hasta: string | null;
  pais_emisor: string;
  descripcion: string;
}

/** Estado de un campo tras el cruce con el maestro (HU-2). */
export type EstadoCampo = "lleno" | "faltante" | "requiere_confirmacion";

export interface CampoLleno {
  etiqueta: string;
  clave: string;
  valor: string;
}

export interface CampoFaltante {
  etiqueta: string;
  obligatorio: boolean;
  motivo: string;
}

export interface CampoConfirmacion {
  etiqueta: string;
  clave: string;
  valor: string;
  nota: string;
  propuesta: string;
}

/** Resultado del mapeo de campos contra el maestro. */
export interface Mapeo {
  llenos: CampoLleno[];
  faltantes: CampoFaltante[];
  requiere_confirmacion: CampoConfirmacion[];
}

/** Línea del checklist de soportes del paquete (HU-4). */
export interface ItemChecklist {
  tipo: string;
  estado: "presente" | "ausente" | "vencido";
  vigencia_hasta: string | null;
  detalle: string;
}

/** Contrato de resultado de toda herramienta: nunca lanza, siempre `{ ok }`. */
export type ResultadoTool<T> = { ok: true; data: T } | { ok: false; error: string };

/** Contexto que el backend inyecta en cada herramienta. */
export interface ContextoTool {
  /** Raíz del proyecto. Todas las rutas se resuelven desde aquí, nunca absolutas. */
  directory: string;
  sessionId: string;
  /** Fecha de ejecución (ISO yyyy-mm-dd) para evaluar vigencias. Inyectable para determinismo. */
  fechaEjecucion?: string;
}
