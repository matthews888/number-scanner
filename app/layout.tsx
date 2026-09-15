import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Number Scanner',
  description: 'Extract phone numbers from screenshots and export them as CSV.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
