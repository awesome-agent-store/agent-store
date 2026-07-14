import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { ClientStateProvider } from '@/components/ClientStateProvider'
import { Header } from '@/components/Header'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agent-store-alpha.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Agent Store — skills, MCP servers & providers for Claude Code / Codex',
    template: '%s · Agent Store',
  },
  description:
    '一个入口，装齐所有 Agent 能力。发现并一键安装 Claude Code / Codex 的技能、MCP 服务器与模型供应商，本地代理统一转发、自动降级。',
  openGraph: {
    type: 'website',
    siteName: 'Agent Store',
    url: SITE_URL,
    title: 'Agent Store — skills, MCP servers & providers for AI coding agents',
    description: '发现并一键安装 Claude Code / Codex 的技能、MCP 与供应商。',
  },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({
  children,
  drawer,
}: {
  children: React.ReactNode
  drawer: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const user = await getCurrentUser()

  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-store-content text-store-text antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientStateProvider>
            <div className="flex min-h-screen flex-col">
              <Header user={user} />
              <div className="flex-1">{children}</div>
            </div>
            {drawer}
          </ClientStateProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
