import { useState } from "react";
import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useNavigation } from "@remix-run/react";
import { getUserSession, requireAdmin } from "~/utils/session.server";
import { db } from "~/utils/db.server";
import SalesHeader from "~/components/SalesHeader";

type LoaderData = {
  user: {
    id: number;
    username: string;
    fullName: string;
    role: string;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const user1 = await getUserSession(request);
  if (user1.get('userRole') !== 'STAFF' && user1.get('userRole') !== 'ADMIN') {
    return redirect('/');
  }
  
  const user = await db.user.findUnique({
    where: { id: user1.get('userId') },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  return json<LoaderData>({ user });
};

export default function SalesLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <>
      <SalesHeader user={user} />
      <Outlet />
    </>
  );
}
