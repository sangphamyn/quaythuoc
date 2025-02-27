import { Link, NavLink, useLocation } from "@remix-run/react";
import {
  HomeIcon,
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  ChartBarIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

type User = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

type AppHeaderProps = {
  user: User;
};

export default function AppHeader({ user }: AppHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="mx-auto px-4">
        <div className="flex justify-between h-16">
          {/* Logo and Desktop Navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-xl font-bold text-blue-600">
                Nhà Thuốc
              </Link>
            </div>
            <nav className="hidden md:ml-8 md:flex md:space-x-2">
              <NavLink
                to="/sales"
                className={
                  `px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                    isActive('/sales') && !isActive('/sales/history')
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`
                }
              >
                <ShoppingCartIcon className="h-5 w-5 mr-1" />
                Bán hàng
              </NavLink>
              <NavLink
                to="/sales/history"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`
                }
              >
                <ClockIcon className="h-5 w-5 mr-1" />
                Lịch sử bán hàng
              </NavLink>
              {user.role === "ADMIN" && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`
                  }
                >
                  <Cog6ToothIcon className="h-5 w-5 mr-1" />
                  Quản lý
                </NavLink>
              )}
            </nav>
          </div>

          {/* User Menu and Logout */}
          <div className="hidden md:flex items-center">
            <div className="relative">
              <div className="flex items-center pr-4 border-r border-gray-200">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-2 overflow-hidden">
                  <span className="font-semibold">{user.fullName.charAt(0)}</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800 truncate max-w-[120px]">
                    {user.fullName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {user.role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}
                  </div>
                </div>
              </div>
            </div>
            <Link
              to="/logout"
              className="ml-4 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 mr-1" />
              Đăng xuất
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={toggleMobileMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
            >
              {mobileMenuOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden ${mobileMenuOpen ? "block" : "hidden"}`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-base font-medium ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex items-center">
              <HomeIcon className="h-5 w-5 mr-2" />
              Tổng quan
            </div>
          </NavLink>
          <NavLink
            to="/sales"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-base font-medium ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex items-center">
              <ShoppingCartIcon className="h-5 w-5 mr-2" />
              Bán hàng
            </div>
          </NavLink>
          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-base font-medium ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex items-center">
              <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
              Hóa đơn
            </div>
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-base font-medium ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex items-center">
              <ClockIcon className="h-5 w-5 mr-2" />
              Lịch sử bán hàng
            </div>
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-base font-medium ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`
            }
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-2" />
              Báo cáo
            </div>
          </NavLink>
          {user.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-base font-medium ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="flex items-center">
                <Cog6ToothIcon className="h-5 w-5 mr-2" />
                Quản lý
              </div>
            </NavLink>
          )}
        </div>

        {/* Mobile User Info */}
        <div className="pt-4 pb-3 border-t border-gray-200">
          <div className="flex items-center px-4">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <span className="font-semibold">{user.fullName.charAt(0)}</span>
              </div>
            </div>
            <div className="ml-3">
              <div className="text-base font-medium text-gray-800">
                {user.fullName}
              </div>
              <div className="text-sm text-gray-500">
                {user.role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}
              </div>
            </div>
          </div>
          <div className="mt-3 px-2">
            <Link
              to="/logout"
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="flex items-center">
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Đăng xuất
              </div>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
