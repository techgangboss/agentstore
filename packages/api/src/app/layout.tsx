export const metadata = {
  title: 'AgentStore API',
  description: 'Claude Code Plugin Marketplace API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
