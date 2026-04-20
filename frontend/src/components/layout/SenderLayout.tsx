import { Link, Outlet } from "react-router";
import logoUrl from "../../assets/logos/logo.png";
import AppFooter from "./AppFooter";

export default function SenderLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas pb-12 text-ink antialiased">
      <header className="sticky top-0 z-20 border-b border-surface-sand-deep bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex items-center">
            <img src={logoUrl} alt="FurDrop" className="h-9" />
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
