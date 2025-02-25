import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Unauthorized - Pharmacy Management System" },
    { name: "description", content: "Unauthorized access page" }
  ];
};

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Không có quyền truy cập
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Bạn không có quyền truy cập vào trang này
          </p>
        </div>
        
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Quay lại trang đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
