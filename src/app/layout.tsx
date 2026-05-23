import type { Metadata } from 'next'
import { Caveat, Lora, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const caveat = Caveat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
})

const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Gamebook Helper',
  description: 'A helper application for gamebook adventures',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-GB" className={`${caveat.variable} ${lora.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-canvas-bg text-text-primary">{children}</body>
    </html>
  )
}
