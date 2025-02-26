import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useRef } from "react";
import { db } from "~/utils/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  
  // Get form data
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const fullName = formData.get("fullName") as string;
  const role = formData.get("role") as string;
  const email = formData.get("email") as string || null;
  const phone = formData.get("phone") as string || null;
  
  // Validate required fields
  if (!username || !password || !confirmPassword || !fullName || !role) {
    return json(
      { success: false, error: "Vui lòng nhập đầy đủ thông tin bắt buộc" },
      { status: 400 }
    );
  }
  
  // Validate password
  if (password.length < 6) {
    return json(
      { success: false, error: "Mật khẩu phải có ít nhất 6 ký tự" },
      { status: 400 }
    );
  }
  
  // Validate password confirmation
  if (password !== confirmPassword) {
    return json(
      { success: false, error: "Mật khẩu xác nhận không khớp" },
      { status: 400 }
    );
  }
  
  try {
    // Check if username already exists
    const existingUser = await db.user.findUnique({
      where: { username },
    });
    
    if (existingUser) {
      return json(
        { success: false, error: "Tên đăng nhập đã tồn tại" },
        { status: 400 }
      );
    }
    
    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await db.user.findFirst({
        where: { email },
      });
      
      if (existingEmail) {
        return json(
          { success: false, error: "Email đã được sử dụng" },
          { status: 400 }
        );
      }
    }
    
    // Hash the password
    const hashedPassword = password;
    
    // Create new user
    const newUser = await db.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        role,
        email,
        phone,
      },
    });
    
    return redirect(`/admin/staff/${newUser.id}?toast=Đã tạo nhân viên thành công`);
  } catch (error) {
    console.error("Error creating user:", error);
    return json(
      { success: false, error: "Lỗi khi tạo nhân viên mới" },
      { status: 500 }
    );
  }
};

export default function CreateStaff() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  // Refs for form fields
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Thêm nhân viên mới</h1>
        <Link
          to="/admin/staff"
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
                  Tên đăng nhập <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  ref={usernameRef}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  ref={fullNameRef}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  ref={passwordRef}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-500">Tối thiểu 6 ký tự</p>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Xác nhận mật khẩu <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
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
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Chọn vai trò</option>
                  <option value="ADMIN">Quản trị viên</option>
                  <option value="STAFF">Nhân viên</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
                disabled={isLoading}
              >
                {isLoading ? "Đang xử lý..." : "Tạo nhân viên"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
