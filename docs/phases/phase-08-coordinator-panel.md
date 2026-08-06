# Fase 08 — Panel de coordinadores

> **Fuera del prototipo.** Esta fase se planea ahora para que el modelo de datos no se pinte solo, pero **no se construye** hasta que el prototipo esté aprobado y se decida hosting. Aquí empieza el MVP real.

**Depende de:** fases 01 a 07 aprobadas.

## Alcance

Lo que hoy resuelven las fixtures de la fase 03 lo tiene que resolver una persona: dar de alta la visita, capturar el itinerario, emitir los QPASS, registrar el hospedaje y entregarle el QR al paciente.

## Por qué no está en el prototipo

El prototipo existe para aprobar la experiencia del paciente. Meter panel, base de datos y hosting antes de esa aprobación es construir sobre algo que todavía puede cambiar.

## Lo que resuelve

- Alta de visita: nombre de pila, idioma, fechas
- Captura del itinerario: citas con hora, duración, estudio y ubicación
- Emisión de QPASS: pegar el `payload`, elegir alcance y decidir si lleva ventana de validez o no caduca (`validUntil: null`, el caso normal)
- **Revocar un QPASS** y que desaparezca del teléfono del paciente en menos de 30 s. Con pases sin caducidad (PRD §6.5) esta es la **única** forma de apagar un acceso al edificio, así que tiene que ser visible, rápida y difícil de olvidar: el panel debe recordar los pases activos de estancias ya terminadas
- Registro del hospedaje: reservación de Quartz, desayuno, recovery
- Generación del QR del paciente y envío por WhatsApp
- Mover y cancelar citas, con el recálculo de `expiresAt` de R1

## Decisiones que quedan abiertas

Ninguna se resuelve aquí; se deciden con el cliente cuando arranque el MVP:

1. **Hosting y dominio** — dónde vive, quién lo paga, quién lo administra
2. **Base de datos** — se busca lo más simple que cumpla; los datos de salud exigen cifrado en reposo y respaldo
3. **Acceso de las coordinadoras** — cómo entran y cómo se revoca a alguien que deja el equipo
4. **Bitácora** — quién vio y quién cambió qué. Con datos de salud de por medio, esto no es opcional
5. **Retención** — cuánto tiempo se conservan los datos de una visita ya terminada, y quién los borra
6. **Residencia de datos** — pacientes que cruzan de EE. UU. traen expectativas legales propias; hay que decidir dónde se almacena

## Criterios de aceptación

Se redactan cuando esta fase se active. No tiene sentido fijarlos antes de conocer hosting y modelo de acceso.

## Verificación

Por definir.
