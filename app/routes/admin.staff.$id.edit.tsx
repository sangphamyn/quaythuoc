import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const userId = params.id;
  
  if (!userId || isNaN(Number(userId))) {
    throw json({ message: "Mã nhân viên không hợp lệ" }, { status: 400 });
  }
  
  const user = await db.user.findUnique({
    where: {
      id: Number(userId),
    },
  });
  
  if (!user) {
    throw json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
  }
  
  return json({ user });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const userId = params.id;
  
  if (!userId || isNaN(Number(userId))) {
    return json({ success: false, error: "Mã nhân viên không hợp lệ" }, { status: 400 });
  }
  
  const formData = await request.formData();
  
  // Get form data
  const fullName = formData.get("fullName") as string;
  const role = formData.get("role") as string;
  const email = formData.get("email") as string || null;
  const phone = formData.get("phone") as string || null;
  
  // Validate required fields
  if (!fullName || !role) {
    return json(
      { success: false, error: "Vui lòng nhập đầy đủ thông tin bắt buộc" },
      { status: 400 }
    );
  }
  
  try {
    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id: Number(userId) },
    });
    
    if (!existingUser) {
      return json(
        { success: false, error: "Không tìm thấy nhân viên" },
        { status: 404 }
      );
    }
    
    // Check if email already exists (if changed)
    if (email && email !== existingUser.email) {
      const existingEmail = await db.user.findFirst({
        where: { 
          email,
          id: { not: Number(userId) }
        },
      });
      
      if (existingEmail) {
        return json(
          { success: false, error: "Email đã được sử dụng bởi tài khoản khác" },
          { status: 400 }
        );
      }
    }
    
    // Update user
    await db.user.update({
      where: { id: Number(userId) },
      data: {
        fullName,
        role,
        email,
        phone,
      },
    });
    
    return redirect(`/admin/staff/${userId}?toast=Đã cập nhật thông tin nhân viên thành công`);
  } catch (error) {
    console.error("Error updating user:", error);
    return json(
      { success: false, error: "Lỗi khi cập nhật thông tin nhân viên" },
      { status: 500 }
    );
  }
};

export default function EditStaff() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chỉnh sửa nhân viên</h1>
        <Link
          to={`/admin/staff/${user.id}`}
          className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span>Quay lại</span>
        </Link>
      </div>
      
      {actionData?.error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{actionData.error}</p>
        </div>
      )}
      
      <div className="bg-white shadow-md rounded-md overflow-hidden">
        <div className="p-6">
          <Form method="post">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Tên đăng nhập
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  defaultValue={user.username}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500">Không thể thay đổi tên đăng nhập</p>
              </div>
              
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  defaultValue={user.fullName}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  defaultValue={user.email || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  id="phone"
                  name="phone"
                  defaultValue={user.phone || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                  Vai trò <span className="text-red-500">*</span>
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue={user.role}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="ADMIN">Quản trị viên</option>
                  <option value="STAFF">Nhân viên</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="createdAt" className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày tạo
                </label>
                <input
                  type="text"
                  id="createdAt"
                  defaultValue={new Date(user.createdAt).toLocaleDateString("vi-VN")}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Link
                to={`/admin/staff/${user.id}/change-password`}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-md mr-3"
              >
                Đổi mật khẩu
              </Link>
              
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
                disabled={isLoading}
              >
                {isLoading ? "Đang xử lý..." : "Lưu thay đổi"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
