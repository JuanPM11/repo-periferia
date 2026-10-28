---
name: registro-proveedor
description: Conocimiento del proceso de registro como proveedor de Periferia (identificador tributario por país, estados de campo, vigencia de soportes, formatos de salida y reglas de cierre).
---

<!-- Cuerpo idéntico a src/knowledge/registro-proveedor.md (fuente canónica). -->

# Conocimiento del proceso: registro como proveedor

Este documento es el conocimiento de negocio que el agente consulta. No contiene
valores del maestro (esos solo salen de las herramientas); describe las reglas.

## Qué es el proceso

Un cliente pide a Periferia registrarse como su proveedor. Envía por correo un
formato (Excel, PDF o un portal web) con campos a diligenciar y una lista de
soportes a adjuntar. El agente llena el formato con los datos de Periferia que ya
existen, señala lo que falta y arma un paquete para que el representante legal firme.

## Identificador tributario por país (RN1)

Periferia es una empresa colombiana y solo posee **NIT** colombiano. El nombre del
identificador cambia según el país del cliente:

| País | Identificador |
|------|---------------|
| CO   | NIT |
| EC   | RUC |
| PE   | RUC |
| PA   | RUC |
| HN   | RTN |

Para clientes fuera de Colombia, el campo del identificador se llena con el NIT
colombiano pero se marca **requiere_confirmacion** con la nota "identificador
extranjero", porque un humano debe confirmar que es aceptable usar el NIT como
equivalente. Lo mismo aplica a etiquetas genéricas como "Identificación tributaria".

## Estados de un campo (HU-2)

- **lleno**: el campo existe en el maestro (vía glosario) y se diligencia.
- **faltante**: la plantilla lo pide pero no existe en el maestro. Nunca se inventa.
  No bloquea la firma, pero queda en el reporte.
- **requiere_confirmacion**: mapeo con regla de país o baja confianza. Se propone un
  valor pero necesita visto bueno humano.

## Soportes y vigencia (RN3)

Los soportes exigidos se cruzan contra el repositorio. Cada uno queda como:

- **presente**: existe y está vigente.
- **vencido**: existe pero su `vigencia_hasta` es anterior a la fecha de ejecución.
- **ausente**: el cliente lo exige y no existe en el repositorio.

Un soporte **vencido o ausente bloquea** `listo_para_firma`. Un campo faltante no lo
bloquea. El checklist siempre lista los tres estados.

## Formatos de salida (HU-3)

- **xlsx**: se escribe cada etiqueta y su valor en la hoja y celda indicadas.
- **pdf**: se genera un PDF que reproduce todos los campos en orden.
- **portal**: no se automatiza. Se dejan los valores en un archivo copiable. El
  ingreso de credenciales y el clic final en el portal los hace una persona.

## Cierre (RN4)

El agente nunca envía ni firma sin confirmación explícita del usuario en el turno
anterior. "Enviar" en este reto solo deja una constancia `ENVIO-SIMULADO.md`.
