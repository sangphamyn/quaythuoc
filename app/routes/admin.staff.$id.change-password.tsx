import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useRef } from "react";
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
    select: {
      id: true,
      username: true,
      fullName: true,
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
  
  // Get current password and new passwords
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  
  // Validate inputs
  if (!currentPassword || !newPassword || !confirmPassword) {
    return json(
      { success: false, error: "Vui lòng nhập đầy đủ thông tin" },
      { status: 400 }
    );
  }
  
  if (newPassword.length < 6) {
    return json(
      { success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự" },
      { status: 400 }
    );
  }
  
  if (newPassword !== confirmPassword) {
    return json(
      { success: false, error: "Mật khẩu xác nhận không khớp với mật khẩu mới" },
      { status: 400 }
    );
  }
  
  try {
    // Get user with password
    const user = await db.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        password: true,
      },
    });
    
    if (!user) {
      return json(
        { success: false, error: "Không tìm thấy nhân viên" },
        { status: 404 }
      );
    }
    
    // Verify current password
    const passwordValid = currentPassword == user.password;
    
    if (!passwordValid) {
      return json(
        { success: false, error: "Mật khẩu hiện tại không đúng" },
        { status: 400 }
      );
    }
    
    // Hash new password
    const hashedPassword = newPassword;
    
    // Update user password
    await db.user.update({
      where: { id: Number(userId) },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });
    
    return redirect(`/admin/staff/${userId}`);
  } catch (error) {
    console.error("Error changing password:", error);
    return json(
      { success: false, error: "Lỗi khi đổi mật khẩu" },
      { status: 500 }
    );
  }
};

export default function ChangePassword() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  
  // Refs for form fields
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Đổi mật khẩu</h1>
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
      
      <div className="bg-white shadow-md rounded-md overflow-hidden max-w-2xl mx-auto">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Đổi mật khẩu cho: {user.fullName}
            </h2>
            <p className="text-sm text-gray-600">
              Tài khoản: {user.username}
            </p>
          </div>
          
          <Form method="post">
            <div className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu hiện tại <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  ref={currentPasswordRef}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  ref={newPasswordRef}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-500">Mật khẩu phải có ít nhất 6 ký tự</p>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  ref={confirmPasswordRef}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span>Đổi mật khẩu</span>
                  </>
                )}
              </button>
            </div>
          </Form>
          
          <div className="mt-8 border-t border-gray-200 pt-4">
            <div className="text-sm text-gray-600">
              <p className="font-semibold mb-2">Lưu ý về bảo mật:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Mật khẩu nên bao gồm ít nhất 8 ký tự</li>
                <li>Nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt</li>
                <li>Không sử dụng mật khẩu đã dùng cho các tài khoản khác</li>
                <li>Không chia sẻ mật khẩu với người khác</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
