import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Correo",     type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.activo) return null

        const ok = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!ok) return null

        return { id: user.id, name: user.nombre, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role
      return token
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role as string
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
