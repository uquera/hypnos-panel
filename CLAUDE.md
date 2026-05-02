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
| Agenda Allamey | — | agenda-allamey |

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
> "Tu suscripción vence en X días. Realiza tu pago y envía el comprobante a hypnosapps@gmail.com"

**Importante:** Si el AdminShell interno usa `h-screen`, cambiarlo a `h-full` para respetar el espacio del banner.

### 5. Variables de entorno requeridas en el cliente
```
GOBERNANZA_MASTER_KEY=<clave-secreta-unica>
NEXT_PUBLIC_GOBERNANZA_CONTACTO=hypnosapps@gmail.com
```

### 6. En hypnos-panel: registrar el cliente con
- `apiUrl`: URL base del cliente
- `masterKey`: misma que `GOBERNANZA_MASTER_KEY` del cliente

---

## Referencia de implementaciones
- **centro-bambu-demo**: `LicenciaBanner` como componente separado, pasado como prop a AdminShell
- **quick-stop**: banner inline en layout wrapping AdminShell con `h-full`
