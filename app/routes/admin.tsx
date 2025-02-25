import { useState } from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useNavigation } from "@remix-run/react";
import { requireAdmin } from "~/utils/session.server";
import { db } from "~/utils/db.server";

type LoaderData = {
  user: {
    id: number;
    username: string;
    fullName: string;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireAdmin(request);
  
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

export default function AdminLayout() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Kiểm tra đường dẫn hiện tại để xác định menu item đang active
  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "w-64" : "w-20"
        } bg-white shadow-md z-10 transition-all duration-300 ease-in-out`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <div className={`${isSidebarOpen ? "flex" : "hidden"} items-center`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span className="ml-2 text-lg font-semibold text-gray-800">Quầy Thuốc</span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md hover:bg-gray-100 focus:outline-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                )}
              </svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4">
            <nav className="px-2 space-y-1">
              <Link
                to="/admin"
                className={`${
                  isActive("/admin") && !isActive("/admin/cabinets") && !isActive("/admin/categories") && !isActive("/admin/units") && !isActive("/admin/products") && !isActive("/admin/suppliers") && !isActive("/admin/purchase-orders")  ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin") && !isActive("/admin/cabinets") && !isActive("/admin/categories") && !isActive("/admin/units") && !isActive("/admin/products") && !isActive("/admin/suppliers") && !isActive("/admin/purchase-orders") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {isSidebarOpen && <span>Tổng quan</span>}
              </Link>

              <Link
                to="/admin/cabinets"
                className={`${
                  isActive("/admin/cabinets") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/cabinets") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                {isSidebarOpen && <span>Quản lý tủ hàng</span>}
              </Link>
              
              <Link
                to="/admin/categories"
                className={`${
                  isActive("/admin/categories") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/categories") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {isSidebarOpen && <span>Danh mục</span>}
              </Link>
              <Link
                to="/admin/units"
                className={`${
                  isActive("/admin/units") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/units") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {isSidebarOpen && <span>Đơn vị</span>}
              </Link>
              
              <Link
                to="/admin/products"
                className={`${
                  isActive("/admin/products") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/products") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {isSidebarOpen && <span>Sản phẩm</span>}
              </Link>
              
              <Link
                to="/admin/suppliers"
                className={`${
                  isActive("/admin/suppliers") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/suppliers") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {isSidebarOpen && <span>Nhà cung cấp</span>}
              </Link>
              
              <Link
                to="/admin/purchase-orders"
                className={`${
                  isActive("/admin/purchase-orders") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/purchase-orders") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {isSidebarOpen && <span>Nhập hàng</span>}
              </Link>
              
              <Link
                to="/admin/invoices"
                className={`${
                  isActive("/admin/invoices") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/invoices") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isSidebarOpen && <span>Hóa đơn</span>}
              </Link>
              
              <Link
                to="/admin/staff"
                className={`${
                  isActive("/admin/staff") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/staff") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                {isSidebarOpen && <span>Nhân viên</span>}
              </Link>
              
              <Link
                to="/admin/reports"
                className={`${
                  isActive("/admin/reports") ? 
                  "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`${
                  isActive("/admin/reports") ? 
                  "text-indigo-500" : "text-gray-500"
                } mr-3 flex-shrink-0 h-6 w-6`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {isSidebarOpen && <span>Báo cáo</span>}
              </Link>
            </nav>
          </div>
          
          <div className="p-4 border-t">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="font-medium text-indigo-800">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              {isSidebarOpen && (
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700">{user.fullName}</p>
                  <div className="flex space-x-2 text-xs text-gray-500">
                    <Link to="/admin/profile" className="hover:text-indigo-600">
                      Hồ sơ
                    </Link>
                    <span>|</span>
                    <Link to="/logout" className="hover:text-indigo-600">
                      Đăng xuất
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm z-10">
          <div className="h-16 px-4 flex items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-800">
                Quản lý quầy thuốc
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                to="/pos" 
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Bán hàng
              </Link>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto bg-gray-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
