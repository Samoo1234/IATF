# ARQUITETURA DE API E INTEGRAÇÃO SUPABASE — API_ARCHITECTURE.md

## 1. Visão Geral

A arquitetura de API utiliza o Next.js App Router combinando **Server Components** para renderização otimizada no servidor, **Server Actions** para mutações seguras e o cliente `@supabase/supabase-js` configurado com **SSR**.

---

## 2. Camadas da Aplicação

```text
Next.js App Router (React 19 / TypeScript)
 ├── UI Layer (Client Components / shadcn/ui)
 ├── Data Fetching Layer (Server Components / React Cache)
 ├── Mutation Layer (Server Actions com Validação Zod)
 └── Supabase Client Layer (@supabase/ssr)
       │
       ▼
 Supabase Backend (PostgreSQL + RLS + Auth + Storage)
```

---

## 3. Estrutura do Cliente Supabase (`src/lib/supabase/`)

### 3.1. Cliente de Servidor (`src/lib/supabase/server.ts`)
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Chamada de Server Component
          }
        },
      },
    }
  )
}
```

### 3.2. Cliente de Navegador (`src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## 4. Diretrizes de Segurança de Segredos
- A chave `SUPABASE_SERVICE_ROLE_KEY` é estritamente proibida no cliente de navegador (`browser client`) e em variáveis públicas `NEXT_PUBLIC_*`.
- Toda mutação sensível ou processamento assíncrono deve ser executado no servidor (Server Action ou Supabase Edge Functions).
