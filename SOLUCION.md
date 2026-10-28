# SOLUCIÓN — Agente conversacional "Registro como Proveedor"

## 1. Problema en una frase

El área administrativa de Periferia transcribe a mano 8–12 formularios de registro
como proveedor al mes; le duele a la **analista administrativa** (retrabajo y riesgo
de error en datos sensibles) y al negocio (la facturación se retrasa días).

## 2. Arquitectura

```
┌────────────────────┐   HTTP/JSON    ┌──────────────────────────────────────────┐
│ Front de chat       │ ─────────────▶ │ Backend (Hono sobre Node)                 │
│ web/index.html      │ ◀───────────── │  POST /api/chat → ciclo del agente        │
│ · historial         │                │   ├─ adaptador LLM (interfaz propia)      │
│ · tarjetas de tools │                │   ├─ catálogo de herramientas (zod)       │
│ · resalta confirmar │                │   └─ sesiones en memoria                  │
└────────────────────┘                └───────┬───────────────────────┬──────────┘
                                               │                       │
                                   fixtures/ (solo lectura)        out/ (escritura)
                                   maestro, glosario, casos        formularios, paquete,
                                                                   log.jsonl, ENVIO-SIMULADO
```

Separación de responsabilidades (lo que el PRD evalúa):

| Capa | Dónde vive | Qué contiene |
|------|-----------|--------------|
| **Comportamiento** | `agent/prompt.md` | System prompt: reglas inviolables, orden de uso de tools, confirmación. |
| **Conocimiento** | `src/knowledge/registro-proveedor.md` | Reglas de negocio (identificador por país, vigencias, estados). |
| **Ejecución** | `src/tools/proveedor.ts` + `src/dominio/*` | Las herramientas y la lógica determinista. |
| **Ciclo / API** | `src/agente/*`, `src/server.ts` | El bucle del agente y el transporte HTTP. |
| **Adaptador LLM** | `src/llm/adapter.ts` + `src/llm/anthropic.ts` | Interfaz propia; cambiar de proveedor no toca el ciclo. |

Un cambio de reglas de negocio toca `src/knowledge/` o `src/dominio/`, nunca el servidor.

## 3. Ciclo del agente

`src/agente/ciclo.ts` implementa el bucle: añade el mensaje del usuario al historial
neutral y repite hasta **`MAX_ITERACIONES` (25 por defecto)**:

1. Pide una respuesta al adaptador LLM con el historial y el catálogo de herramientas.
2. Suma los tokens al contador de la sesión; si supera **`MAX_TOKENS_SESION`**, corta
   con un mensaje claro (tope de costo: un usuario no puede gastar la clave sin límite).
3. Si el modelo cerró el turno sin pedir herramientas, esa es la respuesta final.
4. Si pidió herramientas, las ejecuta (`ejecutarHerramienta`), devuelve los resultados
   al modelo y continúa. Cada llamada queda en `toolCalls` (visible en el chat, CA4) y
   en `out/log.jsonl` + `out/<caso>/log.jsonl`.

**Confirmación humana (CA3, RN4):** el agente termina el turno con una pregunta y no
actúa hasta que el usuario confirme en el siguiente mensaje. La garantía es de doble
capa: (a) el prompt prohíbe llamar a `proveedor_simular_envio` sin confirmación previa,
y (b) la herramienta rechaza con `{ ok:false, error:"requiere confirmación explícita" }`
si `confirmado !== true`. El backend marca `needsConfirmation` y el front lo resalta.

**No alucinación (CA2):** las herramientas re-derivan todos los valores del maestro; el
modelo no puede inyectar un valor en el formulario aunque lo intente (ver §6, decisión 1).

## 4. Elección del modelo

- **Proveedor:** Anthropic. **Modelo por defecto:** `claude-haiku-5-5`.
- **Por qué:** la tarea es orquestación (decidir qué tool llamar y resumir), no
  razonamiento profundo; Haiku es rápido y barato y le sobra capacidad para este flujo
  de 4–6 llamadas. El adaptador permite subir a Sonnet/Opus con solo cambiar `LLM_MODEL`.
- **Costo estimado por caso:** ~8k tokens de entrada (prompt+conocimiento+resultados de
  tools acumulados) y ~1.5k de salida por caso completo ⇒ del orden de **centavos de
  dólar por caso** con Haiku. A 12 casos/mes, un costo marginal.

## 5. Diseño del portal web (requisito §7.4)

El formato `portal` **no se implementa**; el agente responde "formato no soportado" y
`proveedor_generar_formulario` deja `out/<caso>/valores-portal.md` con los valores listos
para copiar. Cómo lo abordaría en producción:

- **Estrategia:** un navegador controlado (Playwright/Puppeteer) expuesto como una
  herramienta más del agente (`portal_abrir`, `portal_llenar_campo`), de modo que el
  ciclo no cambie. Alternativas: RPA (UiPath) si la organización ya lo usa, o una
  extensión de navegador para que el humano vea lo que el agente escribe.
- **Límites:** CAPTCHA y MFA no se automatizan (requieren intervención humana); los
  portales cambian de layout, así que el mapeo etiqueta→selector debe ser configurable
  por portal y tolerar fallos (el agente reporta y no adivina).
- **Credenciales:** viven en un gestor de secretos (o variable de entorno del backend),
  **nunca** en el repo, el prompt ni los logs. Las ingresa una persona o un vault con
  política de acceso; el agente nunca las ve en claro ni las registra.
- **Reparto humano/agente:** el agente navega y pre-llena los campos a partir del mapeo;
  **el ingreso de credenciales y el clic final de "Enviar" son humanos**, siempre.

## 6. Decisiones y trade-offs

1. **Las herramientas re-derivan los valores del maestro; no confían en el `mapeo` que
   pase el modelo.** `proveedor_generar_formulario` acepta `mapeo` por compatibilidad con
   el contrato, pero lo ignora para los valores y vuelve a calcularlos.
   *Alternativa descartada:* confiar en el `mapeo` que arma el modelo. Se descartó porque
   abre la puerta a que el modelo inyecte un valor inventado (viola CA2/O2). Trade-off:
   una llamada extra de cómputo a cambio de una garantía estructural contra alucinación.

2. **Ejecutar TypeScript con Node nativo (type-stripping), sin `tsx`/bundler.**
   *Alternativa descartada:* `tsx`. En Node 24 `tsx` fallaba al transpilar una dependencia
   de `exceljs`. Node 24 corre `.ts` directamente, así que `node src/server.ts` basta.
   Trade-off: se usan extensiones `.ts` en los imports y se evitan *parameter properties*
   y `enum` (no soportados por el type-stripping); a cambio, cero dependencias de build y
   un solo comando. Bun también ejecuta estos `.ts` sin cambios.

3. **Front en HTML plano de un solo archivo servido por el backend.**
   *Alternativa descartada:* React/Vite. Se descartó para cumplir "un comando levanta
   front y backend en < 2 min" sin paso de build ni segundo servidor. Trade-off: menos
   ergonomía de componentes a cambio de simplicidad de arranque y despliegue.

4. **Mapeo determinista por glosario + regla de país, sin *fuzzy matching*.**
   *Alternativa descartada:* un *scorer* de similitud con umbral 0.8. Se descartó porque
   un umbral arbitrario es difícil de defender línea por línea y puede llenar un campo con
   un dato equivocado. Trade-off: etiquetas no listadas en el glosario quedan como
   `faltante` (conservador y explicable) en vez de arriesgar un mapeo dudoso.

## 7. Supuestos

- Los fixtures entregados venían en la raíz (`casos/`, `repositorio/`,
  `glosario-campos.json`); los **reubiqué** a `fixtures/reto-01/` para calzar con las rutas
  que documenta el PRD. No se editó su contenido.
- La **fecha de ejecución** para evaluar vigencias es la del sistema (hoy), con override
  por `FECHA_EJECUCION=yyyy-mm-dd` para reproducibilidad en la defensa.
- El campo "País" del formulario se refiere al país de **Periferia** (CO), no al del
  cliente; el país del cliente solo determina el nombre del identificador tributario.
- "Correo electrónico" del proveedor mapea al contacto comercial (según el glosario).
- Un formulario `pdf` generado (no un AcroForm rellenado) es aceptable, como permite HU-3.

## 8. Cobertura de historias de usuario

| HU | Estado | Nota / qué falta para producción |
|----|--------|----------------------------------|
| HU-1 Leer solicitud | **Hecho** | Devuelve país, formato, campos y soportes; marca el identificador ambiguo por país. |
| HU-2 Mapear al maestro | **Hecho** | Tri-estado determinista; glosario con normalización de acentos/espacios. |
| HU-3 Generar formulario | **Hecho** | xlsx (celdas exactas), pdf (orden), portal (valores copiables). |
| HU-4 Armar paquete | **Hecho** | Checklist, copia de soportes, borrador sin datos bancarios, gate de envío. |
| HU-5 Manejo de errores | **Hecho** | Toda tool devuelve `{ok}`/`{ok:false,error}` y nunca lanza; el caso malo no frena los demás. |
| Bonus módulo | **Hecho** | `modulo/` reexporta las mismas tools y reusa prompt/conocimiento. |
| Chat con modelo real | **Hecho** | Desplegado y verificado en vivo en Render: <https://agente-registro-proveedor-ln9g.onrender.com> |

Para producción faltaría: integración real con correo/SharePoint/firma, un dueño del
dato que mantenga el maestro, persistencia de sesiones y pruebas automatizadas del ciclo.

## 9. Uso de IA

- **Asistente usado:** Claude Code (modelo Opus) para el diseño de arquitectura, la
  implementación de las herramientas y el ciclo, y la redacción de esta documentación.
- **Para qué:** andamiaje del repo, lógica determinista de mapeo/vigencias, adaptador
  LLM, front, y verificación con `demo.ts` y una prueba de humo del ciclo.
- **Qué se descartó de lo propuesto:** `tsx` como runner (fallaba con `exceljs` en Node 24);
  un *fuzzy matcher* con umbral de confianza (no defendible línea por línea); y confiar en
  el `mapeo` que arma el modelo (riesgo de alucinación). Cada línea entregada es explicable.

## 10. Riesgos en producción y mitigación

| Riesgo | Mitigación |
|--------|-----------|
| El modelo "completa" un campo faltante con un valor plausible. | Las tools son la única fuente de valores y re-derivan del maestro; el prompt lo prohíbe. |
| Portales con CAPTCHA/MFA. | El humano opera el portal; el agente solo prepara valores copiables. |
| Fuga de la clave del modelo. | Vive solo en variable de entorno del backend; no aparece en front, API, repo ni logs. `/api/health` no la expone. |
| Datos sensibles (cuenta bancaria) en lugares indebidos. | RN2: datos bancarios solo en el formulario si se piden; nunca en el borrador de correo. |
| Maestro desactualizado → formularios con datos viejos. | Requiere un dueño del dato y control de vigencia; el checklist ya marca soportes vencidos. |
| Gasto descontrolado de la clave. | Topes de iteraciones por turno y de tokens por sesión, configurables. |
