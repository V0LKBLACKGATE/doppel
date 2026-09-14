import './globals.css';

export const metadata = { title: 'Doppel', description: 'Clone e rebrand de sites com IA' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}
