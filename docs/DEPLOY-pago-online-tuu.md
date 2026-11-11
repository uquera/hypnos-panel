# Despliegue: cobro de licencia en línea con TUU (Hypnos POS)

Instrucciones para el agente que sube **hypnos-panel** a producción.
PR: https://github.com/uquera/hypnos-panel/pull/1 · rama `ccr-eb7a8e53-f0c2rz` → `master`.

---

## 1. Qué cambia

Hasta ahora la licencia mensual de Hypnos POS se cobraba con un **link fijo de TUU** (p. ej.
`tuu.cl/hypnos-pos-20mil`). Ese link no le avisa al panel ni dice qué restaurante pagó, así que cada
pago había que aprobarlo a mano.

Con este cambio el restaurante paga con **Webpay (TUU en línea)** desde un botón. TUU le avisa al
panel con un **callback firmado** y la licencia **se renueva sola**:

- Nuevo vencimiento = **max(vencimiento actual, hoy) + meses pagados** (1 mes o 12 meses).
- Se registra un `Pago` con concepto `LICENCIA` y su período.
- Se quitan la suspensión y la prueba, y se sincroniza con el local (PATCH a su `/api/gobernanza/licencia`).
- Le llega **un** correo de comprobante al dueño.

El link fijo, la transferencia con comprobante y el botón "Registrar pago" manual **siguen
funcionando** como respaldo.

### Archivos

| Archivo | Qué es |
|---|---|
| `prisma/schema.prisma` | Modelo nuevo `PosCobroOnline` (tabla `pos_cobros_online`). Solo aditivo |
| `prisma/sql/20261110_pos_cobros_online.sql` | SQL de referencia equivalente (no hace falta si se usa `db push`) |
| `src/lib/tuu-online.ts` | Firma HMAC, verificación y creación del intento en TUU (copiado del POS `dona-any-pos`, rama `fudo-ux`) |
| `src/lib/pos/cobro-online.ts` | Crear cobro, link por cuenta y procesamiento del callback |
| `src/app/api/pos-pago/iniciar/route.ts` | `POST`: crea el cobro y redirige a TUU |
| `src/app/api/pos-pago/tuu-callback/route.ts` | `POST`: callback server-to-server de TUU (público, sin login) |
| `src/app/pos/pagar/page.tsx` | Link de pago de cada restaurante, sin login (correo / WhatsApp) |
| `src/app/pos/pago-resultado/page.tsx` | Página de retorno: solo lee la base |
| `src/app/pos/(portal)/pago/*` | Botón "Pagar con tarjeta o Webpay" en el portal |
| `src/lib/pos/correos.ts`, `src/app/api/cron/pos-cobros/route.ts` | Botón de pago en línea en los correos de cobro |
| `src/app/admin/pos/[id]/page.tsx` | Ficha: link de pago del restaurante + historial de cobros en línea |
| `scripts/tuu-callback-prueba.ts` | Prueba del callback (solo `prueba-lasanas`, solo `TUU_ONLINE_ENV=test`) |

No hay dependencias npm nuevas.

---

## 2. Reglas (no negociables)

1. **Respaldar `prisma/prod.db` antes** de cambiar el esquema.
2. **Credenciales TUU solo en el `.env` del servidor.** Las carga el usuario (Ulises). Nunca en el
   código, git, chat ni logs. No las imprimas (`cat .env`, `echo $TUU_ONLINE_SECRET`, etc.).
3. Prisma 7: `npx prisma db push` **sin** `--skip-generate`. No usar `migrate`.
4. **Primero `TUU_ONLINE_ENV=test`** y probar solo sobre la cuenta **`prueba-lasanas`**.
5. **No tocar cuentas de clientes reales** (`don-sebas`, `potes-food`, `quadrato-pizza-2`, `barstow`)
   hasta que el usuario dé el OK.
6. No usar el botón "pago-renovar" para probar: suma +30 días a ciegas.

---

## 3. Pasos de despliegue

VPS `31.97.86.247`, carpeta `/var/www/hypnos-panel`, PM2.

```bash
cd /var/www/hypnos-panel

# 0. Nombre del proceso PM2 del panel (anótalo; abajo se usa <pm2-panel>)
pm2 ls

# 1. Respaldo de la base (obligatorio)
cp prisma/prod.db "prisma/prod.db.bak-$(date +%Y%m%d-%H%M)"
ls -la prisma/prod.db*

# 2. Código: una vez que el PR #1 esté fusionado en master
git fetch origin master
git status                      # sin cambios locales sin respaldar
git pull origin master

# 3. Dependencias, esquema y build
npm ci
npx prisma db push              # crea pos_cobros_online (aditivo); SIN --skip-generate
npm run build
```

### 3.1 Variables de entorno (las carga Ulises en `.env`)

```
TUU_ONLINE_ACCOUNT_ID=<código de comercio TUU>
TUU_ONLINE_SECRET=<llave secreta TUU>
TUU_ONLINE_ENV=test
APP_URL=https://panel.hypnosapps.com
```

- `APP_URL` es la base de las URL que se envían a TUU (callback y retorno). Si falta, se usa
  `POS_PUBLIC_URL` y luego `AUTH_URL`. En producción **sin ninguna de las tres no aparece el botón**.
- Sin `TUU_ONLINE_ACCOUNT_ID`/`SECRET`/`ENV` el botón no aparece y todo sigue como antes (link fijo +
  comprobante). No se cae nada.
- Para comprobar que están cargadas **sin mostrar los valores**:
  ```bash
  grep -cE '^(TUU_ONLINE_ACCOUNT_ID|TUU_ONLINE_SECRET|TUU_ONLINE_ENV|APP_URL)=' .env   # debe decir 4
  ```

```bash
# 4. Reiniciar (con --update-env para que tome el .env nuevo)
pm2 restart <pm2-panel> --update-env
pm2 logs <pm2-panel> --lines 30 --nostream
```

### 3.2 Red / nginx

- TUU llama a `POST https://panel.hypnosapps.com/api/pos-pago/tuu-callback` desde internet: nginx no
  debe bloquear esa ruta ni exigir login (no hay middleware en el panel; la ruta valida la firma).
- Comprobación rápida (sin firma debe responder **400**, no 404/502):
  ```bash
  curl -4 -s -o /dev/null -w "%{http_code}\n" -X POST https://panel.hypnosapps.com/api/pos-pago/tuu-callback -d "x_reference=x"
  ```

---

## 4. Pruebas en modo test (`TUU_ONLINE_ENV=test`)

### 4.1 Callback (firma inválida, monto alterado, pago válido, duplicado)

Con el panel corriendo, desde `/var/www/hypnos-panel`:

```bash
npx tsx scripts/tuu-callback-prueba.ts --url http://127.0.0.1:<puerto-del-panel>
```

Debe terminar en `Todas las pruebas pasaron.` El script:
- solo actúa sobre `prueba-lasanas` y se niega a correr si `TUU_ONLINE_ENV` no es `test`;
- firma con la llave del `.env` sin imprimirla;
- deja a `prueba-lasanas` con **1 mes más** de licencia y 1 `Pago` de prueba (esperado).

Requisito: `prueba-lasanas` debe existir y tener un `Cliente` (licencia) asociado.

### 4.2 Pago real de punta a punta con TUU de pruebas

1. Entrar al panel → `/admin/pos` → ficha de **prueba-lasanas** → sección **"Pago en línea (TUU)"** →
   copiar el link de pago (`https://panel.hypnosapps.com/pos/pagar?c=…&t=…`).
2. Abrirlo, apretar **"Pagar el mes"** → redirige a Webpay de pruebas de TUU.
3. Pagar con una **tarjeta de prueba** de https://developers.tuu.cl.
4. Al volver, `/pos/pago-resultado` debe mostrar **"¡Pago recibido!"** con la nueva fecha (si dice
   "Confirmando tu pago…", espera: se actualiza sola cuando llega el callback).
5. Verificar en la ficha: cobro **Pagado · hasta <fecha>**, nuevo `Pago` LICENCIA en el historial y
   vencimiento extendido 1 mes.
6. Revisar el log:
   ```bash
   pm2 logs <pm2-panel> --lines 200 --nostream | grep tuu-licencia
   ```
   Se ve `intento creado` y luego `{ referencia, estado: 'pagado', monto, ... }`. **Nunca** debe
   aparecer la firma ni la llave.
7. Probar también **cancelar** en Webpay: el resultado debe decir "El pago no se completó" y no renovar.

### 4.3 Qué significa cada estado en el log `[tuu-licencia]`

| estado | Significado |
|---|---|
| `pagado` | Renovado. Si `sincronizado: false`, el panel quedó bien pero el local no respondió (llega aviso a contacto@; sincronizar desde la ficha) |
| `repetido` | Reintento de TUU de un pago ya aplicado: no hace nada (correcto) |
| `firma-invalida` | Responde 400. Si pasa con pagos reales: revisar que `TUU_ONLINE_SECRET` sea la del ambiente correcto |
| `monto-no-calza` | TUU informó un monto distinto: no renueva y avisa a contacto@ |
| `fallido` | Pago rechazado o cancelado |
| `sin-cobro` / `otra-cuenta` / `ignorado` | Callback que no corresponde a un cobro de este panel/ambiente |
| `error-al-aplicar` | TUU cobró pero no se pudo renovar: estado `ERROR` en la ficha + aviso a contacto@. Registrar el pago a mano |

---

## 5. Paso a producción (solo con el OK de Ulises)

1. Ulises cambia en `.env`: `TUU_ONLINE_ENV=prod` y, si TUU entrega otras, las credenciales de producción.
2. `pm2 restart <pm2-panel> --update-env`
3. Los cobros creados en `test` **nunca** se aplican con la configuración `prod` (y viceversa).
4. Recién entonces se puede mandar el link de pago a clientes reales (p. ej. Potes Food) desde su ficha.
   El cron diario `pos-cobros` empieza a incluir el botón "Pagar ahora" en sus correos automáticamente
   (no hay que cambiar el crontab).

---

## 6. Reversión

- **Rápida (sin tocar código):** quitar `TUU_ONLINE_ACCOUNT_ID` (o `TUU_ONLINE_ENV`) del `.env` y
  `pm2 restart <pm2-panel> --update-env`. El botón desaparece y vuelve el link fijo + comprobante.
- **Completa:** volver al commit anterior de `master`, `npm ci && npm run build && pm2 restart`.
  La tabla `pos_cobros_online` puede quedarse (no molesta). Solo si hiciera falta, restaurar el
  respaldo `prisma/prod.db.bak-*` con el panel detenido (se perderían los datos posteriores al respaldo).

---

## 7. Checklist para reportar al usuario

- [ ] Respaldo de `prisma/prod.db` hecho (nombre del archivo)
- [ ] PR #1 fusionado y `master` desplegado; `prisma db push` OK; build OK; PM2 reiniciado
- [ ] Ulises cargó las 4 variables (`grep -c` = 4), sin mostrarlas
- [ ] `curl` al callback sin firma → 400
- [ ] `scripts/tuu-callback-prueba.ts` → "Todas las pruebas pasaron"
- [ ] Pago de prueba con tarjeta de TUU en `prueba-lasanas` → renovado + correo + log `pagado`
- [ ] Cancelación en Webpay → no renueva
- [ ] Esperando OK de Ulises para `TUU_ONLINE_ENV=prod` (no se tocó ninguna cuenta real)
