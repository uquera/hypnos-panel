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
