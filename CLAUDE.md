@AGENTS.md

# Hypnos Panel — Gobernanza SaaS

Panel de administración para gestionar licencias, pagos y estado de todas las apps cliente gobernadas por Hypnos.

## Stack
- Next.js 16 App Router + React 19 + TypeScript
- Prisma ORM + SQLite (`npx prisma db push`, NO migrate)
- NextAuth v5 (JWT) — roles: ADMIN / COBRADOR
- Tailwind CSS 4 + shadcn/ui

## Apps cliente activas (en producción)
| App | Dominio | PM2 |
|-----|---------|-----|
| Centro Bambú | admibambu.cl | centro-bambu-demo |
| QuickStop | quickstop.cl | quick-stop |
| Centro Hiperbárico | hiperbarico.srv1485601.hstgr.cloud | centro-hiperbarico |
| Bisodent | bisodent.srv1485601.hstgr.cloud | bisodent |
| Agenda Allamey | — | agenda-allamey |
| PodoClinic Linares | podocliniclinares.hypnosapps.com | podoclinic |

## Tropiezos de infraestructura (VPS)

- **El validador de comprobantes necesita binarios del sistema.** `src/lib/comprobante-texto.ts`
  lee los adjuntos con `pdftotext`/`pdftoppm` (poppler-utils) y `tesseract` (+ `tesseract-ocr-spa`),
  instalados por apt en el VPS — no son dependencias npm. Si se reinstala el servidor o se
  mueve el panel: `apt-get install -y tesseract-ocr tesseract-ocr-spa poppler-utils`. Sin ellos
  nada se cae, pero **todos** los comprobantes caen en "no se pudo leer" y piden confirmación.

- **IPv6 rompe los fetch de gobernanza.** Los subdominios `*.srv1485601.hstgr.cloud`
  tienen registro AAAA (IPv6) hacia un edge de Hostinger cuyo certificado NO
  corresponde al host → `ERR_TLS_CERT_ALTNAME_INVALID`. Por IPv4 nginx sirve el
  cert Let's Encrypt correcto (HTTP 200). Node ≥17 prefiere IPv6, así que
  health-check/sync/pagos fallaban para TODOS los clientes. **Fix:** `src/instrumentation.ts`
  fuerza `dns.setDefaultResultOrder("ipv4first")` al arrancar el panel. Si algún
  cliente aparece caído aunque su app esté viva, verifica esto primero.
- **GET de gobernanza debe aceptar `X-Master-Key`.** El health-check hace
  `GET apiUrl` con la master key y espera 200. Si el `GET` del cliente solo
  acepta sesión ADMIN (como venía Bisodent), aparece caído. El `GET` debe
  autorizar por master key (operador) **o** sesión ADMIN (página del cliente).

## Hypnos POS (app Android de las máquinas TUU Pro 2)

Una sola app para todos los clientes: el negocio escribe su **código** y la app baja su marca.
- Modelos `PosCuenta`, `PosUsuario`, `PosToken` (`prisma/schema.prisma`; SQL de referencia en `prisma/sql/20261030_hypnos_pos.sql`).
- Hypnos (solo ADMIN): `/admin/pos` crea/edita cuentas (código, link, colores, logo, cliente de la gobernanza), suspende e invita sub-cuentas.
- Portal del negocio: `/pos/login`, `/pos/crear-contrasena`, `/pos/recuperar`, `/pos/marca`, `/pos/equipo` (solo DUENO).
  Sesión propia en cookie `hypnos_pos` (`src/lib/pos/sesion.ts`), separada de NextAuth: un PosUsuario nunca entra a `/admin`.
- API pública de la app (sin sesión, 60/min por IP): `GET /api/pos-app/config?code=` y `GET /api/pos-app/logo/<codigo>.png`.
- Logos normalizados a PNG ≤512 px con `sharp` en `POS_UPLOAD_DIR` (por defecto `<cwd>/uploads/pos`).
- Correos: `"Hypnos POS" <no-reply@hypnosapps.com>`, Reply-To contacto@ (`src/lib/pos/email.ts`; usa `EMAIL_*` o `SMTP_*`).
- Datos iniciales: `npx tsx scripts/pos-seed.ts` (cuenta `donaany`, idempotente; `--forzar` restablece).

### Venta de Hypnos POS (registro → instalación → prueba → cobro)
- Registro público `/pos/registro` (prueba de `POS_DIAS_PRUEBA`=14 días) y "Crear restaurante" en `/admin/pos/crear`:
  crean `Cliente` (plan `POS`, masterKey aleatoria, `apiUrl` = `https://<codigo>.hypnosapps.com/api/gobernanza/licencia`),
  `PosCuenta` y el `PosUsuario` DUENO (`src/lib/pos/registro.ts`), y lanzan la instalación en segundo plano.
- Instalación (`src/lib/pos/alta.ts`): `hypnos-pos-tenant create|status|destroy` (ruta `POS_TENANT_CMD`, sin shell).
  Sin el comando y fuera de producción se simula. Estado en `PosCuenta.estadoAlta`: `MANUAL` (cuentas hechas a mano,
  p. ej. donaany: no se instalan ni eliminan) | `PENDIENTE` | `INSTALANDO` | `LISTO` | `ERROR`; log en `altaLog`.
  Al quedar LISTO: correo de bienvenida + invitación al portal. Error: aviso a `POS_AVISOS_EMAIL` (contacto@).
- Onboarding (`src/lib/pos/onboarding.ts`): el registro (3 pasos) y "Crear restaurante" piden opcionalmente logo
  (PNG/JPG/WebP ≤5 MB → PNG ≤512 px, también logo de la app), link del menú online (Fudo u otro; solo http/https
  públicos, se rechazan IPs privadas), mesas (10), dirección, horario y Excel/CSV de clientes (≤10 MB). Archivos en
  `POS_ONBOARDING_DIR/<cuentaId>/` (por defecto `uploads/pos-onboarding`). Se pasan a `create` como
  `--logo --menu-url --mesas --direccion --telefono (WhatsApp) --horario --clientes`; sin menú va `--ejemplo`.
  El resultado `menu`/`clientes` de la última línea JSON queda en `PosCuenta.resultadoAlta` (ficha, pantalla de espera
  y correo de bienvenida). nginx del panel debe aceptar cuerpos de ~16 MB (`client_max_body_size`).
- Cobro (`src/lib/pos/cobro.ts`, `comprobantes.ts`): el dueño sube el comprobante en `/pos/pago`
  (`uploads/pos-comprobantes`, `POS_COMPROBANTES_DIR`); Hypnos aprueba/rechaza en `/admin/pos`. Aprobar crea un `Pago`
  LICENCIA en CLP (período max(vencimiento, hoy) → +N meses), extiende la licencia, quita prueba/suspensión y hace
  PATCH `{fechaVencimiento, suspendida:false, enPrueba:false}` + POST pagos a la instancia (`src/lib/gobernanza-remota.ts`).
- **Pago en línea con renovación automática (TUU/Webpay, `src/lib/tuu-online.ts`, `src/lib/pos/cobro-online.ts`):**
  `POST /api/pos-pago/iniciar` (formulario: sesión del dueño, o `c`+`t` del link `/pos/pagar?c=<cuentaId>&t=<hmac>`)
  calcula el monto en el servidor (mes = precio; año = link anual configurado o 10 mensualidades), crea
  `PosCobroOnline` PENDIENTE con referencia `HP-<YYYYMMDD>-<aleatorio>` y redirige a TUU (URLs desde `APP_URL`
  → `POS_PUBLIC_URL` → `AUTH_URL`, nunca Host). El callback `POST /api/pos-pago/tuu-callback` (público) verifica
  la firma HMAC en tiempo constante (inválida = 400, válida = siempre 200), valida cuenta/CLP/monto y ambiente,
  marca PAGADO con `updateMany where estado PENDIENTE|FALLIDO` (idempotente) y aplica `registrarPagoPos`
  (max(vencimiento, hoy) + meses, Pago LICENCIA, sin suspensión/prueba, PATCH + POST a la instancia, un correo).
  `/pos/pago-resultado?ref=` solo lee la base. Pagado pero no aplicado = estado `ERROR` + aviso a `POS_AVISOS_EMAIL`.
  Credenciales `TUU_ONLINE_ACCOUNT_ID`, `TUU_ONLINE_SECRET`, `TUU_ONLINE_ENV` (test|prod) solo en el `.env` del VPS;
  sin ellas no aparece el botón y quedan el link fijo y el comprobante. Log: `[tuu-licencia]` (sin firma ni secretos).
  El link de pago de cada restaurante se ve en su ficha (`/admin/pos/<id>#pago-online`).
  El ingreso queda a nombre del **dueño del panel** (`POS_OPERADOR_EMAIL`, por defecto el `OWNER_EMAIL`):
  el dinero entra a la cuenta de TUU, que es suya. Se busca por correo a propósito — con "el primer ADMIN
  creado" bastaba desactivar esa cuenta para que todo pago ya cobrado cayera en `ERROR`.
  No lleva archivo de comprobante (el respaldo es la transacción): se guarda `comprobanteNota = "respaldo TUU · <ref>"`,
  que se ve en Ingresos y en la auditoría en vez de "sin comprobante".
- Precio: `POS_PRECIO_MENSUAL` (20000) o `PosCuenta.precioMensual`; `POS_DATOS_TRANSFERENCIA` (multilínea, `\n`);
  `POS_DIAS_GRACIA` (3).
- Cron diario `GET /api/cron/pos-cobros` (header `x-cron-secret: $CRON_SECRET`, `?dry=1` para simular):
  `0 9 * * * curl -4 -s -H "x-cron-secret: $CRON_SECRET" https://panel.hypnosapps.com/api/cron/pos-cobros >> /var/log/hypnos-pos-cobros.log 2>&1`
  Avisos PRUEBA_3/PRUEBA_1/COBRO_5/VENCE_HOY y SUSPENSION (vencido + gracia), sin repetir (tabla `pos_avisos`).
  `/api/cron/alertas` ya no avisa a los clientes con plan `POS`.
- Suspender por no pago = licencia (`Cliente.suspendida`, se sincroniza; el dueño sigue entrando a pagar).
  "Bloquear app" = `PosCuenta.activo=false` (la app Android y el portal quedan fuera).
- Eliminar restaurante: `destroy` + `PosCuenta.eliminadaAt` y `Cliente.activo=false` (pagos e historial se conservan).

---

## Estándar obligatorio: Gobernanza en apps cliente

**CADA app nueva gobernada por este panel DEBE incluir los siguientes elementos.** Sin ellos el panel no puede sincronizar licencias ni el cliente ve alertas.

### 1. Schema Prisma (modelos)
```prisma
model Licencia {
  id               String       @id @default("singleton")
  plan             PlanLicencia @default(PRO)
  fechaVencimiento DateTime
  suspendida       Boolean      @default(false)
  notasAdmin       String?
  updatedAt        DateTime     @updatedAt
  pagos            PagoLicencia[]
  @@map("licencia")
}
model PagoLicencia {
  id String @id @default(cuid())
  licenciaId String; monto Float; moneda String @default("CLP")
  periodoInicio DateTime; periodoFin DateTime
  fechaPago DateTime @default(now()); notas String?
  @@map("pagos_licencia")
}
enum PlanLicencia { BASICO PRO ENTERPRISE }
```

### 2. `lib/licencia.ts`
Función `getLicenciaStatus()` que retorna `{ diasRestantes, suspendida, mostrarBanner }`.
- `mostrarBanner: !suspendida && diasRestantes <= 3`

### 3. API endpoints de gobernanza
- `app/api/gobernanza/licencia/route.ts` — GET (estado) + PATCH (sync desde panel), requiere header `X-Master-Key`
- `app/api/gobernanza/pagos/route.ts` — POST (registrar pago desde panel), requiere `X-Master-Key`

### 4. Banner rojo en `app/admin/layout.tsx`
Cuando `diasRestantes <= 3` o está suspendida, mostrar banner rojo con mensaje:
> "Tu suscripción vence en X días. Realiza tu pago y envía el comprobante a contacto@hypnosapps.com"

**Importante:** Si el AdminShell interno usa `h-screen`, cambiarlo a `h-full` para respetar el espacio del banner.

### 5. Variables de entorno requeridas en el cliente
```
GOBERNANZA_MASTER_KEY=<clave-secreta-unica>
NEXT_PUBLIC_GOBERNANZA_CONTACTO=contacto@hypnosapps.com
```

### 6. En hypnos-panel: registrar el cliente con
- `apiUrl`: URL base del cliente
- `masterKey`: misma que `GOBERNANZA_MASTER_KEY` del cliente

---

## Estándar obligatorio: Correos automáticos en apps cliente

**Cada app cliente envía sus correos desde `no-reply@hypnosapps.com`**, nunca desde el Gmail
personal del cliente (en PodoClinic Google revocó esa app password y los correos fallaron en
silencio 2 días). hypnosapps.com es Workspace con SPF + DKIM + DMARC. Solo cambia el nombre visible
y el correo del cliente:

```
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT="587"
EMAIL_USER="contacto@hypnosapps.com"            # autentica (app password "Agendas Hypnos")
EMAIL_PASS="<app password de contacto@>"        # la carga el operador con su comando, no va en git
EMAIL_FROM="<Nombre del Cliente> <no-reply@hypnosapps.com>"
EMAIL_REPLY_TO="<correo del cliente>"           # las respuestas le llegan al cliente
ADMIN_EMAIL="<correo del cliente>"              # avisos de nuevas solicitudes
```

- Código: `nodemailer.createTransport({...}, { replyTo: process.env.EMAIL_REPLY_TO || undefined })`
  y en el pie del correo el contacto del cliente (referencia: `PodoClinic/src/lib/email.ts`).
- Infra compartida (ya hecha): alias `no-reply@` en la cuenta `contacto@` (admin.google.com) +
  Gmail de contacto@ → Cuentas → "Enviar como" no-reply@ (sin "Tratar como alias").
- Verificar con `transporter.verify()` y una prueba real antes de entregar. Un `535` = app password
  revocada → generar otra de contacto@ y recargar `EMAIL_PASS` (`pm2 restart`, sin rebuild).

---

## Referencia de implementaciones
- **centro-bambu-demo**: `LicenciaBanner` como componente separado, pasado como prop a AdminShell
- **quick-stop**: banner inline en layout wrapping AdminShell con `h-full`
