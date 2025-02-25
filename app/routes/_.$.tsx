import { useLocation } from "@remix-run/react";

export async function loader() {
  throw new Response("Not found", { status: 404 });
}

export default function NotFound() {
  return <ErrorBoundary />;
}

export function ErrorBoundary() {
  const location = useLocation();
  return (
    <div className="p-5 text-center">
      <div className="text-[100px]">404</div>
      <div className="text-2xl">Trang không tồn tại</div>
      <div className="mt-5">
        <a
          href="/"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Quay lại trang chủ
        </a>
      </div>
    </div>
  );
}
