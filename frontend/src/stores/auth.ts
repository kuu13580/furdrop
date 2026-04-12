import type { User } from "firebase/auth";
import { atom } from "jotai";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: User; registered: boolean };

export const authAtom = atom<AuthState>({ status: "loading" });
