import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useNavigation } from "@remix-run/react";
import { requireStaff } from "~/utils/session.server";
import { db } from "~/utils/db.server";

type LoaderData = {
  user: {
    id: number;
    username: string;
    fullName: string;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireStaff(request);
  
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      fullName: true,
    },
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  return json<LoaderData>({ user });
};

export default function POSLayout() {
  const { user } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <h1 className="ml-2 text-xl font-semibold text-gray-800">
                Quầy Thuốc - Hệ thống bán hàng
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="font-medium text-indigo-800">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user.fullName}</p>
                <p className="text-xs text-gray-500">Nhân viên bán hàng</p>
              </div>
            </div>
            <div className="h-8 border-l border-gray-300"></div>
            <Link
              to="/logout"
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              Đăng xuất
            </Link>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-4 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <Link
              to="/pos"
              className="border-indigo-500 text-indigo-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm"
              preventScrollReset={true}
            >
              Bán hàng
            </Link>
            <Link
              to="/pos/history"
              className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm"
            >
              Lịch sử bán hàng
            </Link>
          </nav>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-white shadow-sm-up border-t border-gray-200 py-3 px-4">
        <div className="text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Hệ thống quản lý quầy thuốc. Phiên bản 1.0.0
        </div>
      </footer>
    </div>
  );
}
