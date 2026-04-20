import { Outlet } from "react-router";
import AppFooter from "./AppFooter";

export default function SenderLayout() {
  return (
    <div className="flex min-h-screen flex-col pb-12">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <AppFooter />
    </div>
  );
}
