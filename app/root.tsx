import { json, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useNavigate
} from "@remix-run/react";
import { getUserRole, getUserId } from "./utils/session.server";
import "./tailwind.css";
import { useEffect } from "react";
import { UserRole } from "@prisma/client";


type LoaderData = {
  isAuthenticated: boolean;
  userRole: UserRole | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  const userRole = await getUserRole(request);
  
  const data: LoaderData = {
    isAuthenticated: userId !== null,
    userRole: userRole,
  };
  
  return json(data);
}

export default function App() {
  const { isAuthenticated, userRole } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  
  // Điều hướng người dùng dựa trên trạng thái đăng nhập và vai trò
  useEffect(() => {
    // Nếu đường dẫn hiện tại là "/" (trang chủ)
    if (window.location.pathname === "/") {
      if (!isAuthenticated) {
        // Nếu chưa đăng nhập, chuyển đến trang đăng nhập
        navigate("/login");
      } else {
        // Nếu đã đăng nhập, chuyển đến trang tương ứng với vai trò
        if (userRole === UserRole.ADMIN) {
          navigate("/admin");
        } else if (userRole === UserRole.STAFF) {
          navigate("/pos");
        }
      }
    }
  }, [isAuthenticated, userRole, navigate]);
  
  return (
    <html lang="vi" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <html>
      <head>
        <title>Lỗi!</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Đã xảy ra lỗi
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                {/* {error.message} */}
              </p>
              <div className="mt-5">
                <a
                  href="/"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Quay lại trang chủ
                </a>
              </div>
            </div>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

export function CatchBoundary() {
  return (
    <html>
      <head>
        <title>Không tìm thấy</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Không tìm thấy trang
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
              </p>
              <div className="mt-5">
                <a
                  href="/"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Quay lại trang chủ
                </a>
              </div>
            </div>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
