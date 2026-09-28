import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { TravelAssistant } from "../assistant/TravelAssistant";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <TravelAssistant />
    </div>
  );
}
