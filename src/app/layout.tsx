import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  )
}
