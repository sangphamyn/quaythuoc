import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { logout } from "~/utils/session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return logout(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return logout(request);
};
