import { useState, useEffect } from "react";
import { ActionFunctionArgs, json, MetaFunction } from "@remix-run/node";
import { Form, useActionData, useNavigation, Link } from "@remix-run/react";
import { UserRole } from "@prisma/client";
import { AuthService } from "~/utils/auth.server";
import { motion } from "framer-motion";

interface ActionErrors {
  username?: string;
  password?: string;
  role?: string;
  login?: string;
}

type ActionData = {
  errors?: ActionErrors;
};

export const meta: MetaFunction = () => {
  return [
    { title: "Đăng nhập - Pharmacy Management System" },
    { name: "description", content: "Đăng nhập vào hệ thống quản lý quầy thuốc" }
  ];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const username = formData.get("username") as string | null;
  const password = formData.get("password") as string | null;
  const role = formData.get("role") as UserRole | null;

  // Validate form
  const errors: ActionErrors = {};
  if (!username) errors.username = "Username là bắt buộc";
  if (!password) errors.password = "Password là bắt buộc";
  if (!role) errors.role = "Vui lòng chọn vai trò đăng nhập";

  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return json<ActionData>({ errors });
  }

  try {
    // Xử lý đăng nhập với AuthService
    console.log(await AuthService.authenticate({
      username: username!,
      password: password!,
      role: role!,
    }));
    return await AuthService.authenticate({
      username: username!,
      password: password!,
      role: role!,
    });
  } catch (error) {
    return json<ActionData>({
      errors: {
        login: "Có lỗi xảy ra khi đăng nhập",
      },
    });
  }
};

export default function Login() {
  const actionData = useActionData<ActionData>();
  console.log('actionData', actionData);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);

  useEffect(() => {
    // Hiệu ứng fade-in cho form khi trang load xong
    const timer = setTimeout(() => {
      setShowForm(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-50">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-80 h-80 bg-yellow-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-20 w-80 h-80 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 max-w-md w-full"
      >
        <div className="bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-gray-100">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex justify-center mb-4"
            >
              <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-3xl font-bold text-gray-800 tracking-tight"
            >
              Pharmacy Management
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-1 text-sm text-gray-600"
            >
              Đăng nhập để quản lý quầy thuốc của bạn
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: showForm ? 1 : 0, y: showForm ? 0 : 20 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <Form method="post" className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Tên đăng nhập
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors duration-200"
                    placeholder="Tên đăng nhập"
                  />
                </div>
                {actionData?.errors?.username && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.username}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Mật khẩu
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
					defaultValue="password123"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors duration-200"
                    placeholder="Mật khẩu"
                  />
                </div>
                {actionData?.errors?.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.password}
                  </p>
                )}
              </div>

              {actionData?.errors?.login && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        {actionData.errors.login}
                      </h3>
                    </div>
                  </div>
                </div>
              )}
              
              {actionData?.errors?.role && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        {actionData.errors.role}
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              <input type="hidden" name="role" value={selectedRole || ""} />

              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Đăng nhập với vai trò</div>
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => setSelectedRole(UserRole.ADMIN)}
                    className={`relative w-full inline-flex items-center justify-center px-4 py-3 rounded-lg 
                      text-sm font-medium  transition-all duration-200
                      ${selectedRole === UserRole.ADMIN
                        ? "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg"
                        : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
                      } focus:ring-indigo-500`}
                  >
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${selectedRole === UserRole.ADMIN ? "text-white" : "text-indigo-600"} mr-2`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      QUẢN LÝ
                    </div>
                    {selectedRole === UserRole.ADMIN && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", duration: 0.5 }}
                        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-indigo-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </motion.span>
                    )}
                  </motion.button>
                  
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => setSelectedRole(UserRole.STAFF)}
                    className={`relative w-full inline-flex items-center justify-center px-4 py-3 rounded-lg
                      text-sm font-medium  transition-all duration-200
                      ${selectedRole === UserRole.STAFF
                        ? "bg-gradient-to-r from-green-600 to-teal-500 hover:from-green-700 hover:to-teal-600 text-white shadow-lg"
                        : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
                      } focus:ring-green-500`}
                  >
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${selectedRole === UserRole.STAFF ? "text-white" : "text-green-600"} mr-2`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                      BÁN HÀNG
                    </div>
                    {selectedRole === UserRole.STAFF && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", duration: 0.5 }}
                        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-green-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </motion.span>
                    )}
                  </motion.button>
                </div>
              </div>

              <div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSubmitting || !selectedRole}
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm 
                    text-sm font-medium text-white ${selectedRole 
                    ? 'bg-indigo-600 hover:bg-indigo-700  focus:ring-indigo-500' 
                    : 'bg-gray-400 cursor-not-allowed'} transition-colors duration-200`}
                >
                  {isSubmitting ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    "Đăng nhập"
                  )}
                </motion.button>
              </div>
            </Form>
          </motion.div>
        </div>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-4 text-center text-xs text-gray-600"
        >
          &copy; {new Date().getFullYear()} Pharmacy Management System. All rights reserved.
        </motion.p>
      </motion.div>
    </div>
  );
}
