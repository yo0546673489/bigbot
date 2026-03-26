import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Inter } from "next/font/google";
import { HydrationGuard } from "@/components/HydrationGuard";
import AuthInitializer from "@/components/auth/AuthInitializer";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Toaster />
        <HydrationGuard>
          <AuthInitializer>
            {children}
          </AuthInitializer>
        </HydrationGuard>
      </body>
    </html>
  );
}
