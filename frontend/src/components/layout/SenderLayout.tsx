import { Outlet } from "react-router";
import AppFooter from "./AppFooter";

export default function SenderLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
