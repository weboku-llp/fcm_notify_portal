import "./globals.css";
import type { Metadata } from "next";
import { ProjectProvider } from "@/components/ProjectContext";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Notif Portal",
  description: "Multi-project FCM notification management portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ProjectProvider>
          <Shell>{children}</Shell>
        </ProjectProvider>
      </body>
    </html>
  );
}
