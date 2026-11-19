import crypto from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  allowedReturn, conParametros, enmascararCorreo, hostsPermitidos, pkceChallenge,
  readCookie, signCookie, signLocalToken, verifyGoogleIdToken, type Jwk,
} from "./cliente-google"

const SECRET = "secreto-de-prueba"
const CLIENT_ID = "123.apps.googleusercontent.com"
const NONCE = "nonce-abc"

const hosts = hostsPermitidos({
  clientes: [{ dominio: "www.podoclinic.cl", apiUrl: "https://podoclinic.hypnosapps.com/api/gobernanza/licencia" }],
  posCuentas: [{ codigo: "okiri-sushi", posUrl: "https://okiri.cl/pos" }],
})

describe("allowedReturn", () => {
  it("acepta locales conocidos (con y sin www, con basePath)", () => {
    expect(allowedReturn("https://donnaany.com/pos/cliente/google", hosts)).not.toBeNull()
    expect(allowedReturn("https://www.donnaany.com/cliente/google", hosts)).not.toBeNull()
    expect(allowedReturn("https://podoclinic.cl/cliente/google", hosts)).not.toBeNull()
    expect(allowedReturn("https://podoclinic.hypnosapps.com/cliente/google", hosts)).not.toBeNull()
    expect(allowedReturn("https://okiri.cl/cliente/google?x=1", hosts)).not.toBeNull()
    expect(allowedReturn("https://okiri-sushi.hypnosapps.com/cliente/google", hosts)).not.toBeNull()
  })
  it("rechaza host desconocido", () => {
    expect(allowedReturn("https://malo.com/cliente/google", hosts)).toBeNull()
    expect(allowedReturn("https://donnaany.com.malo.com/cliente/google", hosts)).toBeNull()
    expect(allowedReturn("https://otro.hypnosapps.com/cliente/google", hosts)).toBeNull()
  })
  it("rechaza http", () => {
    expect(allowedReturn("http://donnaany.com/cliente/google", hosts)).toBeNull()
  })
  it("rechaza path distinto de /cliente/google", () => {
    expect(allowedReturn("https://donnaany.com/admin", hosts)).toBeNull()
    expect(allowedReturn("https://donnaany.com/cliente/google/otra", hosts)).toBeNull()
    expect(allowedReturn("https://donnaany.com/cliente/googlex", hosts)).toBeNull()
  })
  it("rechaza credenciales en la URL y basura", () => {
    expect(allowedReturn("https://a:b@donnaany.com/cliente/google", hosts)).toBeNull()
    expect(allowedReturn("no es url", hosts)).toBeNull()
    expect(allowedReturn(null, hosts)).toBeNull()
  })
})

describe("cookie firmada", () => {
  const datos = { return: "https://donnaany.com/pos/cliente/google", state: "s", nonce: "n", verifier: "v", exp: Date.now() + 60_000 }
  it("ida y vuelta", () => {
    expect(readCookie(signCookie(datos, SECRET), SECRET)).toEqual(datos)
  })
  it("firma alterada → rechazada", () => {
    const c = signCookie(datos, SECRET)
    const [cuerpo, firma] = c.split(".")
    const otro = Buffer.from(JSON.stringify({ ...datos, return: "https://malo.com/cliente/google" })).toString("base64url")
    expect(readCookie(`${otro}.${firma}`, SECRET)).toBeNull()
    expect(readCookie(`${cuerpo}.AAAA`, SECRET)).toBeNull()
    expect(readCookie(c, "otra-clave")).toBeNull()
  })
  it("vencida → rechazada", () => {
    expect(readCookie(signCookie({ ...datos, exp: Date.now() - 1 }, SECRET), SECRET)).toBeNull()
  })
})

// ─── id_token de Google con un par RSA propio ─────────────────────────────────
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const otroPar = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const KID = "kid-1"
const jwks: Jwk[] = [{ ...(publicKey.export({ format: "jwk" }) as Jwk), kid: KID, alg: "RS256", use: "sig" }]
const ahora = Math.floor(Date.now() / 1000)

function idToken(claims: Record<string, unknown> = {}, key: crypto.KeyObject = privateKey, header: Record<string, unknown> = {}) {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT", ...header })).toString("base64url")
  const c = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "1001", email: "usuario@gmail.com",
    email_verified: true, name: "Usuario Prueba", nonce: NONCE, iat: ahora, exp: ahora + 3600, ...claims,
  })).toString("base64url")
  const firma = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${c}`), key).toString("base64url")
  return `${h}.${c}.${firma}`
}
const verificar = (t: string) => verifyGoogleIdToken(t, { clientId: CLIENT_ID, nonce: NONCE, jwks })

describe("verifyGoogleIdToken", () => {
  it("id_token válido → aceptado", async () => {
    await expect(verificar(idToken())).resolves.toMatchObject({ sub: "1001", email: "usuario@gmail.com", name: "Usuario Prueba" })
    await expect(verificar(idToken({ iss: "accounts.google.com" }))).resolves.toBeTruthy()
  })
  it("jwks como función (caché por kid)", async () => {
    await expect(verifyGoogleIdToken(idToken(), { clientId: CLIENT_ID, nonce: NONCE, jwks: async () => jwks })).resolves.toBeTruthy()
  })
  it("aud distinto → rechazado", async () => {
    await expect(verificar(idToken({ aud: "otro-cliente" }))).rejects.toThrow("aud")
  })
  it("nonce distinto → rechazado", async () => {
    await expect(verificar(idToken({ nonce: "otro" }))).rejects.toThrow("nonce")
  })
  it("email_verified false → rechazado", async () => {
    await expect(verificar(idToken({ email_verified: false }))).rejects.toThrow("email_verified")
  })
  it("firma inválida → rechazado", async () => {
    await expect(verificar(idToken({}, otroPar.privateKey))).rejects.toThrow("firma")
    const t = idToken().split(".")
    const original = JSON.parse(Buffer.from(t[1], "base64url").toString())
    const alterado = Buffer.from(JSON.stringify({ ...original, email: "otro@gmail.com" })).toString("base64url")
    await expect(verificar(`${t[0]}.${alterado}.${t[2]}`)).rejects.toThrow("firma")
  })
  it("vencido → rechazado (con tolerancia de 60 s)", async () => {
    await expect(verificar(idToken({ exp: ahora - 120 }))).rejects.toThrow("exp")
    await expect(verificar(idToken({ exp: ahora - 30 }))).resolves.toBeTruthy()
  })
  it("iss ajeno, alg none o kid desconocido → rechazado", async () => {
    await expect(verificar(idToken({ iss: "https://malo.com" }))).rejects.toThrow("iss")
    await expect(verificar(idToken({}, privateKey, { alg: "none" }))).rejects.toThrow("alg")
    await expect(verificar(idToken({}, privateKey, { kid: "otro" }))).rejects.toThrow("kid")
  })
})

describe("signLocalToken", () => {
  it("aud = host del return, exp = iat + 120, firma HS256 válida", () => {
    const aud = new URL("https://donnaany.com/pos/cliente/google").hostname
    const t = signLocalToken({ sub: "1001", email: "u@gmail.com", name: "U" }, aud, SECRET, 1_700_000_000)
    const [h, c, firma] = t.split(".")
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" })
    const claims = JSON.parse(Buffer.from(c, "base64url").toString())
    expect(claims).toMatchObject({ sub: "1001", email: "u@gmail.com", aud: "donnaany.com", iss: "panel.hypnosapps.com", iat: 1_700_000_000, exp: 1_700_000_120 })
    expect(Buffer.from(claims.jti, "base64url")).toHaveLength(16)
    expect(claims.picture).toBeUndefined()
    expect(firma).toBe(crypto.createHmac("sha256", SECRET).update(`${h}.${c}`).digest("base64url"))
  })
})

describe("utilidades", () => {
  it("enmascara el correo", () => {
    expect(enmascararCorreo("usuario@gmail.com")).toBe("u***@gmail.com")
  })
  it("PKCE S256 (ejemplo del RFC 7636)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })
  it("agrega parámetros con ? o &", () => {
    expect(conParametros("https://a.cl/cliente/google", { token: "x" })).toBe("https://a.cl/cliente/google?token=x")
    expect(conParametros("https://a.cl/cliente/google?m=1", { error: "google" })).toBe("https://a.cl/cliente/google?m=1&error=google")
  })
})
