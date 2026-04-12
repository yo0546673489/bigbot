import "./globals.css";
import { Toaster } from "react-hot-toast";
import { HydrationGuard } from "@/components/HydrationGuard";
import AuthInitializer from "@/components/auth/AuthInitializer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: "'Heebo', Arial, Helvetica, sans-serif" }}>
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
