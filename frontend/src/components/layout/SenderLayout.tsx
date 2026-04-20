import { Outlet } from "react-router";
import AppFooter from "./AppFooter";

export default function SenderLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas pb-12 text-ink antialiased">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
