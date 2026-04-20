import { Outlet } from "react-router";
import AppFooter from "./AppFooter";

export default function SenderLayout() {
  return (
    <div className="grid min-h-screen grid-rows-[1fr_auto]">
      <div className="flex flex-col">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
